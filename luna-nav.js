/* ============================================================
 * Luna Executive Chauffeurs — Global Navigation Enhancements
 * ============================================================
 * Adds two conversion-focused enhancements to every page that
 * already has the standard <header data-nav> structure:
 *
 *   1. Services mega menu (desktop). Replaces the plain
 *      <a href="#services">Services</a> link with a button that
 *      opens a dark glass dropdown listing every Luna service +
 *      support links (Rates, FAQ, Fleet, About). Hover-open on
 *      pointer devices, click-toggle on touch, Escape + outside
 *      click both close. Falls back silently if the nav doesn't
 *      have a Services anchor (e.g. minimal login nav).
 *
 *   2. Sticky mobile CTA bar. A dark-glass dock at the bottom
 *      of mobile viewports with Call Dispatch (left) and Reserve
 *      (right) — always one tap from a conversion path. Hidden
 *      on auth pages (login, signup, forgot) and inside the
 *      account dashboard so it doesn't compete with auth flows.
 *      Hidden when the footer scrolls into view so it never
 *      covers the legal links.
 *
 * Design choices:
 *   - Idempotent. Re-running enhance() is a no-op (we tag the
 *     header with data-luna-nav-enhanced after first pass).
 *   - Zero dependencies. Pure DOM + CSS classes that styles.css
 *     ships with.
 *   - Respects reduced-motion via CSS only — no JS branching.
 *   - Account dashboard (account.html, /account/*) opts out of
 *     the sticky CTA via the body class .page-subpage check.
 *     Login pages use the .signin-body class so they're easy to
 *     detect too.
 * ============================================================ */

(function () {
  "use strict";

  /* ─── Config ───────────────────────────────────────────── */

  // The four columns of the mega menu. Hand-curated copy that
  // mirrors the deeper subpages without forcing every visitor to
  // scan the full site map.
  const MEGA_MENU_COLUMNS = [
    {
      title: "Core Services",
      items: [
        { name: "Airport Transfers",   href: "airport-transfers.html",       desc: "MIA, FLL and PBI pickups with flight tracking." },
        { name: "Corporate Travel",    href: "corporate.html",               desc: "Executive rides, roadshows and recurring accounts." },
        { name: "Hourly / As-Directed",href: "services.html",                desc: "Vehicle and chauffeur on standby for your day." },
        { name: "Point-to-Point",      href: "services.html",                desc: "Flat-rate transfers across South Florida." },
      ],
    },
    {
      title: "Premium Services",
      items: [
        { name: "Private Aviation / FBO", href: "airport-transfers.html", desc: "Discreet pickups for private terminals and FBOs." },
        { name: "Weddings & Events",      href: "services.html",          desc: "Planner coordination, guest movement, venue timing." },
        { name: "Group Transportation",   href: "services.html",          desc: "Sprinters, luxury bus and 50-seat charter coach." },
      ],
    },
    {
      title: "Browse",
      items: [
        { name: "Full Fleet",          href: "fleet.html",         desc: "Eight vehicles across five tiers." },
        { name: "Rates",               href: "rates.html",         desc: "Fixed quotes for every route and tier." },
        { name: "FAQ",                 href: "faq.html",           desc: "Booking, flight delays, child seats, tipping." },
      ],
    },
  ];

  // Pages where the sticky mobile CTA bar should not render
  // (these have their own auth/account CTAs and the bar would
  // compete or cover important controls).
  function shouldSkipStickyCta() {
    const path = (location.pathname || "").toLowerCase();
    if (path.includes("login")  || path.includes("signup") || path.includes("forgot"))   return true;
    if (path.includes("account/profile") || path.includes("account/ride"))               return true;
    if (path.endsWith("/account.html"))                                                  return true;
    return false;
  }

  /* ─── Mega Menu ────────────────────────────────────────── */

  function buildMegaMenuMarkup() {
    return `
      <div class="luna-megamenu" role="region" aria-label="Services menu">
        <div class="luna-megamenu-inner">
          ${MEGA_MENU_COLUMNS.map(col => `
            <div class="luna-megamenu-col">
              <p class="luna-megamenu-col-title mono">${col.title}</p>
              <ul class="luna-megamenu-list" role="list">
                ${col.items.map(it => `
                  <li>
                    <a href="${it.href}" class="luna-megamenu-link">
                      <span class="luna-megamenu-link-name">${it.name}</span>
                      <span class="luna-megamenu-link-desc">${it.desc}</span>
                    </a>
                  </li>
                `).join("")}
              </ul>
            </div>
          `).join("")}
          <div class="luna-megamenu-foot">
            <p class="luna-megamenu-foot-copy">Not sure which service fits? Luna Dispatch recommends the right vehicle and rate before the ride.</p>
            <div class="luna-megamenu-foot-cta">
              <a href="tel:+19549109739" class="btn btn-ghost">Contact Dispatch</a>
              <a href="index.html#book" class="btn btn-primary">Reserve a Vehicle</a>
            </div>
          </div>
        </div>
      </div>`;
  }

  function enhanceMegaMenu(header) {
    const nav = header.querySelector(".nav-links");
    if (!nav) return;

    // Find the Services link by href or text content (anything in
    // the form "#services", "services.html", or text "Services").
    const links = Array.from(nav.querySelectorAll("a"));
    const servicesLink = links.find(a => {
      const t = (a.textContent || "").trim().toLowerCase();
      const h = (a.getAttribute("href") || "").toLowerCase();
      return t === "services" || h.endsWith("services.html") || h.endsWith("#services");
    });
    if (!servicesLink) return;

    // Wrap the existing link in a container so the dropdown can be
    // absolute-positioned relative to it. We keep the anchor's href
    // intact so clicking the trigger still works as a fallback
    // (touch devices that don't bubble pointerenter, etc).
    const wrapper = document.createElement("div");
    wrapper.className = "luna-megamenu-anchor";
    wrapper.setAttribute("data-luna-megamenu-anchor", "");
    servicesLink.parentNode.insertBefore(wrapper, servicesLink);
    wrapper.appendChild(servicesLink);

    // Add the chevron + ARIA wiring to the existing link.
    servicesLink.classList.add("luna-megamenu-trigger");
    servicesLink.setAttribute("aria-haspopup", "true");
    servicesLink.setAttribute("aria-expanded", "false");
    servicesLink.innerHTML = `${servicesLink.textContent}<svg class="luna-megamenu-chev" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    // Mount the menu.
    wrapper.insertAdjacentHTML("beforeend", buildMegaMenuMarkup());
    const menu = wrapper.querySelector(".luna-megamenu");

    let openTimer = null;
    let closeTimer = null;
    const open  = () => {
      clearTimeout(closeTimer);
      wrapper.setAttribute("data-open", "true");
      servicesLink.setAttribute("aria-expanded", "true");
    };
    const close = () => {
      wrapper.setAttribute("data-open", "false");
      servicesLink.setAttribute("aria-expanded", "false");
    };

    // Pointer-device hover (skip on touch — the click handler
    // below handles that). 120ms intent delay so the menu doesn't
    // flicker when crossing horizontally.
    wrapper.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "touch") return;
      clearTimeout(closeTimer);
      openTimer = setTimeout(open, 80);
    });
    wrapper.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "touch") return;
      clearTimeout(openTimer);
      closeTimer = setTimeout(close, 180);
    });

    // Click toggle for keyboard / touch users.
    servicesLink.addEventListener("click", (e) => {
      // If the menu isn't yet open, intercept and open. If it IS
      // open, let the click pass through (so a second click on
      // "Services" can still navigate to services.html as the
      // user's anchor expectation).
      if (wrapper.getAttribute("data-open") !== "true") {
        e.preventDefault();
        open();
      } else {
        close();
      }
    });

    // Outside click closes.
    document.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target)) close();
    });

    // Escape closes + returns focus to the trigger.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && wrapper.getAttribute("data-open") === "true") {
        close();
        servicesLink.focus();
      }
    });
  }

  /* ─── Sticky Mobile CTA Bar ────────────────────────────── */

  function mountStickyCta() {
    if (shouldSkipStickyCta()) return;
    if (document.querySelector(".luna-sticky-cta")) return;  // idempotent

    const bar = document.createElement("div");
    bar.className = "luna-sticky-cta";
    bar.setAttribute("aria-label", "Quick reservation actions");
    bar.innerHTML = `
      <a href="tel:+19549109739" class="luna-sticky-cta-btn luna-sticky-cta-btn--ghost" aria-label="Call Luna Dispatch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span>Call Dispatch</span>
      </a>
      <a href="index.html#book" class="luna-sticky-cta-btn luna-sticky-cta-btn--primary" aria-label="Reserve a chauffeur">
        <span>Reserve</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </a>`;
    document.body.appendChild(bar);

    // Hide the bar when the footer scrolls into view so it never
    // covers legal links / contact info. IntersectionObserver is
    // cheap and bails gracefully if the API isn't available.
    const footer = document.querySelector("footer.footer, footer#contact");
    if (footer && "IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(en => {
          bar.classList.toggle("is-hidden", en.isIntersecting);
        });
      }, { root: null, rootMargin: "0px 0px -40px 0px", threshold: 0 });
      io.observe(footer);
    }
  }

  /* ─── Bootstrap ────────────────────────────────────────── */

  function enhance() {
    const header = document.querySelector("header[data-nav]");
    if (header && !header.hasAttribute("data-luna-nav-enhanced")) {
      header.setAttribute("data-luna-nav-enhanced", "true");
      try { enhanceMegaMenu(header); } catch (e) { console.warn("[luna-nav] mega menu init:", e); }
    }
    try { mountStickyCta(); } catch (e) { console.warn("[luna-nav] sticky CTA init:", e); }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhance);
  } else {
    enhance();
  }
})();
