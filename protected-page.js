/* ============================================================
 * Luna Executive Chauffeurs — protected-page helper
 * ============================================================
 * Drop this script into any page that requires authentication
 * (/account.html, /account/reservations.html, etc). It will:
 *
 *   1. Wait one tick for Firebase to rehydrate session from
 *      IndexedDB / localStorage.
 *   2. If no user is signed in, redirect to
 *      /login.html?redirect=<current-path-with-query>.
 *   3. If a user IS signed in, dispatch a `luna:auth-ready`
 *      CustomEvent on window whose detail is the serialized
 *      user summary. Pages listen for that event to start
 *      rendering — this avoids flashing content before we
 *      know who the user is.
 *
 * Loading order matters. Use:
 *   <script type="module" src="firebase.js"        defer></script>
 *   <script type="module" src="auth.js"            defer></script>
 *   <script type="module" src="account.js"         defer></script>
 *   <script type="module" src="protected-page.js"  defer></script>
 *
 * Opt-out: if a page wants to handle its own unauth state (e.g.
 * account-signin-complete.html), add `data-luna-public="true"`
 * to <html> and this module will no-op.
 * ============================================================ */

import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

function isPublicPage() {
  try {
    return document.documentElement.getAttribute("data-luna-public") === "true";
  } catch (_) {
    return false;
  }
}

function buildRedirect() {
  // Preserve path + query so the user lands exactly where they
  // intended after signing in.
  const here = window.location.pathname + window.location.search;
  // Avoid a redirect loop if someone accidentally guards login.html.
  if (here.startsWith("/login")) return "/login.html";
  return "/login.html?redirect=" + encodeURIComponent(here);
}

function dispatchAuthReady(user) {
  const detail = {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || null
  };
  window.dispatchEvent(new CustomEvent("luna:auth-ready", { detail }));

  // Also expose a resolved promise for pages that load late and
  // missed the event. window.LunaAuthReady.then(user => ...).
  window.LunaAuthReady = Promise.resolve(detail);
}

function dispatchAuthDenied() {
  // Pages that want to animate out before the redirect can listen
  // for this event and call event.preventDefault()... but by
  // default we just redirect immediately.
  const evt = new CustomEvent("luna:auth-denied", { cancelable: true });
  const proceed = window.dispatchEvent(evt);
  if (proceed) {
    window.location.replace(buildRedirect());
  }
}

if (!isPublicPage()) {
  // Single-shot subscription — once we have the first resolution
  // (user or null) we stop listening. This avoids re-firing
  // redirects if the user signs out in another tab.
  let settled = false;
  const unsub = onAuthStateChanged(auth, user => {
    if (settled) return;
    settled = true;
    try { unsub(); } catch (_) { /* ignore */ }

    if (user) dispatchAuthReady(user);
    else      dispatchAuthDenied();
  });
}
