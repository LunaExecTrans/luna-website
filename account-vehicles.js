/* ============================================================
 * Luna Executive Chauffeurs — Account-page vehicle dropdowns
 * ============================================================
 * Renders the vehicle <select> options used in:
 *   - account.html        → new-ride form (#cr-vehicle)
 *                           value = canonical vehicle.name string
 *   - account/profile.html → default-vehicle preference (#pref-vehicle)
 *                           value = vehicle.id slug
 *
 * Data source: vehicles-store.js. Re-renders on every
 * `luna:vehicles-updated` event so dispatch edits propagate
 * without a page reload.
 *
 * Preserves any value already selected (legacy saved preferences
 * still resolve via the optgroup, even if the slug isn't part
 * of the current fleet).
 * ============================================================ */

const TIER_LABEL = {
  Sedan: "Sedan",
  SUV:   "SUV",
  Van:   "Sprinter",
  Bus:   "Bus / Coach",
  Coach: "Bus / Coach",
};
const TIER_ORDER = ["Sedan", "SUV", "Van", "Bus", "Coach"];

function escapeAttr(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Build option HTML for a single vehicle. `valueField` is either
 * "name" (booking flow — submits the human-readable string) or
 * "id" (preference flow — stores a stable slug).                 */
function optionHtml(v, valueField, labelMode) {
  const value = valueField === "id" ? v.id : v.name;
  let label = v.name;
  if (labelMode === "with-meta") {
    // account.html new-ride: name — short context
    const note = v.tagline ? v.tagline : `1–${v.pax} passengers`;
    label = `${v.name} — ${note}`;
  }
  return `<option value="${escapeAttr(value)}">${escapeAttr(label)}</option>`;
}

function buildSelectHtml(vehicles, opts) {
  const valueField = opts.valueField;     // "id" or "name"
  const placeholder = opts.placeholder || "";
  const labelMode = opts.labelMode || "name-only";

  // Group by tier label (collapses Bus + Coach into one group for the UI).
  const groups = new Map();
  for (const tier of TIER_ORDER) {
    const label = TIER_LABEL[tier];
    if (!groups.has(label)) groups.set(label, []);
  }
  for (const v of vehicles) {
    const label = TIER_LABEL[v.tier] || "Other";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(v);
  }

  const placeholderOpt = placeholder
    ? `<option value="">${escapeAttr(placeholder)}</option>`
    : "";

  const groupHtml = Array.from(groups.entries())
    .filter(([_, list]) => list.length)
    .map(([label, list]) => {
      const options = list.map(v => optionHtml(v, valueField, labelMode)).join("");
      return `<optgroup label="${escapeAttr(label)}">${options}</optgroup>`;
    })
    .join("");

  return placeholderOpt + groupHtml;
}

function renderInto(selectEl, vehicles, opts) {
  if (!selectEl) return;
  const previous = selectEl.value;
  selectEl.innerHTML = buildSelectHtml(vehicles, opts);
  // Restore prior selection if it still exists; otherwise leave
  // the placeholder selected so the user can re-pick.
  if (previous) {
    const stillExists = !!selectEl.querySelector(`option[value="${CSS.escape(previous)}"]`);
    if (stillExists) selectEl.value = previous;
  }
}

function applyFromEvent(detail) {
  const list = detail.vehicles || [];

  // account.html — new-ride form
  const crSelect = document.getElementById("cr-vehicle");
  if (crSelect) {
    renderInto(crSelect, list, {
      valueField:  "name",
      placeholder: "Select…",
      labelMode:   "with-meta",
    });
  }

  // account/profile.html — preference
  const prefSelect = document.getElementById("pref-vehicle");
  if (prefSelect) {
    renderInto(prefSelect, list, {
      valueField:  "id",
      placeholder: "No preference",
      labelMode:   "name-only",
    });
  }
}

window.addEventListener("luna:vehicles-updated", (e) => applyFromEvent(e.detail || {}));

if (window.LunaVehicles && typeof window.LunaVehicles.list === "function") {
  applyFromEvent({
    vehicles: window.LunaVehicles.list(),
    isFallback: window.LunaVehicles.isFallback(),
  });
}
