/* ============================================================
 * Luna Executive Chauffeurs — site-wide runtime config.
 * ============================================================
 * Lives on every page before app.js. Kept small intentionally —
 * this is the one file white-label consumers of the codebase
 * edit to swap CDN hosts, analytics IDs, etc. without touching
 * markup.
 *
 * Propagation contract: any key added here should also exist
 * as a fallback inside app.js so missing config never breaks
 * the page — worst case, videos just fall back to the local
 * assets/compressed/ directory.
 * ============================================================ */
window.LunaConfig = {
  /* Base URL for hero videos — no trailing slash.
   * Leave empty to serve from ./assets/compressed/ (local dev, or
   * any deploy where the /assets/compressed/*.mp4 directory has
   * been populated from scripts/compress-videos.js).
   * Production: point at the Cloudflare R2 custom domain, e.g.
   *   videoCdn: "https://videos.lunaexecutivechauffeurs.com"
   */
  videoCdn: "",

  /* Stripe publishable key — public (safe to ship in JS bundle).
   * Pair with STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET as env
   * vars on Railway (server-side only). Leave empty to disable
   * the booking-modal payment step entirely; submission falls
   * back to the request-only flow already in place.
   *   Test:  pk_test_...
   *   Live:  pk_live_...
   * Swap the value here, push, deploy — no other code changes. */
  stripePublishableKey: "pk_test_51TS7iW1d8gVXfcLI5Pdt4f2NulTEesOhttuhpgKRbNlXcV3I4l8PAenldbcwb0HoEc0thHbYw7kt80bxdBnRW2Pe008Nevz4i2",

  /* Google Maps API key — client-side, restricted to Luna domains
   * + localhost via HTTP referrer in Google Cloud Console. Used
   * for Places Autocomplete on the booking modal's pickup and
   * dropoff fields. Leave empty to disable autocomplete (fields
   * stay as plain text inputs). Key format: AIza... */
  googleMapsApiKey: ""
};
