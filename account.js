/* ============================================================
 * Luna Executive Chauffeurs — Account module (window.LunaAccount)
 * ============================================================
 * Reads / writes the authenticated user's own data in RTDB:
 *   - Profile record at /users/{uid}
 *   - Reservations via /userReservations/{uid} index -> /reservations/{rideId}
 *   - Close-account flow (soft-delete profile, keep reservations
 *     for the 7-year tax/IRS retention window)
 *
 * Assumes LunaAuth has already initialized. Every method that
 * needs an authenticated user will throw a deterministic
 * { ok:false, code:"luna/not-authenticated" } result instead of
 * a Firebase UNAUTHENTICATED stack trace.
 *
 * Public surface (window.LunaAccount):
 *   getProfile()                 -> Promise<Result<profile>>
 *   updateProfile(partial)       -> Promise<Result>
 *   getReservations()            -> Promise<Result<{upcoming,past}>>
 *   createReservation(payload)   -> Promise<Result<{rideId}>>  (bonus)
 *   cancelReservation(rideId)    -> Promise<Result>
 *   closeAccount()               -> Promise<Result>
 *
 * Result shape mirrors LunaAuth:
 *   { ok:true,  data }   |   { ok:false, code, message }
 * ============================================================ */

import { auth, db, serverTimestamp } from "./firebase.js";
import { ensureProfileRecord } from "./auth.js";
import {
  ref,
  get,
  update,
  push,
  remove,
  query,
  orderByChild
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { deleteUser } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

/* ------------------------------------------------------------
 * Shared helpers (result shape, guards, phone normalization).
 * ------------------------------------------------------------ */
function ok(data) { return { ok: true, data }; }
function fail(code, message) {
  return { ok: false, code, message: message || "Something went wrong. Try again." };
}

function requireUser() {
  const u = auth.currentUser;
  if (!u) return { error: fail("luna/not-authenticated", "Please sign in again") };
  return { user: u };
}

/* Re-export of the phone normalizer so account.js is self-
 * contained. If LunaAuth is loaded, we defer to it so a single
 * update to the parser propagates everywhere. */
function normalizePhone(raw) {
  if (typeof window !== "undefined" && window.LunaAuth && window.LunaAuth.normalizePhone) {
    return window.LunaAuth.normalizePhone(raw);
  }
  if (!raw || typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (digits.length >= 10 && digits.length <= 15) return "+" + digits;
  if (/^\+\d{8,15}$/.test(raw.trim())) return raw.trim();
  return null;
}

/* Whitelist of profile fields the client can update directly.
 * Anything else (createdAt, uid, etc.) is server-owned. */
const EDITABLE_PROFILE_FIELDS = new Set([
  "displayName",
  "phone",
  "preferences"
]);

/* ------------------------------------------------------------
 * getProfile — returns the RTDB record, auto-healing if missing.
 * ------------------------------------------------------------ */
async function getProfile() {
  const { user, error } = requireUser();
  if (error) return error;

  try {
    // Auto-heal: if signup write was interrupted, recreate the record
    // before handing it back.
    await ensureProfileRecord(user);

    const snap = await get(ref(db, `users/${user.uid}`));
    const data = snap.val() || {};
    return ok({
      uid: user.uid,
      email: data.email || user.email || null,
      displayName: data.displayName || user.displayName || null,
      phone: data.phone || null,
      preferences: data.preferences || {
        defaultVehicle: null,
        defaultPickup: null,
        smsEnabled: true,
        emailMarketing: false,
        language: "en"
      },
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null
    });
  } catch (err) {
    return fail(err.code || "luna/read-failed", "Could not load your profile");
  }
}

/* ------------------------------------------------------------
 * updateProfile — whitelist merge, updates phoneIndex if phone
 * changed, always stamps updatedAt.
 * ------------------------------------------------------------ */
async function updateProfile(partial) {
  const { user, error } = requireUser();
  if (error) return error;
  if (!partial || typeof partial !== "object") {
    return fail("luna/invalid-payload", "Nothing to update");
  }

  const updates = {};
  let newPhone = null;
  let oldPhone = null;

  // Apply whitelist + per-field validation.
  for (const [key, value] of Object.entries(partial)) {
    if (!EDITABLE_PROFILE_FIELDS.has(key)) continue;

    if (key === "phone") {
      const normalized = normalizePhone(value);
      if (!normalized) return fail("luna/invalid-phone", "Phone number doesn't look right");
      newPhone = normalized;
      updates[`/users/${user.uid}/phone`] = normalized;
    } else if (key === "preferences") {
      // Shallow merge only. Individual pref fields go to their own paths
      // so a partial update doesn't wipe the whole block.
      if (!value || typeof value !== "object") continue;
      for (const [prefKey, prefVal] of Object.entries(value)) {
        updates[`/users/${user.uid}/preferences/${prefKey}`] = prefVal;
      }
    } else {
      updates[`/users/${user.uid}/${key}`] = value;
    }
  }

  if (Object.keys(updates).length === 0) {
    return fail("luna/invalid-payload", "No editable fields in update");
  }

  updates[`/users/${user.uid}/updatedAt`] = serverTimestamp();

  // If phone changed, flip the phoneIndex entries atomically.
  if (newPhone) {
    try {
      const snap = await get(ref(db, `users/${user.uid}/phone`));
      oldPhone = snap.val();
    } catch (_) { /* best-effort — index cleanup is not load-bearing */ }
    if (oldPhone && oldPhone !== newPhone) {
      updates[`/phoneIndex/${encodeURIComponent(oldPhone)}`] = null;
    }
    updates[`/phoneIndex/${encodeURIComponent(newPhone)}`] = user.uid;
  }

  try {
    await update(ref(db), updates);
    return ok({ updated: Object.keys(partial) });
  } catch (err) {
    return fail(err.code || "luna/write-failed", "Could not save your changes");
  }
}

/* ------------------------------------------------------------
 * getReservations — reads the user-scoped index, then fans out
 * the individual reservation fetches in parallel. Splits upcoming
 * vs past by pickup datetime (falls back to createdAt if pickup
 * is missing — defensive).
 * ------------------------------------------------------------ */
async function getReservations() {
  const { user, error } = requireUser();
  if (error) return error;

  try {
    const indexSnap = await get(ref(db, `userReservations/${user.uid}`));
    if (!indexSnap.exists()) {
      return ok({ upcoming: [], past: [] });
    }
    const ids = Object.keys(indexSnap.val() || {});
    if (ids.length === 0) return ok({ upcoming: [], past: [] });

    const fetches = ids.map(id =>
      get(ref(db, `reservations/${id}`)).then(s => (s.exists() ? { id, ...s.val() } : null))
    );
    const rows = (await Promise.all(fetches)).filter(Boolean);

    const now = Date.now();
    const upcoming = [];
    const past = [];

    for (const r of rows) {
      const pickupIso = r && r.pickup && r.pickup.datetime;
      const pickupMs = pickupIso ? Date.parse(pickupIso) : NaN;
      const anchor = Number.isFinite(pickupMs) ? pickupMs : (r.createdAt || 0);

      // "Completed" and "cancelled" never surface as upcoming, even
      // if the pickup is in the future (rare but possible if the
      // ride got cancelled after being scheduled).
      const terminal = r.status === "completed" || r.status === "cancelled";

      if (!terminal && anchor >= now) upcoming.push(r);
      else past.push(r);
    }

    // Sort: upcoming by soonest first, past by most recent first.
    upcoming.sort((a, b) => Date.parse(a.pickup?.datetime || 0) - Date.parse(b.pickup?.datetime || 0));
    past.sort((a, b) => Date.parse(b.pickup?.datetime || 0) - Date.parse(a.pickup?.datetime || 0));

    return ok({ upcoming, past });
  } catch (err) {
    return fail(err.code || "luna/read-failed", "Could not load your reservations");
  }
}

/* ------------------------------------------------------------
 * getReservation — single ride by ID, scoped to caller's ownership
 * for the receipt / detail page. Rule already rejects other users'
 * reservations server-side; this is just the fast-path for one
 * record.
 * ------------------------------------------------------------ */
async function getReservation(rideId) {
  const { user, error } = requireUser();
  if (error) return error;
  if (!rideId) return fail("luna/invalid-payload", "Missing ride ID");

  try {
    const snap = await get(ref(db, `reservations/${rideId}`));
    if (!snap.exists()) return fail("luna/not-found", "Reservation not found");
    const data = snap.val();
    if (data.userId !== user.uid) return fail("luna/forbidden", "Not your reservation");
    return ok({ id: rideId, ...data });
  } catch (err) {
    return fail(err.code || "luna/read-failed", "Could not load the reservation");
  }
}

/* ------------------------------------------------------------
 * createReservation — used by the authenticated booking flow
 * (bonus item from the brief). Writes the reservation + the user
 * index atomically.
 *
 * Payload schema (minimum viable — extend as needed):
 *   {
 *     vehicleType: string,
 *     pickup:      { address, datetime },
 *     dropoff?:    { address, datetime },
 *     pax:         number,
 *     bags:        number,
 *     notes?:      string
 *   }
 * ------------------------------------------------------------ */
async function createReservation(payload) {
  const { user, error } = requireUser();
  if (error) return error;
  if (!payload || typeof payload !== "object") {
    return fail("luna/invalid-payload", "Missing reservation data");
  }

  // Minimal validation — server rules do the hard enforcement, but
  // we fail fast client-side for better UX.
  const { vehicleType, pickup, dropoff, pax, bags, notes } = payload;
  if (!vehicleType || typeof vehicleType !== "string") {
    return fail("luna/invalid-payload", "Please pick a vehicle");
  }
  if (!pickup || !pickup.address || !pickup.datetime) {
    return fail("luna/invalid-payload", "Pickup address and time are required");
  }
  if (typeof pax !== "number" || pax < 1) {
    return fail("luna/invalid-payload", "At least 1 passenger is required");
  }

  // Reserve a new push key so we can write both index and doc in a
  // single multi-path update (atomic — no orphan writes).
  const rideRef = push(ref(db, "reservations"));
  const rideId = rideRef.key;

  const record = {
    userId: user.uid,
    status: "pending",
    vehicleType: String(vehicleType),
    pickup: {
      address: String(pickup.address),
      datetime: String(pickup.datetime)
    },
    dropoff: dropoff && dropoff.address ? {
      address: String(dropoff.address),
      datetime: dropoff.datetime ? String(dropoff.datetime) : null
    } : null,
    pax: Number(pax),
    bags: Number(bags || 0),
    notes: notes ? String(notes).slice(0, 2000) : "",
    chauffeurUid: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const updates = {
    [`/reservations/${rideId}`]:                 record,
    [`/userReservations/${user.uid}/${rideId}`]: true
  };

  try {
    await update(ref(db), updates);
    return ok({ rideId });
  } catch (err) {
    return fail(err.code || "luna/write-failed", "Could not save your reservation");
  }
}

/* ------------------------------------------------------------
 * cancelReservation — sets status to "cancelled" if and only if
 * the ride belongs to the calling user AND isn't already
 * in-progress/completed. Security rules enforce the same.
 * ------------------------------------------------------------ */
async function cancelReservation(rideId) {
  const { user, error } = requireUser();
  if (error) return error;
  if (!rideId) return fail("luna/invalid-payload", "Missing reservation ID");

  try {
    const snap = await get(ref(db, `reservations/${rideId}`));
    if (!snap.exists()) return fail("luna/not-found", "Reservation not found");
    const data = snap.val();
    if (data.userId !== user.uid) return fail("luna/forbidden", "Not your reservation");
    if (data.status === "in_progress" || data.status === "completed") {
      return fail("luna/too-late", "This ride is already underway");
    }
    await update(ref(db, `reservations/${rideId}`), {
      status: "cancelled",
      updatedAt: serverTimestamp()
    });
    return ok({ rideId, status: "cancelled" });
  } catch (err) {
    return fail(err.code || "luna/write-failed", "Could not cancel the reservation");
  }
}

/* ------------------------------------------------------------
 * closeAccount — soft-delete flow.
 *
 * Requirements from the brief:
 *   - Delete the Firebase Auth user (hard delete).
 *   - Soft-delete the RTDB profile (_deleted timestamp).
 *   - Keep reservations intact — IRS 7-year retention window.
 *
 * Firebase's deleteUser() requires a recent login; if the token
 * is stale we surface auth/requires-recent-login so the UI can
 * route the user through a re-auth prompt. We mark the profile
 * _deleted BEFORE attempting the auth delete so that, even if
 * the auth delete fails, dispatch staff see the account as
 * closed and can follow up manually.
 * ------------------------------------------------------------ */
async function closeAccount() {
  const { user, error } = requireUser();
  if (error) return error;

  try {
    // Pull phone so we can also clean up the phoneIndex.
    let phone = null;
    try {
      const snap = await get(ref(db, `users/${user.uid}/phone`));
      phone = snap.val();
    } catch (_) { /* best effort */ }

    const softDelete = {
      [`/users/${user.uid}/_deleted`]:  serverTimestamp(),
      [`/users/${user.uid}/updatedAt`]: serverTimestamp()
    };
    if (phone) {
      softDelete[`/phoneIndex/${encodeURIComponent(phone)}`] = null;
    }
    await update(ref(db), softDelete);

    // Now the hard delete. If this fails with requires-recent-login,
    // the soft-delete tombstone is already in place, so dispatch can
    // see "closed" even if the auth record lingers.
    try {
      await deleteUser(user);
    } catch (err) {
      if (err && err.code === "auth/requires-recent-login") {
        return fail("auth/requires-recent-login", "Please sign in again to close your account");
      }
      throw err;
    }

    return ok({ closed: true });
  } catch (err) {
    return fail(err.code || "luna/write-failed", "Could not close the account. Try again.");
  }
}

/* ------------------------------------------------------------
 * Saved Places — labelled addresses the user reuses (Home, Office,
 * Brickell apt, etc). Lives at /users/{uid}/savedPlaces/{placeId}.
 * The users/{uid} rule already permits self-writes, so no server
 * rule changes are required.
 *
 * Shape of each entry:
 *   { label, address, createdAt }
 * ------------------------------------------------------------ */
async function getSavedPlaces() {
  const { user, error } = requireUser();
  if (error) return error;
  try {
    const snap = await get(ref(db, `users/${user.uid}/savedPlaces`));
    const raw  = snap.val() || {};
    // Return as an array sorted newest-first for predictable rendering.
    const list = Object.entries(raw).map(([id, v]) => ({ id, ...v }));
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return ok(list);
  } catch (err) {
    return fail(err.code || "luna/read-failed", "Could not load saved places");
  }
}

async function addSavedPlace(payload) {
  const { user, error } = requireUser();
  if (error) return error;
  if (!payload || typeof payload !== "object") {
    return fail("luna/invalid-payload", "Missing address data");
  }
  const label   = String(payload.label   || "").trim().slice(0, 60);
  const address = String(payload.address || "").trim().slice(0, 400);
  if (!label)   return fail("luna/invalid-payload", "Give the address a short label");
  if (!address) return fail("luna/invalid-payload", "Address cannot be empty");

  const placeRef = push(ref(db, `users/${user.uid}/savedPlaces`));
  try {
    await update(placeRef, { label, address, createdAt: serverTimestamp() });
    return ok({ id: placeRef.key, label, address });
  } catch (err) {
    return fail(err.code || "luna/write-failed", "Could not save this address");
  }
}

async function deleteSavedPlace(placeId) {
  const { user, error } = requireUser();
  if (error) return error;
  if (!placeId) return fail("luna/invalid-payload", "Missing place ID");
  try {
    await remove(ref(db, `users/${user.uid}/savedPlaces/${placeId}`));
    return ok({ id: placeId, deleted: true });
  } catch (err) {
    return fail(err.code || "luna/write-failed", "Could not delete this address");
  }
}

/* ------------------------------------------------------------
 * Ride rating — writes to /rideRatings/{rideId}. Requires the
 * accompanying database rule:
 *
 *   "rideRatings": {
 *     "$rideId": {
 *       ".read":  "... owner of reservation or dispatch/owner roles",
 *       ".write": "owner of reservation (matched via reservations/$rideId/userId)"
 *     }
 *   }
 *
 * Already added to database.rules.json in this change set — deploy
 * with `firebase deploy --only database`.
 * ------------------------------------------------------------ */
async function rateRide(rideId, payload) {
  const { user, error } = requireUser();
  if (error) return error;
  if (!rideId) return fail("luna/invalid-payload", "Missing ride ID");
  if (!payload || typeof payload !== "object") {
    return fail("luna/invalid-payload", "Missing rating data");
  }
  const rating = Number(payload.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return fail("luna/invalid-payload", "Rating must be 1–5");
  }
  const comment = String(payload.comment || "").trim().slice(0, 1000);

  try {
    await update(ref(db, `rideRatings/${rideId}`), {
      userId: user.uid,
      rating,
      comment,
      ratedAt: serverTimestamp()
    });
    return ok({ rideId, rating, comment });
  } catch (err) {
    return fail(err.code || "luna/write-failed", "Could not save your rating");
  }
}

async function getRideRating(rideId) {
  const { user, error } = requireUser();
  if (error) return error;
  if (!rideId) return fail("luna/invalid-payload", "Missing ride ID");
  try {
    const snap = await get(ref(db, `rideRatings/${rideId}`));
    if (!snap.exists()) return ok(null);
    const data = snap.val();
    if (data.userId !== user.uid) return fail("luna/forbidden", "Not your rating");
    return ok(data);
  } catch (err) {
    return fail(err.code || "luna/read-failed", "Could not load rating");
  }
}

/* ------------------------------------------------------------
 * Public surface.
 * ------------------------------------------------------------ */
const LunaAccount = {
  getProfile,
  updateProfile,
  getReservations,
  getReservation,
  createReservation,
  cancelReservation,
  closeAccount,
  getSavedPlaces,
  addSavedPlace,
  deleteSavedPlace,
  rateRide,
  getRideRating
};

if (typeof window !== "undefined") {
  window.LunaAccount = LunaAccount;
  window.dispatchEvent(new CustomEvent("luna:account-module-ready"));
}

export default LunaAccount;
export {
  getProfile,
  updateProfile,
  getReservations,
  getReservation,
  createReservation,
  cancelReservation,
  closeAccount,
  getSavedPlaces,
  addSavedPlace,
  deleteSavedPlace,
  rateRide,
  getRideRating
};
