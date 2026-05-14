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

  /* ─── Full-screen Mobile Drawer ────────────────────────── */

  // Hand-curated mobile menu structure. We don't try to scrape
  // the existing .nav-links because nav order varies subtly per
  // page (e.g. /about gets `aria-current="page"` on About, /miami
  // gets it on Miami). Hardcoding the canonical order keeps the
  // drawer consistent across the entire site.
  const MOBILE_NAV = [
    { name: "Home",                  href: "index.html" },
    { name: "Services", accordion: [
      { name: "Airport Transfers",       href: "airport-transfers.html" },
      { name: "Corporate Travel",        href: "corporate.html" },
      { name: "Hourly / As-Directed",    href: "services.html" },
      { name: "Private Aviation / FBO",  href: "airport-transfers.html" },
      { name: "Weddings & Events",       href: "services.html" },
      { name: "Point-to-Point",          href: "services.html" },
      { name: "Group Transportation",    href: "services.html" },
    ]},
    { name: "Fleet",                 href: "fleet.html" },
    { name: "Rates",                 href: "rates.html" },
    { name: "About",                 href: "about.html" },
    { name: "Service Area",          href: "miami.html" },
    { name: "Miami",                 href: "miami.html" },
    { name: "FAQ",                   href: "faq.html" },
    { name: "Contact",               href: "contact.html" },
  ];

  function buildDrawerMarkup() {
    const navHtml = MOBILE_NAV.map(item => {
      if (item.accordion) {
        const subs = item.accordion.map(s =>
          `<li><a class="luna-drawer-sublink" href="${s.href}">${s.name}</a></li>`
        ).join("");
        return `
          <li class="luna-drawer-nav-item">
            <details class="luna-drawer-acc">
              <summary class="luna-drawer-link luna-drawer-link--acc">
                <span>${item.name}</span>
                <svg class="luna-drawer-acc-chev" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </summary>
              <ul class="luna-drawer-sublist" role="list">${subs}</ul>
            </details>
          </li>`;
      }
      return `<li class="luna-drawer-nav-item"><a class="luna-drawer-link" href="${item.href}">${item.name}</a></li>`;
    }).join("");

    return `
      <div class="luna-drawer" id="luna-drawer" role="dialog" aria-modal="true" aria-label="Site navigation" hidden>
        <div class="luna-drawer-aura" aria-hidden="true"></div>
        <div class="luna-drawer-panel" data-drawer-panel>
          <header class="luna-drawer-head">
            <a href="index.html" class="luna-drawer-logo" aria-label="Luna Executive Chauffeurs — home">
              <img src="assets/luna-logo-nova-gold.png" alt="Luna Executive Chauffeurs" />
            </a>
            <button type="button" class="luna-drawer-close" aria-label="Close menu" data-drawer-close>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </header>

          <div class="luna-drawer-cta">
            <a href="index.html#book" class="luna-drawer-cta-primary" data-drawer-link>
              <span>Reserve Your Chauffeur</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </a>
            <a href="tel:+19549109739" class="luna-drawer-cta-ghost" data-drawer-link>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              <span>Call 24/7 Dispatch</span>
            </a>
          </div>

          <nav class="luna-drawer-nav" aria-label="Primary">
            <ul class="luna-drawer-nav-list" role="list">${navHtml}</ul>
          </nav>

          <div class="luna-drawer-account">
            <a href="login.html" class="luna-drawer-account-link" data-drawer-link>Sign In</a>
            <span class="luna-drawer-account-sep" aria-hidden="true">&middot;</span>
            <a href="signup.html" class="luna-drawer-account-link" data-drawer-link>Create Account</a>
          </div>

          <footer class="luna-drawer-foot">
            <p class="luna-drawer-foot-trust">Fixed Quote &middot; Professional Chauffeur &middot; 24/7 Dispatch</p>
            <a href="tel:+19549109739" class="luna-drawer-foot-phone mono" data-drawer-link>+1 (954) 910-9739</a>
          </footer>
        </div>
      </div>`;
  }

  let lastFocusedBeforeDrawer = null;

  function mountDrawer() {
    if (document.getElementById("luna-drawer")) return;

    document.body.insertAdjacentHTML("beforeend", buildDrawerMarkup());
    const drawer  = document.getElementById("luna-drawer");
    const panel   = drawer.querySelector("[data-drawer-panel]");
    const closeBtn = drawer.querySelector("[data-drawer-close]");
    const burger  = document.querySelector("[data-burger]");

    function openDrawer() {
      lastFocusedBeforeDrawer = document.activeElement;
      drawer.removeAttribute("hidden");
      document.body.classList.add("luna-menu-open");
      // Force a reflow so the CSS transition has a clean starting frame.
      // eslint-disable-next-line no-unused-expressions
      drawer.offsetHeight;
      drawer.classList.add("is-open");
      if (burger) burger.setAttribute("aria-expanded", "true");
      // Focus the close button so screen readers + keyboard land cleanly.
      setTimeout(() => closeBtn && closeBtn.focus(), 80);
    }

    function closeDrawer() {
      drawer.classList.remove("is-open");
      document.body.classList.remove("luna-menu-open");
      if (burger) burger.setAttribute("aria-expanded", "false");
      // Wait out the transition before re-hiding the element, so
      // the close animation can play.
      const onEnd = () => {
        drawer.setAttribute("hidden", "");
        panel.removeEventListener("transitionend", onEnd);
      };
      panel.addEventListener("transitionend", onEnd);
      // Failsafe in case transitionend doesn't fire (rare but
      // possible on transform-none reduced-motion paths).
      setTimeout(() => {
        if (!drawer.classList.contains("is-open")) drawer.setAttribute("hidden", "");
      }, 600);
      // Restore focus to whatever opened the drawer.
      if (lastFocusedBeforeDrawer && lastFocusedBeforeDrawer.focus) {
        try { lastFocusedBeforeDrawer.focus(); } catch (_) {}
      }
    }

    // Intercept the existing burger button's click. We use capture
    // + stopImmediatePropagation so the page's original handler
    // (which usually toggled an inline dropdown) never fires.
    if (burger) {
      burger.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (drawer.classList.contains("is-open")) closeDrawer();
        else openDrawer();
      }, true);
      // Clean up any lingering "open" state the page's original
      // burger code might have set on a sibling nav.
      burger.setAttribute("aria-expanded", "false");
      const navEl = document.querySelector("header[data-nav] nav.nav-links");
      // Disable the older inline-dropdown class if it exists.
      if (navEl) navEl.classList.remove("is-open");
    }

    // Close button
    closeBtn.addEventListener("click", closeDrawer);

    // Tapping any link inside the drawer (except an accordion
    // summary) closes the drawer after navigation. We listen for
    // [data-drawer-link] AND any anchor inside .luna-drawer-nav
    // / .luna-drawer-sublist that isn't an accordion summary.
    drawer.addEventListener("click", (e) => {
      const anchor = e.target.closest("a[href]");
      if (!anchor) return;
      // Don't close on accordion summaries (handled by <details>)
      if (anchor.classList.contains("luna-drawer-link--acc")) return;
      closeDrawer();
    });

    // Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && drawer.classList.contains("is-open")) closeDrawer();
    });

    // Trap focus inside the panel while open. Cheap version: cycle
    // Tab between first and last focusable.
    drawer.addEventListener("keydown", (e) => {
      if (e.key !== "Tab" || !drawer.classList.contains("is-open")) return;
      const focusables = drawer.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), summary');
      if (!focusables.length) return;
      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        last.focus(); e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus(); e.preventDefault();
      }
    });
  }

  /* ─── Auto-hide-on-scroll header ───────────────────────── */

  // Modern e-commerce / luxury site pattern: header slides out of
  // view when the user scrolls down past a threshold, snaps back
  // in the instant they scroll up. Implemented per-frame via
  // requestAnimationFrame so we read scrollY only when the
  // browser is ready to render — no jank, no thrashing.
  //
  // The 8px deadzone stops jittery toggling when a touchpad
  // inertia scroll oscillates near zero delta. The 80px hide
  // threshold keeps the header visible across the top of the
  // page so the hero CTAs stay in immediate reach.
  function enableAutoHide(header) {
    if (!header) return;
    if (header.hasAttribute("data-luna-autohide")) return;
    header.setAttribute("data-luna-autohide", "true");

    let lastY = window.scrollY || 0;
    let ticking = false;
    const HIDE_AFTER = 80;
    const DEADZONE  = 8;

    function update() {
      ticking = false;
      // Never hide the header while the mobile drawer is open —
      // the drawer has its own logo + close button, but we don't
      // want the underlying header to vanish mid-animation.
      if (document.body.classList.contains("luna-menu-open")) {
        header.classList.remove("luna-nav-hidden");
        lastY = window.scrollY || 0;
        return;
      }
      const y = window.scrollY || 0;
      const delta = y - lastY;

      if (Math.abs(delta) < DEADZONE) return;          // ignore tiny moves
      if (y < HIDE_AFTER) {
        header.classList.remove("luna-nav-hidden");    // always show near top
      } else if (delta > 0) {
        header.classList.add("luna-nav-hidden");       // scrolling down → hide
      } else {
        header.classList.remove("luna-nav-hidden");    // scrolling up → show
      }
      lastY = y;
    }

    window.addEventListener("scroll", () => {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
  }

  /* ─── Bootstrap ────────────────────────────────────────── */

  function enhance() {
    const header = document.querySelector("header[data-nav]");
    if (header && !header.hasAttribute("data-luna-nav-enhanced")) {
      header.setAttribute("data-luna-nav-enhanced", "true");
      try { enhanceMegaMenu(header); } catch (e) { console.warn("[luna-nav] mega menu init:", e); }
      try { enableAutoHide(header);  } catch (e) { console.warn("[luna-nav] auto-hide init:", e); }
    }
    try { mountDrawer();    } catch (e) { console.warn("[luna-nav] drawer init:",    e); }
    try { mountStickyCta(); } catch (e) { console.warn("[luna-nav] sticky CTA init:", e); }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enhance);
  } else {
    enhance();
  }
})();
