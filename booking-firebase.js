/* ============================================================
 * Luna Executive Chauffeurs — Public booking → dispatch bridge
 * ============================================================
 * The home page (index.html) booking modal posts directly into
 * the SAME /dispatch/rides path the operational dispatch app
 * watches in real time. The dispatcher hears the chime and sees
 * the new ride the moment the visitor hits Submit — no email
 * round-trip, no manual re-keying.
 *
 * Flow:
 *   1. Sign the visitor in anonymously (so the RTDB rule that
 *      requires auth != null is satisfied without forcing a
 *      sign-up). Anonymous UIDs auto-expire after 30 days.
 *   2. Reserve the next sequential confirmation number with a
 *      transaction on /dispatch/rideCounter — race-safe across
 *      simultaneous visitors and the staff "+ New Ride" form.
 *   3. Push the fully-formed ride record to /dispatch/rides
 *      with status="PENDING_REVIEW" and source="website".
 *
 * Exposed globally as window.LunaBooking.submitToDispatch so the
 * non-module IIFE in app.js can call it without juggling imports.
 *
 * The display ID format (LEC-XXXX) MUST mirror
 * luna-dispatch/core/dispatch-utils.js#generateDisplayId — both
 * apps share /dispatch/rideCounter. If you change the prefix or
 * pad here, change it there too.
 * ============================================================ */

import { auth, db, serverTimestamp } from "./firebase.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref,
  push,
  update,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const RIDE_ID_PREFIX = "LEC";
const RIDE_ID_PAD    = 4;
function formatDisplayId(n) {
  return RIDE_ID_PREFIX + "-" + String(n).padStart(RIDE_ID_PAD, "0");
}

/* Wait until Firebase Auth has settled (either with a real user
 * or null). Without this, signInAnonymously() can race with the
 * SDK's own session restore on page load. */
function waitForAuthReady() {
  return new Promise((resolve) => {
    const unsub = auth.onAuthStateChanged((u) => {
      unsub();
      resolve(u);
    });
  });
}

/* Cap a string to a length the RTDB validate rule will accept.
 * Defensive — the validate rule will reject anything longer, so
 * we trim client-side for a friendlier error path. */
function cap(v, max) {
  return String(v == null ? "" : v).slice(0, max);
}

/* Pick the first non-empty optional field. RTDB rejects undefined
 * but accepts null, so callers should pass undefined to mean
 * "skip this field" — we strip those before writing. */
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

/* ------------------------------------------------------------
 * submitToDispatch — main entry. `formData` is the flat object
 * produced by `Object.fromEntries(new FormData(form))` in app.js,
 * keyed by the form's `name=""` attributes. We translate that into
 * the operational dispatch schema.
 *
 * Returns: { ok:true, rideId, displayId } | { ok:false, code, message }
 * Never throws — the caller (app.js wireForm) checks .ok and falls
 * back to the legacy /api/form/submit + mailto path on failure.
 * ------------------------------------------------------------ */
async function submitToDispatch(formData) {
  if (!formData || typeof formData !== "object") {
    return { ok: false, code: "luna/invalid-payload", message: "Empty form data" };
  }

  // ---------- 1. ensure auth ----------
  let user = null;
  try {
    user = auth.currentUser || (await waitForAuthReady());
    if (!user) {
      const cred = await signInAnonymously(auth);
      user = cred.user;
    }
  } catch (err) {
    return {
      ok: false,
      code: err && err.code || "luna/auth-failed",
      message: "Could not establish a session — check your connection"
    };
  }

  // ---------- 2. validate the bare minimum client-side ----------
  // The RTDB validate rule will reject anything missing these, but
  // failing fast here gives a friendlier error than a Firebase
  // PERMISSION_DENIED.
  const passengerName  = cap(formData.name,    120).trim();
  const passengerEmail = cap(formData.email,   120).trim();
  const passengerPhone = cap(formData.phone,   40 ).trim();
  const pickup         = cap(formData.pickup,  400).trim();
  const dropoff        = cap(formData.dropoff, 400).trim();
  const pickupDate     = cap(formData.date,    10 ).trim();   // YYYY-MM-DD
  const pickupTime     = cap(formData.time,    5  ).trim();   // HH:MM
  const service        = cap(formData.service, 60 ).trim();
  const vehicleName    = cap(formData.vehicle, 60 ).trim();
  const passengers     = cap(formData.pax,     4  ).trim();

  if (!passengerName)  return { ok: false, code: "luna/invalid-payload", message: "Please add your name" };
  if (!passengerEmail) return { ok: false, code: "luna/invalid-payload", message: "Please add an email" };
  if (!pickup)         return { ok: false, code: "luna/invalid-payload", message: "Pickup address is required" };
  if (!dropoff)        return { ok: false, code: "luna/invalid-payload", message: "Drop-off address is required" };
  if (!pickupDate || !pickupTime) {
    return { ok: false, code: "luna/invalid-payload", message: "Pickup date and time are required" };
  }
  if (!service)        return { ok: false, code: "luna/invalid-payload", message: "Pick a service" };

  // ---------- 3. reserve the next LEC number ----------
  let counterValue = null;
  try {
    const tx = await runTransaction(
      ref(db, "dispatch/rideCounter"),
      (current) => (current || 0) + 1
    );
    if (!tx.committed) {
      return { ok: false, code: "luna/counter-failed", message: "Could not reserve a confirmation number — try again" };
    }
    counterValue = tx.snapshot.val();
  } catch (err) {
    return {
      ok: false,
      code: err && err.code || "luna/counter-failed",
      message: "Could not reserve a confirmation number"
    };
  }
  const displayId = formatDisplayId(counterValue);

  // ---------- 4. build the ride record ----------
  // Mirrors the shape that luna-dispatch/dispatch/new-ride.html
  // writes today, with these differences:
  //   - status starts at PENDING_REVIEW (dispatcher will move it
  //     to "new" or "confirmed" after quoting)
  //   - source is "website" (not "reservations")
  //   - userId is the anonymous UID (the rule needs it == auth.uid)
  const rideRef = push(ref(db, "dispatch/rides"));
  const rideId  = rideRef.key;

  const datetimeISO = `${pickupDate}T${pickupTime}`;

  const record = compact({
    // Identity
    id:               rideId,
    displayId,
    status:           "PENDING_REVIEW",
    source:           "website",

    // Passenger / booker
    userId:           user.uid,
    passengerName,
    passengerPhone,
    passengerEmail,

    // The ride itself
    pickup,
    dropoff,
    pickupDate,
    pickupTime,
    datetime:         datetimeISO,

    // Triage hints for the dispatcher
    service,
    vehicleId:        "",
    vehicleName,
    passengers,
    bags:             "0",
    notes:            cap(formData.notes, 2000).trim(),

    // Conditional groups — only include the fields the visitor
    // actually filled in for the chosen service type.
    flightNumber:     cap(formData.flight_number, 20).trim() || undefined,
    airline:          cap(formData.airline,       60).trim() || undefined,
    tailNumber:       cap(formData.tail_number,   20).trim() || undefined,
    fboName:          cap(formData.fbo,           80).trim() || undefined,
    aircraftType:     cap(formData.aircraft_type, 60).trim() || undefined,
    parkingPass:      cap(formData.parking_pass,  40).trim() || undefined,
    childSeats:       cap(formData.car_seats,     40).trim() || undefined,
    beverages:        cap(formData.beverages,     40).trim() || undefined,
    discretion:       cap(formData.discretion,    40).trim() || undefined,
    eventNotes:       cap(formData.event_notes, 2000).trim() || undefined,

    // Driver assignment (empty until dispatch assigns)
    driverId:         "",
    driverName:       "Unassigned",

    // Default tier — dispatcher resolves real tier from membership
    // cache by passengerEmail.
    tier:             "silver",

    // Audit
    createdAt:        serverTimestamp(),
    updatedAt:        serverTimestamp()
  });

  // ---------- 5. write the ride (anonymous visitors don't get
  //              the userReservations index; only logged-in users
  //              with a real account need their history surfaced) ----------
  try {
    await update(ref(db), {
      [`/dispatch/rides/${rideId}`]: record
    });
  } catch (err) {
    return {
      ok: false,
      code: err && err.code || "luna/write-failed",
      message: "Could not save your reservation — please call dispatch"
    };
  }

  return { ok: true, rideId, displayId };
}

/* ------------------------------------------------------------
 * Public surface — exposed on window so the IIFE in app.js can
 * call it without becoming a module itself.
 * ------------------------------------------------------------ */
const LunaBooking = { submitToDispatch };

if (typeof window !== "undefined") {
  window.LunaBooking = LunaBooking;
  window.dispatchEvent(new CustomEvent("luna:booking-module-ready"));
}

export default LunaBooking;
export { submitToDispatch };

