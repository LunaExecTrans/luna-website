/* ============================================================
 * Luna Executive Chauffeurs — Fleet Showroom (interactive)
 * ============================================================
 * Renders the fleet page's premium showroom: category filters,
 * featured vehicle image, spec panel and thumbnail rail. Data
 * comes from vehicles-store.js (which subscribes to Firebase
 * /dispatch/vehicles). When the dispatcher edits a vehicle the
 * store re-broadcasts and the showroom re-renders in place.
 *
 * State is intentionally tiny — activeId + activeFilter — so a
 * dispatch update never clobbers the user's current selection
 * unless the active vehicle was removed.
 *
 * Markup contract (rendered HTML in fleet.html):
 *   #fleetFilters  — filter buttons rail
 *   #fleetImage    — featured vehicle image
 *   #fleetInfo     — spec panel
 *   #fleetRail     — thumbnail strip
 * ============================================================ */

/* Category → which tiers it includes. Keys map to vehicle.tier
   produced by vehicles-store.js (Sedan/SUV/Van/Bus/Coach). The
   "vip" filter is taglet-based — any vehicle whose featuredBadge
   matches "Flagship" or "Most booked" qualifies. */
const CATEGORIES = [
  { id: "all",      label: "All vehicles",     match: () => true },
  { id: "sedans",   label: "Sedans",           match: v => v.tier === "Sedan" },
  { id: "suvs",     label: "SUVs",             match: v => v.tier === "SUV" },
  { id: "sprinters",label: "Sprinters",        match: v => v.tier === "Van" },
  { id: "groups",   label: "Groups",           match: v => v.tier === "Bus" || v.tier === "Coach" },
  { id: "vip",      label: "Premium / VIP",    match: v => /flagship|most booked/i.test(v.featuredBadge || "") || v.id === "maybach" },
];

let activeId = null;
let activeFilter = "all";

/* ─── Helpers ─────────────────────────────────────────────── */

function escapeHtml(s) {
  return (window.LunaVehicles && window.LunaVehicles.escapeHtml)
    ? window.LunaVehicles.escapeHtml(s)
    : String(s == null ? "" : s).replace(/[&<>"']/g, c => (
        { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]
      ));
}

function filteredVehicles(list) {
  const cat = CATEGORIES.find(c => c.id === activeFilter) || CATEGORIES[0];
  return list.filter(cat.match);
}

function pickActive(list) {
  // Pick the active vehicle: prefer the previously-active one if it
  // still matches the current filter; otherwise fall back to the
  // first vehicle in the filtered list.
  const visible = filteredVehicles(list);
  if (!visible.length) return null;
  const current = visible.find(v => v.id === activeId);
  if (current) return current;
  activeId = visible[0].id;
  return visible[0];
}

/* ─── Renderers ───────────────────────────────────────────── */

function renderFilters(list) {
  const root = document.getElementById("fleetFilters");
  if (!root) return;
  // Only show filters that have at least one matching vehicle, so
  // the user never clicks an empty bucket. "All" always renders.
  const visible = CATEGORIES.filter(c => c.id === "all" || list.some(c.match));
  root.innerHTML = visible.map(c => {
    const isActive = c.id === activeFilter;
    const count = c.id === "all" ? list.length : list.filter(c.match).length;
    return `
      <button type="button"
              class="fleet-showroom-filter${isActive ? " is-active" : ""}"
              role="tab"
              aria-selected="${isActive}"
              data-filter="${escapeHtml(c.id)}">
        <span class="fleet-showroom-filter-label">${escapeHtml(c.label)}</span>
        <span class="fleet-showroom-filter-count" aria-hidden="true">${count}</span>
      </button>`;
  }).join("");
}

function renderRail(list) {
  const root = document.getElementById("fleetRail");
  if (!root) return;
  const visible = filteredVehicles(list);
  if (!visible.length) {
    root.innerHTML = `<p class="fleet-showroom-empty">No vehicles match this filter. Try another category.</p>`;
    return;
  }
  root.innerHTML = visible.map(v => {
    const isActive = v.id === activeId;
    const thumb = v.hasPhoto
      ? `<img class="fleet-showroom-thumb-img" src="${escapeHtml(v.photo)}" alt="" loading="lazy" decoding="async" />`
      : `<span class="fleet-showroom-thumb-glyph" aria-hidden="true">${escapeHtml(v.glyph)}</span>`;
    return `
      <button type="button"
              class="fleet-showroom-thumb${isActive ? " is-active" : ""}"
              role="tab"
              aria-selected="${isActive}"
              data-vehicle="${escapeHtml(v.id)}">
        <span class="fleet-showroom-thumb-frame">${thumb}</span>
        <span class="fleet-showroom-thumb-meta">
          <span class="fleet-showroom-thumb-name">${escapeHtml(v.name)}</span>
          <span class="fleet-showroom-thumb-class">${escapeHtml(v.type)}</span>
        </span>
      </button>`;
  }).join("");
}

function renderImage(v) {
  const root = document.getElementById("fleetImage");
  if (!root) return;
  if (!v) {
    root.innerHTML = `<p class="fleet-showroom-empty">No vehicle selected.</p>`;
    return;
  }
  // Cross-fade: render new content with `is-entering` class, then
  // remove it on next frame so the CSS transition runs.
  const photo = v.hasPhoto
    ? `<img class="fleet-showroom-image-photo" src="${escapeHtml(v.photo)}" alt="${escapeHtml(v.name)}" decoding="async" />`
    : `<span class="fleet-showroom-image-glyph" aria-hidden="true">${escapeHtml(v.glyph)}</span>`;
  const badge = v.featuredBadge
    ? `<span class="fleet-showroom-image-badge">${escapeHtml(v.featuredBadge)}</span>`
    : "";
  root.innerHTML = `
    <span class="fleet-showroom-image-aura" aria-hidden="true"></span>
    <div class="fleet-showroom-image-frame is-entering" data-frame>
      ${badge}
      ${photo}
      <span class="fleet-showroom-image-floor" aria-hidden="true"></span>
    </div>`;
  // Reflow then remove is-entering on the next animation frame.
  requestAnimationFrame(() => {
    const frame = root.querySelector("[data-frame]");
    if (frame) frame.classList.remove("is-entering");
  });
}

function chipFor(label) {
  return `<span class="fleet-showroom-chip">${escapeHtml(label)}</span>`;
}

function renderInfo(v) {
  const root = document.getElementById("fleetInfo");
  if (!root) return;
  if (!v) {
    root.innerHTML = `<p class="fleet-showroom-empty">No vehicle selected.</p>`;
    return;
  }

  const chips = (v.idealFor && v.idealFor.length)
    ? `<div class="fleet-showroom-chips" role="list" aria-label="Best for">${v.idealFor.slice(0, 5).map(chipFor).join("")}</div>`
    : "";

  // Spec rows — each carries a small SVG icon. Empty fields skip.
  const specRows = [];

  // Passengers (always)
  specRows.push(`
    <li class="fleet-showroom-spec">
      <svg class="fleet-showroom-spec-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22c0-4 4-7 8-7s8 3 8 7"/></svg>
      <span class="fleet-showroom-spec-label">Passengers</span>
      <span class="fleet-showroom-spec-value">1&ndash;${v.pax}</span>
    </li>`);

  // Luggage (if set)
  if (v.luggage !== "" && v.luggage != null) {
    const lugVal = typeof v.luggage === "number" ? `Up to ${v.luggage} bags` : escapeHtml(String(v.luggage));
    specRows.push(`
      <li class="fleet-showroom-spec">
        <svg class="fleet-showroom-spec-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="7" width="14" height="13" rx="1.5"/><path d="M9 7V4h6v3"/><line x1="9" y1="11" x2="9" y2="17"/><line x1="15" y1="11" x2="15" y2="17"/></svg>
        <span class="fleet-showroom-spec-label">Luggage</span>
        <span class="fleet-showroom-spec-value">${lugVal}</span>
      </li>`);
  }

  // Best for (if set)
  if (v.bestFor) {
    specRows.push(`
      <li class="fleet-showroom-spec">
        <svg class="fleet-showroom-spec-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <span class="fleet-showroom-spec-label">Best for</span>
        <span class="fleet-showroom-spec-value">${escapeHtml(v.bestFor)}</span>
      </li>`);
  }

  // Service type — derived from tier
  const tierService = {
    Sedan: "Airport &middot; Corporate",
    SUV:   "Airport &middot; VIP",
    Van:   "Groups &middot; Aviation",
    Bus:   "Events &middot; Corporate",
    Coach: "Events &middot; Shuttles",
  };
  specRows.push(`
    <li class="fleet-showroom-spec">
      <svg class="fleet-showroom-spec-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      <span class="fleet-showroom-spec-label">Service</span>
      <span class="fleet-showroom-spec-value">${tierService[v.tier] || "Private chauffeur"}</span>
    </li>`);

  // Starting rate (if set)
  if (v.displayPrice) {
    specRows.push(`
      <li class="fleet-showroom-spec">
        <svg class="fleet-showroom-spec-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="2" x2="12" y2="22"/><path d="M17 6H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6"/></svg>
        <span class="fleet-showroom-spec-label">Starting</span>
        <span class="fleet-showroom-spec-value">${escapeHtml(v.displayPrice)}</span>
      </li>`);
  }

  const specs = `<ul class="fleet-showroom-specs" role="list">${specRows.join("")}</ul>`;
  const tagline = v.tagline ? `<p class="fleet-showroom-info-tagline">${escapeHtml(v.tagline)}</p>` : "";

  root.innerHTML = `
    <div class="fleet-showroom-info-inner" data-info>
      <p class="fleet-showroom-info-tier mono">${escapeHtml(v.type)}</p>
      <h3 class="fleet-showroom-info-name">${escapeHtml(v.name)}</h3>
      ${tagline}
      ${chips}
      ${specs}
      <div class="fleet-showroom-info-cta">
        <a href="index.html#book" class="btn btn-primary">Reserve This Vehicle</a>
        <a href="tel:+19549109739" class="btn btn-ghost">Ask Dispatch</a>
      </div>
    </div>`;
  requestAnimationFrame(() => {
    const inner = root.querySelector("[data-info]");
    if (inner) inner.classList.add("is-entered");
  });
}

/* ─── Orchestrator ────────────────────────────────────────── */

function fullRender(list) {
  if (!list || !list.length) {
    // Empty catalog — still hide the loaders so the page doesn't sit
    // on "Loading the fleet…" forever.
    const filters = document.getElementById("fleetFilters");
    const rail    = document.getElementById("fleetRail");
    const image   = document.getElementById("fleetImage");
    const info    = document.getElementById("fleetInfo");
    if (filters) filters.innerHTML = "";
    if (rail)    rail.innerHTML    = `<p class="fleet-showroom-empty">Catalog is being prepared. Call dispatch at <a href="tel:+19549109739" class="text-link">+1 (954) 910-9739</a>.</p>`;
    if (image)   image.innerHTML   = "";
    if (info)    info.innerHTML    = "";
    return;
  }
  renderFilters(list);
  const active = pickActive(list);
  renderRail(list);
  renderImage(active);
  renderInfo(active);
}

/* ─── Event wiring ────────────────────────────────────────── */

document.addEventListener("click", (e) => {
  const filterBtn = e.target.closest("[data-filter]");
  if (filterBtn) {
    const newFilter = filterBtn.getAttribute("data-filter");
    if (newFilter && newFilter !== activeFilter) {
      activeFilter = newFilter;
      const list = (window.LunaVehicles && window.LunaVehicles.list()) || [];
      // Switching filter may put the current active out of view; let
      // pickActive choose the new one (it falls back to the first
      // matching vehicle).
      fullRender(list);
    }
    return;
  }
  const thumb = e.target.closest("[data-vehicle]");
  if (thumb) {
    const newId = thumb.getAttribute("data-vehicle");
    if (newId && newId !== activeId) {
      activeId = newId;
      const list = (window.LunaVehicles && window.LunaVehicles.list()) || [];
      // Re-render only the affected pieces for a snappier feel.
      renderRail(list);
      const v = list.find(x => x.id === activeId) || null;
      renderImage(v);
      renderInfo(v);
    }
  }
});

/* ─── Store integration ───────────────────────────────────── */

window.addEventListener("luna:vehicles-updated", (e) => {
  const detail = e.detail || {};
  fullRender(detail.vehicles || []);
});

// First paint
if (window.LunaVehicles && typeof window.LunaVehicles.list === "function") {
  fullRender(window.LunaVehicles.list());
}
