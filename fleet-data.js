/* ============================================================
 * Luna Executive Chauffeurs — Fleet page rendering
 * ============================================================
 * Renders the full fleet catalog into fleet.html, grouped by
 * tier. Data comes from `vehicles-store.js` — this module just
 * listens for `luna:vehicles-updated` events and re-renders
 * the grid container in place.
 *
 * Single source of truth = the dispatch admin (`vehicles.html`
 * in luna-dispatch). Edit a vehicle there → store re-broadcasts
 * → this re-renders within seconds. No subscribe duplication.
 * ============================================================ */

/* Tier metadata is presentation-only and stays on the website
 * (not in Firebase) — the dispatch admin shouldn't have to know
 * about editorial kicker/title copy. */
const TIER_ORDER = ["Sedan", "SUV", "Van", "Bus", "Coach"];
const TIER_LABEL = {
  Sedan: { kicker: "Tier I — The Sedan",     title: "Where the decision <em>gets made.</em>" },
  SUV:   { kicker: "Tier II — The SUV",      title: "Six adults. <em>Zero</em> compromise." },
  Van:   { kicker: "Tier III — The Sprinter",title: "Move the team. <em>Together.</em>" },
  Bus:   { kicker: "Tier IV — The Bus",      title: "Mid-size charter, <em>private</em> chauffeur." },
  Coach: { kicker: "Tier V — The Coach",     title: "Full-size charter. <em>One</em> standard." },
};

function renderCatalog(list, escapeHtml) {
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
    if (!groups[v.tier]) groups[v.tier] = [];
    groups[v.tier].push(v);
  }

  // Render in canonical order
  const html = TIER_ORDER
    .filter(tier => groups[tier] && groups[tier].length)
    .map(tier => {
      const meta = TIER_LABEL[tier];
      const cards = groups[tier].map(v => {
        const photo = v.hasPhoto
          ? `<img class="fleet-v-photo" src="${escapeHtml(v.photo)}" alt="${escapeHtml(v.name)}" loading="lazy" decoding="async" />`
          : `<div class="fleet-v-photo fleet-v-photo--empty" aria-hidden="true">${escapeHtml(v.glyph)}</div>`;

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

  // The shared CSS keeps [data-reveal] at opacity:0 until the
  // .is-visible class is applied — usually by app.js's
  // IntersectionObserver. But the observer only watches nodes that
  // existed on first boot; cards we inject after the fact stay
  // invisible. Apply .is-visible directly to every [data-reveal]
  // node inside the grid so the catalog renders immediately on
  // first paint and on every subsequent re-render.
  root.querySelectorAll("[data-reveal]").forEach(el => el.classList.add("is-visible"));
}

function applyFromEvent(detail) {
  const escape = (window.LunaVehicles && window.LunaVehicles.escapeHtml)
    || (s => String(s == null ? "" : s).replace(/[&<>"']/g, c => (
      { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]
    )));
  renderCatalog(detail.vehicles || [], escape);
}

window.addEventListener("luna:vehicles-updated", (e) => applyFromEvent(e.detail || {}));

// First paint — if the store already broadcast before we subscribed,
// LunaVehicles.list() gives us the current state immediately.
if (window.LunaVehicles && typeof window.LunaVehicles.list === "function") {
  applyFromEvent({
    vehicles: window.LunaVehicles.list(),
    isFallback: window.LunaVehicles.isFallback(),
  });
}
