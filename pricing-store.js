/* ============================================================
 * Luna Executive Chauffeurs — Shared pricing store
 * ============================================================
 * Single subscriber to /pricing/* (Firebase RTDB) for the public
 * site. Mirrors the same edits the dispatch admin makes in
 * `/pricing/index.html`, so the rates page and any estimator
 * widget reflect the live rate card within seconds of an owner
 * tap of "Save Rates".
 *
 * Source of truth (in RTDB):
 *   pricing/rates/{vehicleId}    {base, perMile, hourlyMinimum,
 *                                 miaFlat, fllFlat, pbiFlat}
 *   pricing/surge/{surgeId}      {label, startDate, endDate,
 *                                 multiplier, notes}
 *   pricing/volumeTiers/{tierId} {label, minRides, discountPct,
 *                                 notes}
 *   pricing/meta                 {updatedAt, updatedBy}
 *
 * Surfaces consuming this store:
 *   - rates.html       (live "Updated" badge + surge banner)
 *   - any estimator widget shipped on the marketing site
 *
 * Public API (always available on `window.LunaPricing`):
 *   rates()            → object keyed by vehicleId
 *   rateFor(id)        → one rate record or null
 *   allSurges()        → array of surge events
 *   activeSurges(d?)   → surge events live on date d (default today)
 *   surgeMultiplier(d?) → highest multiplier active on date d,
 *                         or 1.0 if none
 *   volumeTiers()      → sorted ascending by minRides
 *   meta()             → { updatedAt, updatedBy }
 *   ready()            → Promise that resolves once the first
 *                         RTDB snapshot lands (or immediately if
 *                         already loaded)
 *   calculate(opts)    → { total, breakdown, surge, ... }
 *                         opts: { vehicleId, mode, hours, miles,
 *                                 airport, date, isCorporate,
 *                                 monthlyRideCount }
 *
 * Public events (window-level CustomEvent):
 *   luna:pricing-updated → e.detail = { rates, surges, tiers, meta }
 *     Fires once on initial subscribe + every RTDB change.
 *
 * Graceful degradation: if Firebase isn't configured (config.js
 * empty) or RTDB rules deny access, the store stays empty and
 * `ready()` still resolves so dependent UI doesn't hang.
 * ============================================================ */

import { db } from "./firebase.js";
import {
  ref,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ─── Store state ─────────────────────────────────────────── */
let state = {
  rates:  {},
  surges: {},
  tiers:  {},
  meta:   {},
  loaded: false,
};

let firstResolveFns = [];

/* Counts the number of RTDB nodes that have come back. We need
 * to wait for all four (rates, surges, tiers, meta) before we
 * consider the store "loaded" — otherwise estimators might run
 * with partial data on first paint. */
let snapsArrived = 0;
const TOTAL_SNAPS = 4;

function markSnap() {
  if (state.loaded) return;
  snapsArrived++;
  if (snapsArrived >= TOTAL_SNAPS) {
    state.loaded = true;
    resolveFirst();
  }
}

function broadcast() {
  try {
    window.dispatchEvent(new CustomEvent("luna:pricing-updated", {
      detail: {
        rates:  state.rates,
        surges: state.surges,
        tiers:  state.tiers,
        meta:   state.meta,
        loaded: state.loaded,
      }
    }));
  } catch (e) {
    console.error("[pricing-store] broadcast failed:", e);
  }
}

function resolveFirst() {
  if (!firstResolveFns.length) return;
  const fns = firstResolveFns;
  firstResolveFns = [];
  fns.forEach(fn => { try { fn(state); } catch (_) {} });
}

/* ─── Calculation helpers ─────────────────────────────────── */

/* `dateLike` accepts a Date, ISO string, or undefined (today). */
function toDate(dateLike) {
  if (dateLike instanceof Date) return new Date(dateLike.getTime());
  if (typeof dateLike === "string" && dateLike) {
    const d = new Date(dateLike);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function isSurgeActive(s, d) {
  if (!s || !s.startDate || !s.endDate) return false;
  const start = new Date(s.startDate);
  const end   = new Date(s.endDate);
  // Treat both ends inclusive at the day granularity used in dispatch.
  end.setHours(23, 59, 59, 999);
  return start <= d && d <= end;
}

function activeSurgesOn(d) {
  const target = toDate(d);
  return Object.entries(state.surges)
    .filter(([_, s]) => isSurgeActive(s, target))
    .map(([id, s]) => ({ id, ...s }));
}

function surgeMultiplierOn(d) {
  const active = activeSurgesOn(d);
  if (!active.length) return 1.0;
  // If multiple events overlap, the highest multiplier wins —
  // matches dispatch's quote behavior so the website preview
  // doesn't under-quote when a holiday and an event collide.
  return active.reduce((m, s) =>
    Math.max(m, (typeof s.multiplier === "number" ? s.multiplier : 1)),
  1.0);
}

function volumeTiersSorted() {
  return Object.entries(state.tiers)
    .map(([id, t]) => ({ id, ...t }))
    .sort((a, b) => (a.minRides || 0) - (b.minRides || 0));
}

function volumeDiscountFor(monthlyRides) {
  const tiers = volumeTiersSorted();
  let pct = 0;
  for (const t of tiers) {
    if (typeof t.minRides === "number" && monthlyRides >= t.minRides) {
      pct = Math.max(pct, t.discountPct || 0);
    }
  }
  return pct;
}

/* Returns null when the rate record is missing — caller falls
 * back to "Quote on request" UX instead of showing $0. */
function calculate(opts) {
  const o = opts || {};
  const vehicleId = o.vehicleId;
  if (!vehicleId) return null;
  const r = state.rates[vehicleId];
  if (!r) return null;

  const mode    = o.mode || "point-to-point";
  const date    = toDate(o.date);
  const surgeX  = surgeMultiplierOn(date);
  const breakdown = [];

  let subtotal = 0;
  if (mode === "airport") {
    const airport = String(o.airport || "MIA").toUpperCase();
    const flatKey = airport === "FLL" ? "fllFlat"
                  : airport === "PBI" ? "pbiFlat"
                  : "miaFlat";
    const flat = Number(r[flatKey]) || 0;
    if (flat > 0) {
      subtotal = flat;
      breakdown.push({ label: `${airport} airport flat`, amount: flat });
    } else {
      const base    = Number(r.base) || 0;
      const perMile = Number(r.perMile) || 0;
      const miles   = Math.max(0, Number(o.miles) || 0);
      subtotal = base + perMile * miles;
      if (base)    breakdown.push({ label: "Base",             amount: base });
      if (miles)   breakdown.push({ label: `${miles} mi × $${perMile.toFixed(2)}`, amount: perMile * miles });
    }
  } else if (mode === "hourly") {
    const hours = Math.max(1, Number(o.hours) || 1);
    const min   = Number(r.hourlyMinimum) || 0;
    const base  = Number(r.base) || 0;
    // Dispatch convention: `base` is the per-hour rate in hourly
    // mode (the dispatch admin uses one field), and `hourlyMinimum`
    // gates the floor so the chauffeur's time is respected.
    const raw   = base * hours;
    subtotal    = Math.max(raw, min);
    breakdown.push({ label: `${hours} hr × $${base.toFixed(2)}`, amount: raw });
    if (subtotal > raw) {
      breakdown.push({ label: `Minimum (${(min / base).toFixed(1)} hr equivalent)`, amount: subtotal - raw });
    }
  } else {
    const base    = Number(r.base) || 0;
    const perMile = Number(r.perMile) || 0;
    const miles   = Math.max(0, Number(o.miles) || 0);
    subtotal = base + perMile * miles;
    if (base)  breakdown.push({ label: "Base",                                  amount: base });
    if (miles) breakdown.push({ label: `${miles} mi × $${perMile.toFixed(2)}`,  amount: perMile * miles });
  }

  /* Surge multiplier — applied to the subtotal, before any
   * corporate discount. This mirrors the dispatch quote engine:
   * surge protects the live-dispatch capacity during peak weeks
   * and is independent of any negotiated corporate rate. */
  let surgeAdded = 0;
  if (surgeX > 1.0) {
    surgeAdded = subtotal * (surgeX - 1);
    breakdown.push({
      label: `Surge × ${surgeX.toFixed(2)}`,
      amount: surgeAdded,
      surge: true,
    });
  }
  const afterSurge = subtotal + surgeAdded;

  /* Volume discount — only relevant for corporate accounts with
   * monthly ride volume above the lowest tier threshold. The
   * website estimator can pass `isCorporate: true` + a sample
   * `monthlyRideCount` to preview the discount on the rate card. */
  let discountAmount = 0;
  let discountPct    = 0;
  if (o.isCorporate) {
    discountPct = volumeDiscountFor(Number(o.monthlyRideCount) || 0);
    if (discountPct > 0) {
      discountAmount = afterSurge * (discountPct / 100);
      breakdown.push({
        label: `Volume discount −${discountPct}%`,
        amount: -discountAmount,
        discount: true,
      });
    }
  }

  const total = Math.max(0, afterSurge - discountAmount);

  return {
    vehicleId,
    mode,
    subtotal,
    surge:        { multiplier: surgeX, added: surgeAdded },
    volume:       { pct: discountPct, amount: discountAmount },
    total,
    breakdown,
    /* echo the source rate record so callers can show "Hourly min
     * $X" type disclosures without re-reading from store. */
    rate: r,
  };
}

/* ─── Display helpers ─────────────────────────────────────────
 * Render-time formatters shared by every surface that shows a
 * starting price (fleet showroom spec, booking modal radio,
 * rates page hourly cards). Keeping them here means a tweak to
 * the price string format propagates instantly.
 *
 * Falls back to the vehicle's `displayPrice` string when the
 * dispatch owner hasn't set a per-vehicle rate yet — so the
 * canonical fallback fleet on first load never renders blank.
 * ----------------------------------------------------------- */
function fmtUsd(n) {
  if (typeof n !== "number" || !isFinite(n)) return "";
  return "$" + Math.round(n).toLocaleString("en-US");
}
function priceLabelFor(vehicle) {
  if (!vehicle) return "";
  const r = vehicle.id ? state.rates[vehicle.id] : null;
  if (r && typeof r.base === "number" && r.base > 0) {
    return "From " + fmtUsd(r.base) + "/hr";
  }
  return vehicle.displayPrice || "";
}
function airportFlatFor(vehicle, airport) {
  if (!vehicle || !vehicle.id) return null;
  const r = state.rates[vehicle.id];
  if (!r) return null;
  const k = String(airport || "").toUpperCase();
  const v = k === "FLL" ? r.fllFlat
          : k === "PBI" ? r.pbiFlat
          : r.miaFlat;
  return (typeof v === "number" && v > 0) ? v : null;
}

/* ─── Public API ──────────────────────────────────────────── */
window.LunaPricing = {
  rates()           { return state.rates; },
  rateFor(id)       { return id ? (state.rates[id] || null) : null; },
  allSurges()       { return Object.entries(state.surges).map(([id, s]) => ({ id, ...s })); },
  activeSurges(d)   { return activeSurgesOn(d); },
  surgeMultiplier(d){ return surgeMultiplierOn(d); },
  volumeTiers()     { return volumeTiersSorted(); },
  meta()            { return state.meta; },
  loaded()          { return state.loaded; },
  ready() {
    if (state.loaded) return Promise.resolve(state);
    return new Promise(resolve => firstResolveFns.push(resolve));
  },
  calculate,
  // Display helpers used across every vehicle surface
  fmtUsd,
  priceLabelFor,
  airportFlatFor,
};

/* ─── Subscribe ─────────────────────────────────────────── */

function subscribePath(path, onSnap) {
  try {
    onValue(
      ref(db, path),
      (snap) => {
        onSnap(snap.val() || {});
        markSnap();
        broadcast();
      },
      (err) => {
        console.error(`[pricing-store] subscribe ${path} failed:`, err);
        markSnap(); // still resolve so the page doesn't hang
      }
    );
  } catch (err) {
    console.error(`[pricing-store] init ${path} failed:`, err);
    markSnap();
  }
}

subscribePath("pricing/rates",        (v) => { state.rates  = v; });
subscribePath("pricing/surge",        (v) => { state.surges = v; });
subscribePath("pricing/volumeTiers",  (v) => { state.tiers  = v; });
subscribePath("pricing/meta",         (v) => { state.meta   = v; });

/* Always fire one synchronous broadcast on import so listeners
 * registered AFTER the script tag still get an immediate (empty)
 * render and can paint a loading state. */
queueMicrotask(broadcast);

export { state };
