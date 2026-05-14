/* ============================================================
 * Luna Executive Chauffeurs — Shared vehicles store
 * ============================================================
 * Single subscriber to /dispatch/vehicles (Firebase RTDB) for
 * the public site. Renders are coordinated through a custom
 * event so any number of surfaces can react to fleet changes
 * without each duplicating the subscribe + normalize logic.
 *
 * Source of truth: the dispatch admin (`vehicles.html` in
 * luna-dispatch). Edit a vehicle there and within seconds the
 * fleet page, booking modal, account dropdowns and rates table
 * all update in place.
 *
 * Surfaces consuming this store:
 *   - fleet-data.js          (fleet.html catalog grid)
 *   - booking-vehicles.js    (index.html booking modal picker)
 *   - rates-data.js          (rates.html hourly table)
 *   - account-vehicles.js    (account.html + profile.html selects)
 *
 * Public API (always available on `window.LunaVehicles`):
 *   list()        → array of normalized vehicles, sorted by tier
 *   byId(id)      → one normalized vehicle or null
 *   byName(name)  → one normalized vehicle or null
 *   isFallback()  → true when no Firebase data has arrived yet
 *   ready()       → Promise that resolves with the first non-fallback list
 *                   (or with the fallback if Firebase returns empty)
 *
 * Public events (window-level CustomEvent):
 *   luna:vehicles-updated → e.detail = { vehicles, isFallback }
 *     Fires once on initial render (with fallback if Firebase is
 *     still loading), then again every time RTDB changes.
 *
 * Fallback contract: mirrors luna-executive-client useVehicles.js
 * FALLBACK_FLEET so the website never shows an empty catalog,
 * even on cold first-load before Firebase resolves.
 * ============================================================ */

import { db } from "./firebase.js";
import {
  ref,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ─── Canonical fallback (mirror of fleet-data.js + client app) ─
 * Order matches useVehicles.js exactly: S-Class → Maybach → Escalade
 * → Sprinter Jet 7 → Sprinter 11 → Sprinter 14 → Bus → Coach.
 * Pricing strings are display-only — actual pre-auth math lives
 * in stripe-booking.js, keyed by `name`.                          */
const FALLBACK_FLEET = [
  { id: "mercedes-s-class", name: "Mercedes S-Class",     type: "Sedan", pax:  3, luggage: 2,  bestFor: "Quiet executive arrival",                              idealFor: ["Airport transfers", "Corporate travel", "Solo executives", "Couples"],            tagline: "Flagship sedan. Quiet by design.",                  features: ["Black-on-black livery", "Climate zones", "USB-C, Wi-Fi, water"],                       displayPrice: "From $95/hr",       featuredBadge: "" },
  { id: "maybach",          name: "Mercedes Maybach",     type: "Sedan", pax:  3, luggage: 2,  bestFor: "Premium discretion",                                   idealFor: ["VIP movement", "Private aviation", "Corporate principals", "High-profile clients"], tagline: "The quietest room in Miami.",                       features: ["Reclining executive rear seats", "Champagne fridge optional", "Burmester sound, masseurs"], displayPrice: "Quote on request",  featuredBadge: "Flagship" },
  { id: "escalade",         name: "Cadillac Escalade",    type: "SUV",   pax:  6, luggage: 5,  bestFor: "Luggage and families",                                 idealFor: ["Airport transfers", "VIP movement", "Families", "Luggage-heavy arrivals"],         tagline: "Standard SUV. Six adults, full luggage.",            features: ["Captain seats row 2", "Three-zone climate", "USB-C, Wi-Fi, cold water"],                  displayPrice: "From $135/hr",      featuredBadge: "Most booked" },
  { id: "jet-sprinter-7",   name: "Jet Sprinter 7-Seat",  type: "Van",   pax:  7, luggage: 7,  bestFor: "First-class group",                                    idealFor: ["Private aviation", "Executive groups", "Roadshows", "FBO pickups"],                tagline: "First-class on wheels.",                            features: ["7 first-class captain chairs", "Conference table", "Premium audio"],                      displayPrice: "From $195/hr",      featuredBadge: "" },
  { id: "sprinter-11",      name: "Sprinter 11-Seat",     type: "Van",   pax: 11, luggage: 10, bestFor: "Mid-size group",                                       idealFor: ["Weddings", "Special events", "Teams", "Group airport transfers"],                  tagline: "Mid-size group. More legroom.",                     features: ["11 captain seats", "Wi-Fi, USB-C", "Climate zones"],                                       displayPrice: "Quote on request",  featuredBadge: "" },
  { id: "sprinter-14",      name: "Sprinter 14-Seat",     type: "Van",   pax: 14, luggage: 12, bestFor: "Group transport",                                      idealFor: ["Weddings", "Conferences", "Corporate teams", "Group transfers"],                   tagline: "Group transport. Same standard.",                   features: ["14 forward-facing seats", "Wi-Fi, USB-C", "Full luggage compartment"],                      displayPrice: "Quote on request",  featuredBadge: "" },
  { id: "bus",              name: "Luxury Bus",           type: "Bus",   pax: 30, luggage: 20, bestFor: "30-guest group transport",                             idealFor: ["Conferences", "Mid-size groups", "Event shuttles", "Corporate events"],            tagline: "Mid-size charter for groups of 30.",                features: ["Reclining seats", "Restroom on board", "PA system, USB-C"],                                displayPrice: "Quote on request",  featuredBadge: "" },
  { id: "coach",            name: "Charter Coach",        type: "Coach", pax: 50, luggage: 35, bestFor: "Large group transport",                                idealFor: ["Large events", "Wedding shuttles", "Corporate groups", "Multi-day group travel"],   tagline: "Full-size 50-seat charter coach.",                  features: ["Reclining seats with tray tables", "Restroom on board", "Audio/video, Wi-Fi"],              displayPrice: "Quote on request",  featuredBadge: "" },
];

/* Photos bundled with the site, keyed by vehicle slug. Used when
 * the Firebase record doesn't carry a `photo` URL (or when running
 * on the fallback list). Bus + Coach are intentionally absent —
 * the picker falls back to a glyph thumb (see styles.css
 * .vehicle-row-thumb--glyph).                                     */
const LOCAL_PHOTO_BY_ID = {
  "mercedes-s-class": "assets/s-class.png",
  "maybach":          "assets/Mayback.png",
  "escalade":         "assets/escalade.png",
  "jet-sprinter-7":   "assets/jet-sprinter-7.png",
  "sprinter-11":      "assets/sprinter-black.png",
  "sprinter-14":      "assets/sprinter-black.png",
};

/* Hardcoded glyph fallback per type — used when no photo at all. */
const GLYPH_BY_TYPE = {
  sedan: "◯",
  suv:   "◆",
  van:   "◇",
  bus:   "◼",
  coach: "◈",
};

/* Tier index controls sort order across surfaces. */
const TIER_INDEX = { Sedan: 0, SUV: 1, Van: 2, Bus: 3, Coach: 4 };

/* ─── Helpers ─────────────────────────────────────────────── */

function tierOf(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("coach")) return "Coach";
  if (t.includes("bus"))   return "Bus";
  if (t.includes("van") || t.includes("sprinter") || t.includes("shuttle")) return "Van";
  if (t.includes("suv"))   return "SUV";
  return "Sedan";
}

function inferPax(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("coach")) return 50;
  if (t.includes("bus"))   return 30;
  if (t.includes("van") || t.includes("sprinter") || t.includes("shuttle")) return 14;
  if (t.includes("suv"))   return 6;
  return 3;
}

function glyphFor(type) {
  return GLYPH_BY_TYPE[tierOf(type).toLowerCase()] || "◯";
}

function localPhotoFor(id) {
  return id && LOCAL_PHOTO_BY_ID[id] || "";
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Sort: by tier (Sedan → Coach), then explicit `bookingOrder`
 * field if present (lets dispatch override default ordering),
 * then by pax ascending, then by createdAt ascending. */
function sortVehicles(list) {
  return list.slice().sort((a, b) => {
    const ta = TIER_INDEX[tierOf(a.type)] ?? 99;
    const tb = TIER_INDEX[tierOf(b.type)] ?? 99;
    if (ta !== tb) return ta - tb;
    const oa = typeof a.bookingOrder === "number" ? a.bookingOrder : 99;
    const ob = typeof b.bookingOrder === "number" ? b.bookingOrder : 99;
    if (oa !== ob) return oa - ob;
    if ((a.pax || 0) !== (b.pax || 0)) return (a.pax || 0) - (b.pax || 0);
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

/* Normalize one record (Firebase node OR fallback row) into the
 * shape the rest of the site expects. Includes precomputed
 * display fields so render callsites stay readable.              */
function normalize(id, raw) {
  const tier   = tierOf(raw.type);
  const photo  = raw.photo || localPhotoFor(id);
  const pax    = (typeof raw.pax === "number" && raw.pax > 0) ? raw.pax : inferPax(raw.type);
  // luggage can be a number (preferred) or a string ("up to 5", "varies");
  // both are passed through so the renderer can keep the original wording.
  let luggage = raw.luggage;
  if (luggage == null || luggage === "") luggage = "";
  return {
    id,
    name:       raw.name || "Untitled Vehicle",
    type:       raw.type || "Vehicle",
    tier,
    pax,
    luggage,                                                                                        // new
    bestFor:    raw.bestFor || "",                                                                   // new
    idealFor:   Array.isArray(raw.idealFor) ? raw.idealFor.filter(Boolean) : [],                     // new
    plate:      raw.plate || "",
    photo,
    hasPhoto:   !!photo,
    glyph:      glyphFor(raw.type),
    tagline:    raw.tagline || "",
    features:   Array.isArray(raw.features) ? raw.features.filter(Boolean) : [],
    displayPrice:  raw.displayPrice  || "",
    featuredBadge: raw.featuredBadge || "",
    bookingOrder:  typeof raw.bookingOrder === "number" ? raw.bookingOrder : null,
    createdAt:  raw.createdAt || 0,
    _escape:    escapeHtml,
  };
}

function normalizeFallback() {
  return sortVehicles(FALLBACK_FLEET.map(v => normalize(v.id, v)));
}

/* ─── Store state ─────────────────────────────────────────── */

let state = {
  vehicles: normalizeFallback(),
  isFallback: true,
};

let firstResolveFns = [];

function broadcast() {
  try {
    window.dispatchEvent(new CustomEvent("luna:vehicles-updated", {
      detail: {
        vehicles: state.vehicles,
        isFallback: state.isFallback,
      }
    }));
  } catch (e) {
    console.error("[vehicles-store] broadcast failed:", e);
  }
}

function resolveFirst() {
  if (!firstResolveFns.length) return;
  const fns = firstResolveFns;
  firstResolveFns = [];
  fns.forEach(fn => { try { fn(state.vehicles); } catch (_) {} });
}

/* ─── Public API ──────────────────────────────────────────── */

window.LunaVehicles = {
  list()       { return state.vehicles; },
  byId(id)     { return state.vehicles.find(v => v.id === id) || null; },
  byName(name) {
    const n = String(name || "").toLowerCase();
    return state.vehicles.find(v => String(v.name).toLowerCase() === n) || null;
  },
  isFallback() { return state.isFallback; },
  ready() {
    if (!state.isFallback) return Promise.resolve(state.vehicles);
    return new Promise(resolve => firstResolveFns.push(resolve));
  },
  /* Escape helper exposed for render callsites that don't import
   * their own (avoids drift between escapers). */
  escapeHtml,
};

/* ─── Subscribe ─────────────────────────────────────────── */

try {
  const node = ref(db, "dispatch/vehicles");
  onValue(
    node,
    (snap) => {
      const val = snap.val() || {};
      const entries = Object.entries(val);

      if (!entries.length) {
        // RTDB empty (dispatcher hasn't seeded fleet yet) — keep the
        // canonical fallback so visitors never see an empty catalog.
        state = { vehicles: normalizeFallback(), isFallback: true };
      } else {
        state = {
          vehicles: sortVehicles(entries.map(([id, raw]) => normalize(id, raw))),
          isFallback: false,
        };
      }
      broadcast();
      resolveFirst();
    },
    (err) => {
      console.error("[vehicles-store] subscribe failed:", err);
      // Keep last good state, but still resolve waiters with the
      // fallback so dependent UI doesn't hang on ready().
      resolveFirst();
    }
  );
} catch (err) {
  console.error("[vehicles-store] init failed:", err);
  resolveFirst();
}

/* Always fire one synchronous broadcast on import so listeners
 * registered AFTER the script tag still get an immediate render
 * (with fallback data) — they don't have to wait for the first
 * RTDB roundtrip. */
queueMicrotask(broadcast);

export { state };
