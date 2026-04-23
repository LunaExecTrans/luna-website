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
  orderByChild,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ------------------------------------------------------------
 * Display ID format. Must mirror luna-dispatch's
 * core/dispatch-utils.js#generateDisplayId — both apps share
 * the same /dispatch/rideCounter so IDs stay sequential across
 * channels (website, app, reservations staff tool).
 * ------------------------------------------------------------ */
const RIDE_ID_PREFIX = "LEC";
const RIDE_ID_PAD    = 4;
function formatDisplayId(n) {
  return RIDE_ID_PREFIX + "-" + String(n).padStart(RIDE_ID_PAD, "0");
}

/* Split an ISO datetime ("2026-04-25T14:30") into the two
 * fields the dispatch operational schema expects. Defensive
 * against trailing seconds / Z / offsets — we only care about
 * the calendar date and wall-clock time the chauffeur sees. */
function splitDatetime(iso) {
  const s = String(iso || "");
  const [date, timeRaw] = s.split("T");
  const time = (timeRaw || "").slice(0, 5); // "HH:MM"
  return { date: date || "", time: time || "" };
}
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
 * the individual ride fetches against /dispatch/rides (single
 * source of truth shared with the operational dispatch app).
 * Splits upcoming vs past by datetime (falls back to createdAt).
 *
 * Terminal statuses (done/completed/cancelled/rejected) never
 * surface as upcoming, even if the pickup is in the future.
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
      get(ref(db, `dispatch/rides/${id}`)).then(s => (s.exists() ? { id, ...s.val() } : null))
    );
    const rows = (await Promise.all(fetches)).filter(Boolean);

    const now = Date.now();
    const upcoming = [];
    const past = [];

    const isTerminal = (s) => s === "done" || s === "completed" || s === "cancelled" || s === "rejected";

    for (const r of rows) {
      const pickupIso = r && r.datetime;
      const pickupMs = pickupIso ? Date.parse(pickupIso) : NaN;
      const anchor = Number.isFinite(pickupMs) ? pickupMs : (r.createdAt || 0);

      if (!isTerminal(r.status) && anchor >= now) upcoming.push(r);
      else past.push(r);
    }

    // Sort: upcoming by soonest first, past by most recent first.
    upcoming.sort((a, b) => Date.parse(a.datetime || 0) - Date.parse(b.datetime || 0));
    past.sort((a, b) => Date.parse(b.datetime || 0) - Date.parse(a.datetime || 0));

    return ok({ upcoming, past });
  } catch (err) {
    return fail(err.code || "luna/read-failed", "Could not load your reservations");
  }
}

/* ------------------------------------------------------------
 * getReservation — single ride by ID from /dispatch/rides,
 * scoped to caller's ownership for the receipt / detail page.
 * Rule rejects other users' rides server-side; this is just
 * the fast-path for one record.
 * ------------------------------------------------------------ */
async function getReservation(rideId) {
  const { user, error } = requireUser();
  if (error) return error;
  if (!rideId) return fail("luna/invalid-payload", "Missing ride ID");

  try {
    const snap = await get(ref(db, `dispatch/rides/${rideId}`));
    if (!snap.exists()) return fail("luna/not-found", "Reservation not found");
    const data = snap.val();
    if (data.userId !== user.uid) return fail("luna/forbidden", "Not your reservation");
    return ok({ id: rideId, ...data });
  } catch (err) {
    return fail(err.code || "luna/read-failed", "Could not load the reservation");
  }
}

/* ------------------------------------------------------------
 * createReservation — authenticated booking from /account.
 * Writes a fully-formed ride to /dispatch/rides/{pushKey} (the
 * shared operational schema with the dispatch app) plus the
 * /userReservations index, atomically.
 *
 * The displayId (LEC-XXXX) is reserved up-front via a transaction
 * on /dispatch/rideCounter so it survives concurrent submits and
 * stays sequential across all channels (website, app, staff).
 *
 * Payload schema (extends the original — we now collect the
 * passenger contact and the service type the dispatcher needs):
 *   {
 *     // ride basics
 *     pickup:        string | { address, datetime },
 *     dropoff:       string | { address, datetime },
 *     datetime?:     string ISO  (required if pickup is a string)
 *     pax:           number,
 *     bags?:         number,
 *     notes?:        string,
 *
 *     // operational fields the dispatcher needs to triage
 *     service?:      string  ("Point-to-point" default)
 *     vehicleType?:  string  (preserved as vehicleName)
 *
 *     // passenger contact — defaults to logged-in profile
 *     passengerName?:  string,
 *     passengerPhone?: string,
 *     passengerEmail?: string
 *   }
 * ------------------------------------------------------------ */
async function createReservation(payload) {
  const { user, error } = requireUser();
  if (error) return error;
  if (!payload || typeof payload !== "object") {
    return fail("luna/invalid-payload", "Missing reservation data");
  }

  // Normalize pickup/dropoff — support both shapes (string or
  // {address,datetime}) so any caller can send what they have.
  const pickupAddress  = typeof payload.pickup === "string" ? payload.pickup
    : (payload.pickup && payload.pickup.address) || "";
  const dropoffAddress = typeof payload.dropoff === "string" ? payload.dropoff
    : (payload.dropoff && payload.dropoff.address) || "";
  const datetimeISO    = payload.datetime
    || (payload.pickup && payload.pickup.datetime)
    || "";

  if (!pickupAddress)  return fail("luna/invalid-payload", "Pickup address is required");
  if (!dropoffAddress) return fail("luna/invalid-payload", "Drop-off address is required");
  if (!datetimeISO)    return fail("luna/invalid-payload", "Pickup date and time are required");
  const pax = Number(payload.pax);
  if (!Number.isFinite(pax) || pax < 1) {
    return fail("luna/invalid-payload", "At least 1 passenger is required");
  }

  // Pull contact defaults from the logged-in profile so the
  // dispatcher has something to call even if the form omitted it.
  let profilePhone = null;
  try {
    const phoneSnap = await get(ref(db, `users/${user.uid}/phone`));
    profilePhone = phoneSnap.val();
  } catch (_) { /* best effort */ }

  const passengerName  = String(payload.passengerName  || user.displayName || "").trim();
  const passengerPhone = String(payload.passengerPhone || profilePhone || "").trim();
  const passengerEmail = String(payload.passengerEmail || user.email || "").trim();
  if (!passengerEmail) {
    return fail("luna/invalid-payload", "Email on file is missing — update your profile");
  }

  // Reserve the next sequential displayId. runTransaction keeps
  // it race-safe even if two clients submit at the same instant.
  let counterValue = null;
  try {
    const counterRes = await runTransaction(
      ref(db, "dispatch/rideCounter"),
      (current) => (current || 0) + 1
    );
    if (!counterRes.committed) {
      return fail("luna/counter-failed", "Could not reserve a confirmation number, try again");
    }
    counterValue = counterRes.snapshot.val();
  } catch (err) {
    return fail(err.code || "luna/counter-failed", "Could not reserve a confirmation number");
  }
  const displayId = formatDisplayId(counterValue);

  // Reserve the push key so the multi-path update is atomic
  // (ride + index, no orphan writes).
  const rideRef = push(ref(db, "dispatch/rides"));
  const rideId  = rideRef.key;

  const { date: pickupDate, time: pickupTime } = splitDatetime(datetimeISO);

  const record = {
    // Identity
    id:           rideId,
    displayId,
    status:       "PENDING_REVIEW",
    source:       "website",

    // Passenger (the website-account flow doesn't separate booker)
    userId:       user.uid,
    passengerName,
    passengerPhone,
    passengerEmail,

    // The ride itself
    pickup:       String(pickupAddress).slice(0, 400),
    dropoff:      String(dropoffAddress).slice(0, 400),
    pickupDate,
    pickupTime,
    datetime:     String(datetimeISO),

    // Triage hints for the dispatcher
    service:      String(payload.service || "Point-to-point"),
    vehicleId:    "",
    vehicleName:  String(payload.vehicleType || ""),
    passengers:   String(pax),
    bags:         String(payload.bags || 0),
    notes:        payload.notes ? String(payload.notes).slice(0, 2000) : "",

    // Driver assignment (empty until dispatch assigns)
    driverId:     "",
    driverName:   "Unassigned",

    // Membership tier — dispatcher will resolve via membership
    // cache; default silver here so the operational view never
    // sees an undefined value.
    tier:         "silver",

    // Audit
    createdAt:    serverTimestamp(),
    updatedAt:    serverTimestamp()
  };

  const updates = {
    [`/dispatch/rides/${rideId}`]:               record,
    [`/userReservations/${user.uid}/${rideId}`]: true
  };

  try {
    await update(ref(db), updates);
    return ok({ rideId, displayId });
  } catch (err) {
    return fail(err.code || "luna/write-failed", "Could not save your reservation");
  }
}

/* ------------------------------------------------------------
 * cancelReservation — sets status to "cancelled" if and only if
 * the ride belongs to the calling user AND hasn't entered the
 * live operational chain yet. Security rules enforce the same
 * (ride owner + status==='cancelled' is the only client-side
 * write path allowed once the ride exists).
 *
 * The list of "too late" statuses mirrors the dispatch flow:
 *   new, confirmed, assigned, onway, arrived, pob,
 *   droppedoff, done. Once dispatch confirmed (anything past
 *   PENDING_REVIEW), the client must call to cancel.
 * ------------------------------------------------------------ */
async function cancelReservation(rideId) {
  const { user, error } = requireUser();
  if (error) return error;
  if (!rideId) return fail("luna/invalid-payload", "Missing reservation ID");

  const TOO_LATE = new Set([
    "assigned", "onway", "arrived", "pob", "droppedoff", "done", "completed", "in_progress"
  ]);

  try {
    const snap = await get(ref(db, `dispatch/rides/${rideId}`));
    if (!snap.exists()) return fail("luna/not-found", "Reservation not found");
    const data = snap.val();
    if (data.userId !== user.uid) return fail("luna/forbidden", "Not your reservation");
    if (TOO_LATE.has(data.status)) {
      return fail("luna/too-late", "This ride is already underway — please call dispatch");
    }
    await update(ref(db, `dispatch/rides/${rideId}`), {
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
 *   - Keep dispatch rides intact — IRS 7-year retention window.
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
 * Ride rating — writes to /rideRatings/{rideId}. The matching
 * database rule reads dispatch/rides/{rideId}/userId to verify
 * ownership before allowing the write. See
 * luna-dispatch/firebase-rules-production.json (rideRatings node).
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
