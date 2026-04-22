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
  videoCdn: ""
};
