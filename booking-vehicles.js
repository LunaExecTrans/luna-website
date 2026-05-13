/* ============================================================
 * Luna Executive Chauffeurs — Booking modal vehicle picker
 * ============================================================
 * Renders the 8 (or however many) canonical vehicles into the
 * booking modal's radio-card picker. Data is fed by vehicles-
 * store.js — when the dispatch admin edits a vehicle, this
 * picker re-renders within seconds.
 *
 * Radio `value=` mirrors `vehicle.name` exactly so:
 *   - the form submission to /api/form/submit + /dispatch/rides
 *     carries the same string the dispatch admin sees
 *   - stripe-booking.js can look up the price by name
 *   - the client mobile app sees a unified catalog
 *
 * Container in index.html:
 *   <div id="bookingVehicleGrid" class="vehicle-picker-rows" role="radiogroup" aria-label="Vehicle"></div>
 *
 * Tier label format mirrors the static design we shipped on
 * 2026-05-13 ("Tier I · Sedan", etc) so the visual rhythm stays
 * consistent if Firebase ever returns out-of-order data.
 * ============================================================ */

const TIER_LABEL = {
  Sedan: { roman: "Tier I",   noun: "Sedan",    fleetSection: "tier-sedan"    },
  SUV:   { roman: "Tier II",  noun: "SUV",      fleetSection: "tier-suv"      },
  Van:   { roman: "Tier III", noun: "Sprinter", fleetSection: "tier-van"      },
  Bus:   { roman: "Tier IV",  noun: "Bus",      fleetSection: "tier-bus"      },
  Coach: { roman: "Tier V",   noun: "Coach",    fleetSection: "tier-coach"    },
};

/* Default badge by vehicle id — promoted to UI elements until the
 * dispatch admin grows a `featuredBadge` text field of its own. */
function badgeFor(v) {
  if (v.featuredBadge) return v.featuredBadge;
  // Sensible defaults for the canonical fallback fleet so the
  // shipped UI keeps its rhythm even before dispatch sets values.
  if (v.id === "escalade") return "Most booked";
  if (v.id === "maybach")  return "Flagship";
  return "";
}

function priceFor(v) {
  if (v.displayPrice) return v.displayPrice;
  return "Quote on request";
}

const CHECK_SVG = '<svg class="vehicle-row-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
const ARROW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7"/><polyline points="9 7 17 7 17 15"/></svg>';

function renderCard(v, escapeHtml) {
  const tier = TIER_LABEL[v.tier] || TIER_LABEL.Sedan;
  const badge = badgeFor(v);
  const price = priceFor(v);
  const features = (v.features.length ? v.features : [
    `1–${v.pax} passengers`,
    "Wi-Fi, USB-C, climate zones",
    v.tagline || "Chauffeur on board, ready when you are",
  ]).slice(0, 3);

  // Use photo when present, glyph placeholder otherwise (Bus/Coach
  // ship without imagery on 2026-05-13).
  const thumb = v.hasPhoto
    ? `<span class="vehicle-row-thumb" aria-hidden="true">
         <img src="${escapeHtml(v.photo)}" alt="" loading="lazy" decoding="async" />
       </span>`
    : `<span class="vehicle-row-thumb vehicle-row-thumb--glyph" aria-hidden="true">
         <span class="vehicle-row-glyph">${escapeHtml(v.glyph)}</span>
       </span>`;

  const featuresHtml = features.map(f =>
    `<li>${CHECK_SVG}${escapeHtml(f)}</li>`
  ).join("");

  const badgeHtml = badge
    ? `<span class="vehicle-row-badge">${escapeHtml(badge)}</span>`
    : "";

  // Deep link to the fleet page anchor that fleet-data.js generates.
  const fleetAnchor = `fleet.html#vehicle-${escapeHtml(v.id)}`;

  return `
    <label class="vehicle-row-card">
      <input type="radio" name="vehicle" value="${escapeHtml(v.name)}" required />
      <div class="vehicle-row-top">
        <span class="vehicle-row-radio" aria-hidden="true"></span>
        ${thumb}
        <div class="vehicle-row-body">
          <p class="vehicle-row-head">
            <span class="vehicle-row-tier">${escapeHtml(tier.roman)} &middot; ${escapeHtml(tier.noun)}</span>
            <span class="vehicle-row-name">${escapeHtml(v.name)}</span>
            ${badgeHtml}
          </p>
          <ul class="vehicle-row-features" role="list">${featuresHtml}</ul>
        </div>
      </div>
      <div class="vehicle-row-foot">
        <a href="${fleetAnchor}" class="vehicle-row-learn" target="_blank" rel="noopener">
          See full specs
          ${ARROW_SVG}
        </a>
        <p class="vehicle-row-price"><span>${escapeHtml(price)}</span></p>
      </div>
    </label>`;
}

function renderPicker(list, escapeHtml) {
  const root = document.getElementById("bookingVehicleGrid");
  if (!root) return;
  if (!list.length) {
    root.innerHTML = `<p class="booking-form-section-hint">Catalog unavailable. Please call dispatch at <a href="tel:+19549109739" class="text-link">+1 (954) 910-9739</a> to reserve.</p>`;
    return;
  }
  root.innerHTML = list.map(v => renderCard(v, escapeHtml)).join("");

  // Preserve current selection across re-renders (e.g. if dispatch
  // edits a vehicle while a visitor has the modal open).
  const previouslyChecked = root.getAttribute("data-checked-value");
  if (previouslyChecked) {
    const input = root.querySelector(`input[type="radio"][value="${CSS.escape(previouslyChecked)}"]`);
    if (input) input.checked = true;
  }

  // Track selection so we can restore on next render.
  root.addEventListener("change", (e) => {
    const t = e.target;
    if (t && t.name === "vehicle" && t.checked) {
      root.setAttribute("data-checked-value", t.value);
    }
  }, { once: false });
}

function applyFromEvent(detail) {
  const escape = (window.LunaVehicles && window.LunaVehicles.escapeHtml)
    || (s => String(s == null ? "" : s).replace(/[&<>"']/g, c => (
      { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]
    )));
  renderPicker(detail.vehicles || [], escape);
}

window.addEventListener("luna:vehicles-updated", (e) => applyFromEvent(e.detail || {}));

if (window.LunaVehicles && typeof window.LunaVehicles.list === "function") {
  applyFromEvent({
    vehicles: window.LunaVehicles.list(),
    isFallback: window.LunaVehicles.isFallback(),
  });
}
