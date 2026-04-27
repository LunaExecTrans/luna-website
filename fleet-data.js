/* ============================================================
 * Luna Executive Chauffeurs — Fleet page data binding
 * ============================================================
 * Reads /dispatch/vehicles in real-time from Firebase RTDB and
 * renders the catalog into the fleet page. Single source of
 * truth = the dispatch admin (vehicles.html in luna-dispatch).
 * Edit a vehicle there → it propagates here within seconds.
 *
 * If Firebase is empty (cold start, no records yet) we fall
 * back to the same 8 canonical vehicles the mobile client app
 * uses (see luna-executive-client/src/hooks/useVehicles.js
 * → FALLBACK_FLEET) so the site never shows an empty fleet
 * page even before the dispatcher seeds the catalog.
 * ============================================================ */

import { db } from "./firebase.js";
import {
  ref,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ─── Fallback (mirrors luna-executive-client FALLBACK_FLEET) ── */
const FALLBACK_FLEET = [
  { id: "mercedes-s-class", name: "Mercedes S-Class",     type: "Sedan", pax:  3, tagline: "Flagship sedan. Quiet by design.",                  features: ["Black-on-black livery", "Climate zones", "USB-C, Wi-Fi, water"] },
  { id: "escalade",         name: "Cadillac Escalade",    type: "SUV",   pax:  6, tagline: "Standard SUV. Six adults, full luggage.",            features: ["Captain seats row 2", "Three-zone climate", "USB-C, Wi-Fi, cold water"] },
  { id: "maybach",          name: "Mercedes Maybach",     type: "Sedan", pax:  3, tagline: "The quietest room in Miami.",                       features: ["Reclining executive rear seats", "Champagne fridge optional", "Burmester sound, masseurs"] },
  { id: "sprinter-14",      name: "Sprinter 14-Seat",     type: "Van",   pax: 14, tagline: "Group transport. Same standard.",                   features: ["14 forward-facing seats", "Wi-Fi, USB-C", "Full luggage compartment"] },
  { id: "sprinter-11",      name: "Sprinter 11-Seat",     type: "Van",   pax: 11, tagline: "Mid-size group. More legroom.",                     features: ["11 captain seats", "Wi-Fi, USB-C", "Climate zones"] },
  { id: "jet-sprinter-7",   name: "Jet Sprinter 7-Seat",  type: "Van",   pax:  7, tagline: "First-class on wheels.",                            features: ["7 first-class captain chairs", "Conference table", "Premium audio"] },
  { id: "bus",              name: "Luxury Bus",           type: "Bus",   pax: 30, tagline: "Mid-size charter for groups of 30.",                features: ["Reclining seats", "Restroom on board", "PA system, USB-C"] },
  { id: "coach",            name: "Charter Coach",        type: "Coach", pax: 50, tagline: "Full-size 55-seat motor coach.",                    features: ["Reclining seats with tray tables", "Restroom on board", "Audio/video, Wi-Fi"] },
];

/* ─── Helpers ─────────────────────────────────────────────── */

/* Same inference logic the mobile hook uses (luna-executive-client
 * useVehicles.js inferFromType). Mirrors so both surfaces resolve
 * pax/icon identically when dispatcher leaves them blank. */
function inferFromType(type = "") {
  const t = String(type).toLowerCase();
  if (t.includes("coach")) return { pax: 50, glyph: "◈" };
  if (t.includes("bus")) return { pax: 30, glyph: "◼" };
  if (t.includes("van") || t.includes("sprinter") || t.includes("shuttle")) return { pax: 14, glyph: "◇" };
  if (t.includes("suv") || t.includes("escalade") || t.includes("suburban")) return { pax: 6, glyph: "◆" };
  return { pax: 3, glyph: "◯" };
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Group vehicles by tier. Ordered: Sedan → SUV → Van → Bus → Coach. */
const TIER_ORDER = ["Sedan", "SUV", "Van", "Bus", "Coach"];
const TIER_LABEL = {
  Sedan: { kicker: "Tier I — The Sedan",     title: "Where the decision <em>gets made.</em>" },
  SUV:   { kicker: "Tier II — The SUV",      title: "Six adults. <em>Zero</em> compromise." },
  Van:   { kicker: "Tier III — The Sprinter",title: "Move the team. <em>Together.</em>" },
  Bus:   { kicker: "Tier IV — The Bus",      title: "Mid-size charter, <em>private</em> chauffeur." },
  Coach: { kicker: "Tier V — The Coach",     title: "Full-size charter. <em>One</em> standard." },
};

function tierOf(type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("coach")) return "Coach";
  if (t.includes("bus")) return "Bus";
  if (t.includes("van") || t.includes("sprinter") || t.includes("shuttle")) return "Van";
  if (t.includes("suv")) return "SUV";
  return "Sedan";
}

/* Normalize one Firebase node + fallback values. */
function normalize(id, raw = {}) {
  const inferred = inferFromType(raw.type);
  return {
    id,
    name: raw.name || "Untitled Vehicle",
    type: raw.type || "Vehicle",
    plate: raw.plate || "",
    photo: raw.photo || "",
    pax: typeof raw.pax === "number" && raw.pax > 0 ? raw.pax : inferred.pax,
    tagline: raw.tagline || "",
    features: Array.isArray(raw.features) ? raw.features.filter(Boolean) : [],
    createdAt: raw.createdAt || 0,
  };
}

/* ─── Render ─────────────────────────────────────────────── */

function renderCatalog(list) {
  const root = document.getElementById("fleetGrid");
  if (!root) return;

  if (!list.length) {
    root.innerHTML = `
      <p class="fleet-catalog-empty">
        Catalog is being prepared. Call dispatch at
        <a href="tel:+19549109739" class="text-link">+1 (954) 910-9739</a> for vehicle availability.
      </p>`;
    return;
  }

  // Group by tier
  const groups = {};
  for (const v of list) {
    const tier = tierOf(v.type);
    if (!groups[tier]) groups[tier] = [];
    groups[tier].push(v);
  }

  // Render in canonical order
  const html = TIER_ORDER
    .filter(tier => groups[tier] && groups[tier].length)
    .map(tier => {
      const meta = TIER_LABEL[tier];
      const cards = groups[tier].map(v => {
        const photo = v.photo
          ? `<img class="fleet-v-photo" src="${escapeHtml(v.photo)}" alt="${escapeHtml(v.name)}" loading="lazy" decoding="async" />`
          : `<div class="fleet-v-photo fleet-v-photo--empty" aria-hidden="true">${escapeHtml(inferFromType(v.type).glyph)}</div>`;

        const features = v.features.length
          ? `<ul class="fleet-v-features">${v.features.slice(0, 6).map(f => `<li>${escapeHtml(f)}</li>`).join("")}</ul>`
          : "";

        const tagline = v.tagline
          ? `<p class="fleet-v-tagline">${escapeHtml(v.tagline)}</p>`
          : "";

        return `
          <article class="fleet-v-card" id="vehicle-${escapeHtml(v.id)}" data-reveal>
            <div class="fleet-v-frame">${photo}</div>
            <div class="fleet-v-body">
              <p class="fleet-v-meta"><span class="fleet-v-type">${escapeHtml(v.type)}</span> &middot; <span class="fleet-v-pax">${v.pax} passengers</span></p>
              <h3 class="fleet-v-name">${escapeHtml(v.name)}</h3>
              ${tagline}
              ${features}
              <a href="index.html#book" class="fleet-v-cta">Reserve this vehicle &rarr;</a>
            </div>
          </article>`;
      }).join("");

      return `
        <section class="fleet-tier" id="tier-${tier.toLowerCase()}" aria-labelledby="tier-${tier.toLowerCase()}-heading">
          <header class="fleet-tier-head" data-reveal>
            <p class="kicker">${meta.kicker}</p>
            <h2 class="fleet-tier-title" id="tier-${tier.toLowerCase()}-heading">${meta.title}</h2>
          </header>
          <div class="fleet-catalog-grid">${cards}</div>
        </section>`;
    })
    .join("");

  root.innerHTML = html;

  // Re-trigger reveal animations on the newly-injected nodes.
  // The site's app.js IntersectionObserver already targets `[data-reveal]`,
  // but since these were injected after page load we need to nudge it.
  if (typeof window.LunaReveal === "function") {
    window.LunaReveal();
  } else {
    document.querySelectorAll("[data-reveal]").forEach(el => el.classList.add("is-revealed"));
  }
}

/* ─── Subscribe ─────────────────────────────────────────── */

const node = ref(db, "dispatch/vehicles");
onValue(
  node,
  (snap) => {
    const val = snap.val() || {};
    const list = Object.entries(val).map(([id, raw]) => normalize(id, raw));

    if (!list.length) {
      // Empty catalog — show the canonical 8 so the page is never bare.
      renderCatalog(FALLBACK_FLEET.map(v => normalize(v.id, v)));
      return;
    }

    // Sort: Sedan → SUV → Van → Bus → Coach, then by createdAt within each tier.
    const tierIdx = { Sedan: 0, SUV: 1, Van: 2, Bus: 3, Coach: 4 };
    list.sort((a, b) => {
      const ta = tierIdx[tierOf(a.type)] ?? 99;
      const tb = tierIdx[tierOf(b.type)] ?? 99;
      if (ta !== tb) return ta - tb;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    renderCatalog(list);
  },
  (err) => {
    console.error("[fleet-data] listener error:", err);
    // Show fallback so visitors aren't stuck on a blank page when Firebase fails.
    renderCatalog(FALLBACK_FLEET.map(v => normalize(v.id, v)));
  }
);
