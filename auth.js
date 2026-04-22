/* ============================================================
 * Luna Executive Chauffeurs — Auth module (window.LunaAuth)
 * ============================================================
 * Vanilla ES module that implements every auth flow the site
 * needs. Exposes its public surface on window.LunaAuth so that
 * plain <script> handlers on forms (built by kensy) can call
 * into it without needing imports.
 *
 * Public surface (window.LunaAuth):
 *   signin(email, password)              -> Promise<Result>
 *   signup({ name, email, phone, password }) -> Promise<Result>
 *   signout()                            -> Promise<Result>
 *   sendPasswordReset(email)             -> Promise<Result>
 *   signinWithGoogle()                   -> Promise<Result>
 *   onAuthStateChanged(callback)         -> unsubscribe fn
 *   getCurrentUser()                     -> user | null
 *   mapError(err)                        -> string   (exposed for UI)
 *
 * Result shape (consistent across every call):
 *   { ok: true,  user: { uid, email, displayName, phone } }
 *   { ok: false, code: "...", message: "human-readable" }
 *
 * Notes
 * - Phone numbers are normalized to E.164 before writing to RTDB
 *   and indexing. If the normalized form is invalid, signup fails
 *   BEFORE creating the Firebase Auth user (so we don't leave
 *   orphaned accounts).
 * - All RTDB writes use multi-path updates (atomic) so we never
 *   leave the user record half-written.
 * ============================================================ */

import { auth, db, googleProvider, serverTimestamp } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged as fbOnAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref,
  get,
  update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ------------------------------------------------------------
 * Error mapping. Firebase error codes -> copy the UI can show.
 * Kept as a lookup table so kay (or future i18n) can override
 * by reassigning window.LunaAuth.errorMessages.
 * ------------------------------------------------------------ */
const ERROR_MESSAGES = {
  "auth/wrong-password":           "Wrong email/password combo",
  "auth/invalid-credential":       "Wrong email/password combo",
  "auth/invalid-login-credentials":"Wrong email/password combo",
  "auth/user-not-found":           "Account not found",
  "auth/too-many-requests":        "Too many attempts. Try again in a few minutes.",
  "auth/email-already-in-use":     "Email already registered",
  "auth/weak-password":            "Weak password",
  "auth/invalid-email":            "That email doesn't look right",
  "auth/popup-closed-by-user":     "Google sign-in cancelled",
  "auth/popup-blocked":            "Your browser blocked the Google sign-in popup",
  "auth/cancelled-popup-request":  "Google sign-in cancelled",
  "auth/network-request-failed":   "Network error. Check your connection.",
  "auth/user-disabled":            "This account has been disabled. Contact support.",
  "auth/requires-recent-login":    "Please sign in again to continue",
  "luna/invalid-phone":            "Phone number doesn't look right",
  "luna/missing-fields":           "Please fill in every field"
};

const DEFAULT_ERROR = "Something went wrong. Try again.";

function mapError(err) {
  if (!err) return DEFAULT_ERROR;
  const code = err.code || err.message || "";
  return ERROR_MESSAGES[code] || DEFAULT_ERROR;
}

function fail(err) {
  const code = err && err.code ? err.code : "unknown";
  return { ok: false, code, message: mapError(err) };
}

function ok(user, extras = {}) {
  return {
    ok: true,
    user: {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || null,
      phone: extras.phone || null
    }
  };
}

/* ------------------------------------------------------------
 * Phone normalization. Accept common US/BR input formats and
 * coerce to E.164. Return null if we can't trust the result.
 * ------------------------------------------------------------ */
function normalizePhone(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  // Already E.164-ish? accept if it starts with + and has 8-15 digits after.
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;
  // Strip everything that isn't a digit.
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  // US shortcuts: 10 digits -> +1XXXXXXXXXX, 11 with leading 1 -> +<digits>.
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  // Brazil / international fallback: 11-15 digits, prepend +.
  if (digits.length >= 10 && digits.length <= 15) return "+" + digits;
  return null;
}

/* ------------------------------------------------------------
 * Default preferences block written on first account creation.
 * Mirrors the schema documented in the task brief.
 * ------------------------------------------------------------ */
function defaultPreferences() {
  return {
    defaultVehicle: null,
    defaultPickup: null,
    smsEnabled: true,
    emailMarketing: false,
    language: "en"
  };
}

/* ------------------------------------------------------------
 * Build the atomic multi-path write for a new user record.
 *
 * Schema is aligned with the dispatch (luna-dispatch) RTDB rules:
 *   - roles/* is owner-only. We never write roles from the client.
 *     "Being a client" is implicit: anyone without roles/owner or
 *     roles/dispatcher is treated as a regular client by downstream
 *     rules (reservations, userReservations, etc).
 *   - phoneIndex is also owner/dispatcher-only. Not written here.
 *     A future Cloud Function (or admin batch) maintains phone ->
 *     uid lookup server-side.
 * ------------------------------------------------------------ */
function buildUserRecordUpdates({ uid, email, displayName, phone }) {
  const userPath = `/users/${uid}`;
  return {
    [`${userPath}/email`]:          email || null,
    [`${userPath}/displayName`]:    displayName || null,
    [`${userPath}/phone`]:          phone || null,
    [`${userPath}/preferences`]:    defaultPreferences(),
    [`${userPath}/createdAt`]:      serverTimestamp(),
    [`${userPath}/updatedAt`]:      serverTimestamp()
  };
}

/* ------------------------------------------------------------
 * Flow: email/password signin.
 * ------------------------------------------------------------ */
async function signin(email, password) {
  if (!email || !password) {
    return fail({ code: "luna/missing-fields" });
  }
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return ok(cred.user);
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------
 * Flow: email/password signup.
 *
 * Order of operations matters:
 *   1. Validate phone BEFORE touching Firebase (no orphan auth users).
 *   2. Create the auth user.
 *   3. updateProfile with displayName.
 *   4. Atomic multi-path write to /users/{uid} and /phoneIndex.
 * If step 4 fails we surface the error — the auth user exists but
 * RTDB is inconsistent. In practice this is rare and recoverable
 * on next sign-in (account.js will auto-provision missing records
 * via ensureProfile()).
 * ------------------------------------------------------------ */
async function signup({ name, email, phone, password } = {}) {
  if (!name || !email || !phone || !password) {
    return fail({ code: "luna/missing-fields" });
  }
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return fail({ code: "luna/invalid-phone" });
  }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const user = cred.user;

    // Set displayName on the auth record — used by Google-style UI.
    await updateProfile(user, { displayName: name.trim() });

    // Write the RTDB profile atomically.
    const updates = buildUserRecordUpdates({
      uid: user.uid,
      email: user.email,
      displayName: name.trim(),
      phone: normalizedPhone
    });
    await update(ref(db), updates);

    return ok(user, { phone: normalizedPhone });
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------
 * Flow: Google OAuth sign-in (popup).
 *
 * We detect whether the RTDB profile exists. If not, we provision
 * a minimal record (without phone) and let the UI layer prompt the
 * user for their phone via /signup-complete.html?needs=phone.
 *
 * The result carries a `needsPhone: true` flag so kensy's page
 * code can trigger the redirect.
 * ------------------------------------------------------------ */
async function signinWithGoogle() {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    const user = cred.user;

    // Is this a returning user with a full profile?
    const snap = await get(ref(db, `users/${user.uid}/phone`));
    const existingPhone = snap.exists() ? snap.val() : null;

    if (!existingPhone) {
      // Bootstrap the /users/{uid} record (minus phone). We do this
      // in a merge-friendly way — if the record exists partially
      // from a previous attempt, we only fill missing fields.
      const updates = {
        [`/users/${user.uid}/email`]:       user.email || null,
        [`/users/${user.uid}/displayName`]: user.displayName || null,
        [`/users/${user.uid}/updatedAt`]:   serverTimestamp()
      };

      // Only set createdAt / preferences if the record is brand new.
      const rootSnap = await get(ref(db, `users/${user.uid}/createdAt`));
      if (!rootSnap.exists()) {
        updates[`/users/${user.uid}/createdAt`]   = serverTimestamp();
        updates[`/users/${user.uid}/preferences`] = defaultPreferences();
      }
      await update(ref(db), updates);

      return { ...ok(user), needsPhone: true };
    }

    return ok(user, { phone: existingPhone });
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------
 * Flow: sign out.
 * ------------------------------------------------------------ */
async function signout() {
  try {
    await signOut(auth);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------
 * Flow: forgot-password email.
 * ------------------------------------------------------------ */
async function sendPasswordReset(email) {
  if (!email) {
    return fail({ code: "luna/missing-fields" });
  }
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return { ok: true };
  } catch (err) {
    // Firebase best practice: don't leak whether the email exists.
    // For the known "user-not-found" case we still return ok so the
    // UI can show the generic "If that email exists..." copy.
    if (err && err.code === "auth/user-not-found") {
      return { ok: true };
    }
    return fail(err);
  }
}

/* ------------------------------------------------------------
 * Auth state subscription. Pass-through to Firebase's version so
 * consumers can unsubscribe exactly the same way.
 * ------------------------------------------------------------ */
function onAuthStateChanged(cb) {
  return fbOnAuthStateChanged(auth, cb);
}

/* ------------------------------------------------------------
 * Synchronous getter. Returns a serialized summary (not the
 * Firebase User object) so consumers don't accidentally mutate it.
 * ------------------------------------------------------------ */
function getCurrentUser() {
  const u = auth.currentUser;
  if (!u) return null;
  return {
    uid: u.uid,
    email: u.email || null,
    displayName: u.displayName || null,
    phone: null  // phone lives in RTDB; use LunaAccount.getProfile() if needed
  };
}

/* ------------------------------------------------------------
 * Helper for account.js — ensure /users/{uid} exists even if the
 * signup write failed mid-flight. Not part of the public API.
 * ------------------------------------------------------------ */
export async function ensureProfileRecord(user) {
  const snap = await get(ref(db, `users/${user.uid}/createdAt`));
  if (snap.exists()) return;
  const updates = {
    [`/users/${user.uid}/email`]:       user.email || null,
    [`/users/${user.uid}/displayName`]: user.displayName || null,
    [`/users/${user.uid}/preferences`]: defaultPreferences(),
    [`/users/${user.uid}/createdAt`]:   serverTimestamp(),
    [`/users/${user.uid}/updatedAt`]:   serverTimestamp()
  };
  await update(ref(db), updates);
}

/* ------------------------------------------------------------
 * Public surface — window.LunaAuth (for non-module consumers)
 * and named exports (for module consumers).
 * ------------------------------------------------------------ */
const LunaAuth = {
  signin,
  signup,
  signout,
  sendPasswordReset,
  signinWithGoogle,
  onAuthStateChanged,
  getCurrentUser,
  mapError,
  errorMessages: ERROR_MESSAGES,
  normalizePhone
};

if (typeof window !== "undefined") {
  window.LunaAuth = LunaAuth;

  // Signal readiness — kensy's pages can listen for this if they
  // need to wire up forms after the module loads.
  window.dispatchEvent(new CustomEvent("luna:auth-module-ready"));
}

export default LunaAuth;
export {
  signin,
  signup,
  signout,
  sendPasswordReset,
  signinWithGoogle,
  onAuthStateChanged,
  getCurrentUser,
  mapError,
  normalizePhone
};
