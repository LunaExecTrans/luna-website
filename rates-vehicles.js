/* ============================================================
 * Luna Executive Chauffeurs — Rates page vehicle cards
 * ============================================================
 * Renders the "Hourly · As-Directed" block on rates.html as a
 * premium card grid (one card per vehicle) instead of a dense
 * table. Each card shows:
 *
 *   - Vehicle photo + tier + name
 *   - LIVE base rate from pricing/rates/{id}.base
 *     (falls back to vehicle.displayPrice while pricing is loading
 *      or until the owner has set a rate)
 *   - LIVE hourly minimum from pricing/rates/{id}.hourlyMinimum
 *   - LIVE per-mile rate from pricing/rates/{id}.perMile
 *     (only shown when set — it's the dispatch lever for
 *      mileage-driven point-to-point quotes)
 *   - "Best for" tagline pulled from the vehicle record
 *   - Live airport flats peek (MIA / FLL / PBI) when set, so the
 *     same card answers "what's it for an airport run?" without
 *     making the visitor jump back to a separate table.
 *
 * The whole block re-renders on TWO events:
 *   - luna:vehicles-updated   (fleet/catalog changed)
 *   - luna:pricing-updated    (owner saved new rates in dispatch)
 * So the cards stay accurate seconds after a dispatch edit, with
 * no full page refresh required.
 *
 * Container in rates.html (replaces the legacy <tbody id="ratesHourlyBody">):
 *   <div id="ratesHourlyCards"></div>
 * If the legacy <tbody> is still present we hide it on first paint.
 * ============================================================ */

const TIER_LABEL = {
  Sedan: { roman: "Tier I",   noun: "Sedan",    fleetSection: "tier-sedan"    },
  SUV:   { roman: "Tier II",  noun: "SUV",      fleetSection: "tier-suv"      },
  Van:   { roman: "Tier III", noun: "Sprinter", fleetSection: "tier-van"      },
  Bus:   { roman: "Tier IV",  noun: "Bus",      fleetSection: "tier-bus"      },
  Coach: { roman: "Tier V",   noun: "Coach",    fleetSection: "tier-coach"    },
};

/* Minimum hours by tier — UX defaults shown when the dispatch
 * admin hasn't set hourlyMinimum yet. Aligned with the estimate
 * model in stripe-booking.js HOURLY table. */
function defaultMinHoursForTier(tier) {
  switch (tier) {
    case "SUV":   return 3;
    case "Van":
    case "Bus":
    case "Coach": return 4;
    default:      return 2;
  }
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function fmtUsd0(n) {
  if (typeof n !== "number" || !isFinite(n)) return "";
  return "$" + Math.round(n).toLocaleString("en-US");
}
function fmtUsd2(n) {
  if (typeof n !== "number" || !isFinite(n)) return "";
  return "$" + n.toFixed(2);
}

/* Pull the live rate for a vehicle from the pricing store, with
 * a safe empty fallback so render code can read properties without
 * null checks at every callsite. */
function liveRate(v) {
  if (window.LunaPricing && typeof window.LunaPricing.rateFor === "function") {
    return window.LunaPricing.rateFor(v.id) || {};
  }
  return {};
}

/* The signature stat line: per-hour rate. Owner-defined when
 * available, else the legacy `displayPrice` parsed for "$NNN". */
function hourlyDisplay(v, r) {
  if (typeof r.base === "number" && r.base > 0) {
    return { value: fmtUsd0(r.base), unit: "/hr", live: true };
  }
  const m = v.displayPrice && /\$(\d+)/.exec(v.displayPrice);
  if (m) return { value: "$" + m[1], unit: "/hr", live: false };
  return { value: "Quote", unit: "", live: false };
}

function minHoursDisplay(v, r) {
  if (typeof r.hourlyMinimum === "number" && r.hourlyMinimum > 0 && typeof r.base === "number" && r.base > 0) {
    // hourlyMinimum is stored in dollars; divide by base to surface
    // the minimum as "N hours" the visitor can scan instantly.
    const hours = r.hourlyMinimum / r.base;
    if (isFinite(hours) && hours >= 1) return Math.round(hours * 10) / 10;
  }
  return defaultMinHoursForTier(v.tier);
}

function perMileChip(r) {
  if (typeof r.perMile === "number" && r.perMile > 0) {
    return `<span class="rate-card-meta-chip">
              <span class="rate-card-meta-key">Per mile</span>
              <span class="rate-card-meta-val">${escapeHtml(fmtUsd2(r.perMile))}</span>
            </span>`;
  }
  return "";
}

function airportRow(r) {
  const pairs = [
    { key: "MIA", val: r.miaFlat },
    { key: "FLL", val: r.fllFlat },
    { key: "PBI", val: r.pbiFlat },
  ].filter(p => typeof p.val === "number" && p.val > 0);
  if (!pairs.length) return "";
  return `
    <div class="rate-card-airports">
      <p class="rate-card-airports-label">Airport flats</p>
      <ul class="rate-card-airports-list" role="list">
        ${pairs.map(p => `
          <li>
            <span class="rate-card-airports-key mono">${escapeHtml(p.key)}</span>
            <span class="rate-card-airports-val mono">${escapeHtml(fmtUsd0(p.val))}</span>
          </li>`).join("")}
      </ul>
    </div>`;
}

function thumbHtml(v) {
  return v.hasPhoto
    ? `<img class="rate-card-thumb-img" src="${escapeHtml(v.photo)}" alt="" loading="lazy" decoding="async" />`
    : `<span class="rate-card-thumb-glyph" aria-hidden="true">${escapeHtml(v.glyph)}</span>`;
}

function bestForCopy(v) {
  if (v.tagline) return v.tagline;
  return `1–${v.pax} guests · reserved by the hour`;
}

function cardHtml(v) {
  const tier   = TIER_LABEL[v.tier] || TIER_LABEL.Sedan;
  const r      = liveRate(v);
  const price  = hourlyDisplay(v, r);
  const minHrs = minHoursDisplay(v, r);
  const fleetAnchor = `fleet.html#vehicle-${escapeHtml(v.id)}`;

  const liveBadge = price.live
    ? `<span class="rate-card-live" title="Live from dispatch rate card">
         <span class="rate-card-live-dot" aria-hidden="true"></span>Live
       </span>`
    : "";

  return `
    <article class="rate-card" data-tier="${escapeHtml(v.tier)}">
      <header class="rate-card-head">
        <span class="rate-card-thumb">${thumbHtml(v)}</span>
        <div class="rate-card-titleblock">
          <p class="rate-card-tier mono">${escapeHtml(tier.roman)} &middot; ${escapeHtml(tier.noun)}</p>
          <h3 class="rate-card-name">${escapeHtml(v.name)}</h3>
          <p class="rate-card-bestfor">${escapeHtml(bestForCopy(v))}</p>
        </div>
      </header>

      <div class="rate-card-price">
        <span class="rate-card-price-amount">${escapeHtml(price.value)}</span>
        <span class="rate-card-price-unit">${escapeHtml(price.unit)}</span>
        ${liveBadge}
      </div>

      <ul class="rate-card-meta" role="list">
        <li class="rate-card-meta-chip">
          <span class="rate-card-meta-key">Hourly min</span>
          <span class="rate-card-meta-val">${escapeHtml(minHrs + " hr")}</span>
        </li>
        ${perMileChip(r)}
        <li class="rate-card-meta-chip">
          <span class="rate-card-meta-key">Up to</span>
          <span class="rate-card-meta-val">${escapeHtml(v.pax + " guests")}</span>
        </li>
      </ul>

      ${airportRow(r)}

      <footer class="rate-card-foot">
        <a href="${fleetAnchor}" class="rate-card-link">See full specs &rarr;</a>
        <a href="index.html#book" class="btn btn-primary btn-sm">Reserve this</a>
      </footer>
    </article>`;
}

function renderGrid(list) {
  const grid = document.getElementById("ratesHourlyCards");
  if (!grid) return;

  if (!list.length) {
    grid.innerHTML = `
      <p class="rate-card-empty">
        Catalog unavailable. Call dispatch at
        <a href="tel:+19549109739" class="text-link">+1 (954) 910-9739</a>
        to reserve.
      </p>`;
    return;
  }

  grid.innerHTML = list.map(cardHtml).join("");
}

/* Hide the legacy <table> body and reveal the new grid. Lets us
 * ship the script while leaving the old markup intact for a deploy
 * or two — if the script ever fails, the table still renders the
 * "Loading rates…" placeholder so the section isn't blank. */
function ensureLayout() {
  const legacyTbody = document.getElementById("ratesHourlyBody");
  const legacyTable = legacyTbody && legacyTbody.closest("table");
  const legacyWrap  = legacyTable && legacyTable.closest(".rate-table-wrap");
  if (legacyWrap) legacyWrap.hidden = true;

  let grid = document.getElementById("ratesHourlyCards");
  if (!grid) {
    grid = document.createElement("div");
    grid.id = "ratesHourlyCards";
    grid.className = "rate-cards-grid";
    if (legacyWrap && legacyWrap.parentNode) {
      legacyWrap.parentNode.insertBefore(grid, legacyWrap);
    } else {
      // No legacy wrap — append to the rate block headed by "Hourly · As-Directed".
      const head = document.querySelector(".section-rates .rate-block .kicker");
      const block = head && head.closest(".rate-block");
      if (block) block.appendChild(grid);
    }
  }
}

function applyFromEvent(detail) {
  ensureLayout();
  renderGrid(detail && detail.vehicles ? detail.vehicles : []);
}

window.addEventListener("luna:vehicles-updated", (e) => applyFromEvent(e.detail || {}));
window.addEventListener("luna:pricing-updated", () => {
  if (!window.LunaVehicles || typeof window.LunaVehicles.list !== "function") return;
  applyFromEvent({ vehicles: window.LunaVehicles.list() });
});

if (window.LunaVehicles && typeof window.LunaVehicles.list === "function") {
  applyFromEvent({ vehicles: window.LunaVehicles.list() });
}
