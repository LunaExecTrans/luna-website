/* ============================================================
 * Luna Executive Chauffeurs — public website static server
 * ============================================================
 * Serves the marketing site (index.html and sibling HTML pages,
 * styles.css, app.js, assets/) behind HTTPS on Railway. No backend
 * logic — forms still mailto: until an endpoint is wired up.
 *
 * Routes
 *   /               → /index.html
 *   /<file>         → static file resolution from repo root
 *   /health         → liveness probe for Railway
 *
 * Any unknown path gets a minimal branded 404.
 * ============================================================ */

"use strict";

const express = require("express");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

/* Trust Railway's proxy so req.secure / req.ip come through correctly. */
app.set("trust proxy", 1);

/* Disable Express's "X-Powered-By" fingerprint. Tiny hardening win. */
app.disable("x-powered-by");

/* Baseline security headers. Host-level overrides (Cloudflare/Railway)
 * can still tighten further — this is the floor, not the ceiling. */
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

/* Health check — Railway pings this to know the container is up. */
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "luna-website" });
});

/* Static serving with sensible cache headers:
 *   - HTML/CSS/JS: no-cache + must-revalidate — filenames aren't hashed,
 *     so any long cache would mask fresh deploys. ETag keeps revalidation
 *     cheap (304 Not Modified most of the time).
 *   - xml/txt: 1 hour — sitemap/robots change infrequently.
 *   - images/fonts/videos (everything else): 1 day public cache. */
const staticOpts = {
  etag: true,
  lastModified: true,
  extensions: ["html"],
  setHeaders(res, filePath) {
    if (filePath.endsWith(".html") || filePath.endsWith(".css") || filePath.endsWith(".js")) {
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
    } else if (filePath.endsWith(".xml") || filePath.endsWith(".txt")) {
      res.setHeader("Cache-Control", "public, max-age=3600");
    } else {
      res.setHeader("Cache-Control", "public, max-age=86400");
    }
  }
};

app.use(express.static(ROOT, staticOpts));

/* Minimal 404 — editorial tone, matches Luna voice. */
app.use((_req, res) => {
  res.status(404).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Not found &mdash; Luna Executive Chauffeurs</title>
<style>
  body{margin:0;background:#F5F1E8;color:#0D1528;font-family:Inter,system-ui,sans-serif;
       display:grid;place-items:center;min-height:100vh;padding:24px}
  .box{max-width:460px;text-align:center}
  .mark{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:0.22em;
        text-transform:uppercase;color:#8A6E3F;margin-bottom:14px}
  h1{font-family:'Playfair Display',Georgia,serif;font-size:38px;font-weight:400;
     letter-spacing:-0.015em;margin:0 0 12px;font-style:italic}
  p{color:#5B6478;font-size:15px;line-height:1.65;margin:0 0 28px}
  a{color:#8A6E3F;text-decoration:none;font-size:12px;letter-spacing:0.16em;
    text-transform:uppercase;font-weight:600;border-bottom:1px solid #8A6E3F;padding-bottom:3px}
  @media (prefers-color-scheme: dark) {
    body{background:#0D1528;color:#F5F1E8}
    p{color:#9AA2B5}
  }
</style></head>
<body><div class="box">
  <div class="mark">Luna Executive Chauffeurs</div>
  <h1>Not this door.</h1>
  <p>The page you were looking for isn't here. It may have moved, or perhaps it never existed. Either way, we can point you back.</p>
  <a href="/">Return home &rarr;</a>
</div></body></html>`);
});

app.listen(PORT, () => {
  console.log(`[luna-website] listening on :${PORT}`);
});
