/* ============================================================
 * Luna Executive Chauffeurs — public website static server
 * ============================================================
 * Serves the marketing site (index.html and sibling HTML pages,
 * styles.css, app.js, assets/) behind HTTPS on Railway. Also hosts
 * a thin form submission endpoint (/api/form/submit) so booking /
 * affiliate / corporate forms don't have to rely on the mailto:
 * fallback. Submissions are logged as structured JSON to stdout
 * (Railway captures); persistence via Firebase Admin SDK is left
 * as a future add-on once the service-account env var is wired.
 *
 * Routes
 *   /                    → /index.html
 *   /<file>              → static file resolution from repo root
 *   /health              → liveness probe for Railway
 *   POST /api/form/submit→ accepts { type, data } — validates +
 *                          rate-limits + logs a single-line JSON
 *                          submission + returns { ok, ref }
 *
 * Any unknown path gets a minimal branded 404.
 * ============================================================ */

"use strict";

const express = require("express");
const path    = require("path");
const crypto  = require("crypto");

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

/* ------------------------------------------------------------
 * Form submission endpoint
 * ------------------------------------------------------------
 * Dumb pipe for now: validates shape + rate-limits + logs a
 * structured JSON line. Dispatch reads via Railway logs until
 * the Firebase Admin SDK persistence is wired up.
 *
 * Known submission types map to their destination inbox — the
 * client passes only the short token, not the email address, so
 * spammers can't use this to relay arbitrary messages.
 * ------------------------------------------------------------ */

const INBOX_BY_TYPE = {
  booking:   "reservations@lunaexecutivechauffeurs.com",
  corporate: "corporate@lunaexecutivechauffeurs.com",
  affiliate: "affiliates@lunaexecutivechauffeurs.com"
};

const MAX_FIELD_LEN   = 4000;
const MAX_FIELDS      = 40;
const RATE_WINDOW_MS  = 60 * 60 * 1000; // 1h
const RATE_LIMIT      = 5;              // 5 submissions / ip / hour

/* Per-IP sliding counter — simple in-memory map. Container restart
 * wipes it (fine at current volume; swap for Redis or a proper
 * rate-limit lib when traffic warrants). */
const submissionLog = new Map();

function checkRate (ip) {
  const now  = Date.now();
  const hits = (submissionLog.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_LIMIT) return false;
  hits.push(now);
  submissionLog.set(ip, hits);

  // Opportunistic GC: purge stale keys every ~100 submissions.
  if (submissionLog.size > 1000) {
    for (const [k, ts] of submissionLog.entries()) {
      if (ts.every(t => now - t >= RATE_WINDOW_MS)) submissionLog.delete(k);
    }
  }
  return true;
}

function sanitize (v) {
  return String(v == null ? "" : v).replace(/[\r\n\x00-\x1f\x7f]+/g, " ").trim().slice(0, MAX_FIELD_LEN);
}

function normaliseBody (raw) {
  if (!raw || typeof raw !== "object") return null;
  const data = {};
  let count = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (count++ >= MAX_FIELDS) break;
    if (typeof k !== "string") continue;
    const cleanK = k.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 60);
    if (!cleanK) continue;
    data[cleanK] = sanitize(v);
  }
  return data;
}

/* JSON body parser — caps at 32kb to refuse obviously bad traffic
 * without needing a full limiter middleware. */
app.use("/api/form/submit", express.json({ limit: "32kb" }));

app.post("/api/form/submit", (req, res) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";

  if (!checkRate(ip)) {
    return res.status(429).json({
      ok: false,
      code: "rate-limited",
      message: "Too many submissions. Try again later or call dispatch."
    });
  }

  const body = req.body || {};
  const type = String(body.type || "").toLowerCase();
  if (!INBOX_BY_TYPE[type]) {
    return res.status(400).json({ ok: false, code: "invalid-type", message: "Unknown form type." });
  }

  const data = normaliseBody(body.data);
  if (!data || Object.keys(data).length === 0) {
    return res.status(400).json({ ok: false, code: "empty-payload", message: "Form payload is empty." });
  }

  // Short reference the client can quote to dispatch.
  const ref = crypto.randomBytes(4).toString("hex").toUpperCase();

  // Single-line JSON goes to stdout — Railway indexes this.
  const record = {
    at:    new Date().toISOString(),
    ref,
    type,
    inbox: INBOX_BY_TYPE[type],
    ip,
    ua:    sanitize(req.headers["user-agent"]).slice(0, 200),
    ref_h: sanitize(req.headers["referer"]).slice(0, 200),
    data
  };
  console.log("[form.submit]", JSON.stringify(record));

  res.status(200).json({ ok: true, ref });
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
