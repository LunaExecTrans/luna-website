/* ============================================================
 * Luna Executive Chauffeurs — Firebase init (vanilla ES module)
 * ============================================================
 * Single source of truth for the Firebase app, Auth, and RTDB
 * handles. All other modules (auth.js, account.js, protected-
 * page.js) import from here. Keeping init in one place avoids
 * double-initialization warnings when multiple modules load on
 * the same page.
 *
 * Loaded via:
 *   <script type="module" src="firebase.js" defer></script>
 *
 * Firebase config values are intentionally public — the API key
 * is not a secret. Actual security is enforced by Firebase Auth
 * JWTs + RTDB security rules (see database.rules.json).
 *
 * Debug aid: the initialized services are also exposed on
 * window.LUNA_FIREBASE so you can poke at them in DevTools
 * (e.g. LUNA_FIREBASE.auth.currentUser).
 * ============================================================ */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ------------------------------------------------------------
 * Config — public, safe to ship in client bundle.
 * ------------------------------------------------------------ */
const firebaseConfig = {
  apiKey: "AIzaSyAtnaekYZHyuNxA3_torhZ_z39giig3rao",
  authDomain: "luna-executive-chauffeurs.firebaseapp.com",
  databaseURL: "https://luna-executive-chauffeurs-default-rtdb.firebaseio.com",
  projectId: "luna-executive-chauffeurs",
  storageBucket: "luna-executive-chauffeurs.firebasestorage.app",
  messagingSenderId: "630980905012",
  appId: "1:630980905012:web:d263f3553c323a5dc7a261",
  measurementId: "G-F9MF0TGBF0"
};

/* Idempotent init — if another module already booted the app
 * (e.g. firebase.js was imported twice by accident), reuse it
 * instead of throwing. */
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/* Auth — persistence set to browserLocal so the session survives
 * tab closes. This matches the expectation of a "logged-in" web
 * app (Gmail-style), not a banking app. */
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(err => {
  // Non-fatal — falls back to in-memory persistence. Log so we
  // catch infra issues (e.g. third-party cookie blocks).
  console.warn("[luna-firebase] Could not set local persistence:", err);
});

/* Realtime Database — same instance all modules share. */
const db = getDatabase(app);

/* Google provider preconfigured with the scopes we actually use.
 * Keeping this centralized means auth.js doesn't need to know
 * the details. */
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("profile");
googleProvider.addScope("email");
googleProvider.setCustomParameters({ prompt: "select_account" });

/* ------------------------------------------------------------
 * Public exports (ES modules) + debug global.
 * ------------------------------------------------------------ */
export { app, auth, db, googleProvider, serverTimestamp };

/* Debug global — intentionally assigned to window so you can
 * inspect state from DevTools without rebuilding anything. */
if (typeof window !== "undefined") {
  window.LUNA_FIREBASE = { app, auth, db, googleProvider, serverTimestamp };
}
