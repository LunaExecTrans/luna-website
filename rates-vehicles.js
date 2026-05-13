/* ============================================================
 * Luna Executive Chauffeurs — Rates page Hourly table
 * ============================================================
 * Renders the Hourly · As-Directed table on rates.html from the
 * shared vehicles-store. Same data drives the booking modal, the
 * fleet page and the account dropdowns — edit one vehicle in
 * dispatch and the whole site updates within seconds.
 *
 * Container: <tbody id="ratesHourlyBody"> inside the existing
 * .rate-table (rates.html).
 *
 * The Airport-transfer table (`Sedan/SUV/Sprinter` columns) is
 * NOT driven from here — its tier-level baseline pricing stays
 * static for now; premium variants are quoted via dispatch.
 *
 * Note on prices: vehicle records may carry a `displayPrice`
 * string ("From $95/hr") OR leave it blank. When blank, this
 * renders "Quote" so the table is never empty. Pricing fields
 * in the dispatch admin schema are pending Denis's rate pass
 * (`project_luna_launch_remaining.md`).
 * ============================================================ */

const TIER_GROUP_LABEL = {
  Sedan: "Sedan",
  SUV:   "SUV",
  Van:   "Sprinter",
  Bus:   "Bus / Coach",
  Coach: "Bus / Coach",
};
const TIER_ORDER = ["Sedan", "SUV", "Van", "Bus", "Coach"];

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Minimum hours by tier — UX defaults until the dispatch admin
 * exposes a `minHours` field per vehicle. Aligned with the
 * estimate model in stripe-booking.js HOURLY table.            */
function minHoursForTier(tier) {
  switch (tier) {
    case "SUV":   return 3;
    case "Van":
    case "Bus":
    case "Coach": return 4;
    default:      return 2;
  }
}

function priceCell(v) {
  // displayPrice from RTDB looks like "From $95/hr" — strip the
  // suffix to fit the rate-meta layout. If unset, show "Quote".
  if (!v.displayPrice) return "Quote";
  const m = /\$(\d+)/.exec(v.displayPrice);
  return m ? `$${m[1]}` : escapeHtml(v.displayPrice);
}

function bestForCopy(v) {
  // Use tagline if present; otherwise derive a reasonable line
  // from passengers + first feature.
  if (v.tagline) return v.tagline;
  const headline = `1–${v.pax} guests`;
  const extra = v.features[0] || "Reserved by the hour";
  return `${headline} · ${extra}`;
}

function rowHtml(v) {
  const min = minHoursForTier(v.tier);
  return `
    <tr>
      <td><strong>${escapeHtml(v.name)}</strong><br><span class="rate-meta">${escapeHtml(v.tagline || v.type)}</span></td>
      <td class="mono">${priceCell(v)}</td>
      <td class="mono">${min} hrs</td>
      <td class="rate-note">${escapeHtml(bestForCopy(v))}</td>
    </tr>`;
}

function groupHeaderHtml(label) {
  return `<tr class="rate-group"><td colspan="4">${escapeHtml(label)}</td></tr>`;
}

function renderTable(list) {
  const body = document.getElementById("ratesHourlyBody");
  if (!body) return;

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="4" class="rate-note" style="text-align:center;padding:24px;">Catalog unavailable. Call dispatch at <a href="tel:+19549109739" class="text-link">+1 (954) 910-9739</a>.</td></tr>`;
    return;
  }

  // Group by tier label (collapses Bus + Coach into "Bus / Coach")
  const groups = new Map();
  for (const tier of TIER_ORDER) {
    const label = TIER_GROUP_LABEL[tier];
    if (!groups.has(label)) groups.set(label, []);
  }
  for (const v of list) {
    const label = TIER_GROUP_LABEL[v.tier] || "Other";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(v);
  }

  const html = Array.from(groups.entries())
    .filter(([_, rows]) => rows.length)
    .map(([label, rows]) =>
      groupHeaderHtml(label) + rows.map(rowHtml).join("")
    )
    .join("");

  body.innerHTML = html;
}

function applyFromEvent(detail) {
  renderTable(detail.vehicles || []);
}

window.addEventListener("luna:vehicles-updated", (e) => applyFromEvent(e.detail || {}));

if (window.LunaVehicles && typeof window.LunaVehicles.list === "function") {
  applyFromEvent({
    vehicles: window.LunaVehicles.list(),
    isFallback: window.LunaVehicles.isFallback(),
  });
}
