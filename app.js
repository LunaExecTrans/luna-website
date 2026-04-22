(() => {
  const nav = document.querySelector('[data-nav]');
  const burger = document.querySelector('[data-burger]');
  const form = document.querySelector('[data-form]');
  const formSuccess = document.querySelector('[data-form-success]');
  const year = document.querySelector('[data-year]');
  const themeToggle = document.querySelector('[data-theme-toggle]');

  if (year) year.textContent = new Date().getFullYear();

  // Theme toggle (light default, dark optional — persists in localStorage)
  if (themeToggle) {
    const setTheme = (t) => {
      if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      else document.documentElement.removeAttribute('data-theme');
      themeToggle.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    };

    const initial = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    themeToggle.setAttribute('aria-label', initial === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');

    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      setTheme(next);
      try { localStorage.setItem('luna-theme', next); } catch (e) {}
    });
  }

  // Scrolled state on nav
  const onScroll = () => {
    if (!nav) return;
    nav.dataset.scrolled = window.scrollY > 12 ? 'true' : 'false';
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile burger
  if (burger && nav) {
    const closeNav = () => {
      nav.dataset.open = 'false';
      burger.setAttribute('aria-expanded', 'false');
    };

    burger.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = nav.dataset.open === 'true';
      nav.dataset.open = open ? 'false' : 'true';
      burger.setAttribute('aria-expanded', String(!open));
    });

    nav.querySelectorAll('.nav-links a, .nav-cta a').forEach(a =>
      a.addEventListener('click', closeNav)
    );

    document.addEventListener('click', (e) => {
      if (nav.dataset.open !== 'true') return;
      if (nav.contains(e.target)) return;
      closeNav();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.dataset.open === 'true') closeNav();
    });
  }

  // ----- Theme persist edge-case fix -----
  // Re-sync aria-label on load in case localStorage had a stale value
  // and the inline script ran before the toggle was stamped
  if (themeToggle) {
    const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    themeToggle.setAttribute('aria-label', currentTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }

  // ----- Booking modal trigger -----
  // The "Request your ride" form only exists on index.html and lives
  // inside #book (a [role=dialog] wrapper, hidden by default). From
  // ANY page, a link to "#book" or "index.html#book" opens the form
  // as a modal: same-page clicks are intercepted here, cross-page
  // clicks let the browser navigate and the hash handler below fires
  // on the fresh page load.
  (function bookingModal () {
    const modal = document.getElementById('book');
    // Same-page intercept works anywhere; the open/close logic only
    // runs if the modal element is present on the current page.
    const hasModal = modal && modal.classList.contains('booking-modal');

    function openModal () {
      if (!hasModal || !modal.hidden) return;
      modal.hidden = false;
      document.body.classList.add('booking-modal-open');
      // Focus the first input (or the close button as fallback).
      setTimeout(() => {
        const first = modal.querySelector('input, select, textarea, button:not(.booking-modal-close)');
        if (first) first.focus({ preventScroll: true });
      }, 60);
    }

    function closeModal () {
      if (!hasModal || modal.hidden) return;
      modal.hidden = true;
      document.body.classList.remove('booking-modal-open');
      // Strip the hash so the URL doesn't hold a stale #book that
      // would re-open on back/forward navigation.
      if (location.hash === '#book') {
        history.replaceState(null, '', location.pathname + location.search);
      }
    }

    // Delegated click handler — works across every page even when
    // there is no modal on the current page (links just fall through
    // to the browser default navigation in that case).
    document.addEventListener('click', (e) => {
      const link = e.target && e.target.closest && e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      // Match "#book", "index.html#book", "/#book", "/index.html#book"
      // — anything that resolves to the booking section on this site.
      const isBookLink = /(^|\/)#book$|(^|\/)(index\.html)?#book$|^index\.html#book$|^\/?index\.html#book$|^\/#book$|^#book$/.test(href);
      if (!isBookLink) return;

      // If the modal lives on this page, open in place — no
      // navigation, no scroll jump.
      if (hasModal) {
        e.preventDefault();
        openModal();
        if (location.hash !== '#book') {
          history.pushState(null, '', '#book');
        }
        return;
      }
      // Otherwise let the browser navigate to index.html#book; the
      // hash check on load at the destination opens the modal.
    });

    if (hasModal) {
      // Dismiss controls (backdrop + close button share [data-booking-dismiss])
      modal.addEventListener('click', (e) => {
        const dismiss = e.target && e.target.closest && e.target.closest('[data-booking-dismiss]');
        if (dismiss) { e.preventDefault(); closeModal(); }
      });

      // Esc closes
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.hidden) closeModal();
      });

      // Hash changes (including from popstate / back-forward)
      window.addEventListener('hashchange', () => {
        if (location.hash === '#book') openModal(); else closeModal();
      });

      // Page load — if URL arrived with #book, open immediately
      if (location.hash === '#book') {
        // Defer one tick so the rest of the DOMContentLoaded
        // handlers have wired up.
        setTimeout(openModal, 0);
      }
    }
  })();

  // ----- Luminous button spotlight -----
  // Updates --lumo-mx / --lumo-my CSS vars on the hovered button so
  // the ::after radial-gradient tracks the pointer. One global
  // pointermove listener, passive, cheap — closest() resolves in
  // microseconds, setProperty doesn't reflow (paint-only). Matches
  // the selector list declared alongside the CSS.
  (function luminousButtons () {
    const LUMO_SELECTOR = [
      '.btn',
      '.signin-btn',
      '.signin-google',
      '.signin-nav-primary',
      '.signin-nav-ghost',
      '.signin-input-submit',
      '.signup-submit',
      '.signup-google',
      '.auth-oauth-btn',
      '.auth-signout-btn',
      '.profile-danger-btn',
      '.dash-new-ride-btn',
      '.dash-rate-submit',
      '.dash-ride-cancel'
    ].join(',');

    if (!('matches' in Element.prototype)) return;

    document.addEventListener('pointermove', (e) => {
      const target = e.target;
      if (!target || !target.closest) return;
      const btn = target.closest(LUMO_SELECTOR);
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      btn.style.setProperty('--lumo-mx', (e.clientX - rect.left) + 'px');
      btn.style.setProperty('--lumo-my', (e.clientY - rect.top)  + 'px');
    }, { passive: true });

    // Reset on pointerleave so the next hover starts at center, not
    // wherever the mouse last left the button.
    document.addEventListener('pointerleave', (e) => {
      const btn = e.target && e.target.closest && e.target.closest(LUMO_SELECTOR);
      if (!btn) return;
      btn.style.removeProperty('--lumo-mx');
      btn.style.removeProperty('--lumo-my');
    }, { capture: true, passive: true });
  })();

  // ----- Luna loader text rotator -----
  // Every [data-luna-loader-text] element cycles through a Luna-voice
  // phrase sequence while visible. Phrases can be overridden per
  // element via data-luna-loader-phrases="phraseA|phraseB|phraseC".
  // Cycle pauses when the element is hidden (display:none or via
  // its closest hidden ancestor) to avoid burning timers in the bg.
  (function lunaLoaderTextRotator () {
    const DEFAULT_PHRASES = [
      'Preparing your itinerary',
      'Syncing dispatch',
      'Confirming availability',
      'One moment',
      'Almost there'
    ];
    const INTERVAL = 1400;

    const targets = document.querySelectorAll('[data-luna-loader-text]');
    targets.forEach(el => {
      const custom = el.getAttribute('data-luna-loader-phrases');
      const phrases = custom ? custom.split('|').map(s => s.trim()).filter(Boolean) : DEFAULT_PHRASES;
      let i = 0;

      // Initial render
      el.textContent = phrases[0];

      setInterval(() => {
        // Skip if loader isn't actually visible — saves cycles and
        // prevents animation restarts on hidden elements.
        if (!el.offsetParent) return;
        i = (i + 1) % phrases.length;
        // Trigger the re-enter animation by removing + forcing reflow
        // + re-adding the text element's transform/opacity cycle.
        el.textContent = phrases[i];
        el.style.animation = 'none';
        void el.offsetHeight;
        el.style.animation = '';
      }, INTERVAL);
    });
  })();

  // ----- Video src resolver (runs before the observer below) -----
  // Each hero <video> has `data-video="file.mp4"`. We assemble the real URL
  // here so config.js can route production traffic to Cloudflare R2 without
  // rewriting markup. Missing config falls back to assets/compressed/.
  (function resolveLunaVideos () {
    const cfg = (window.LunaConfig && window.LunaConfig.videoCdn) || "";
    const base = cfg ? cfg.replace(/\/+$/, "") + "/" : "assets/compressed/";
    document.querySelectorAll("video[data-video]").forEach(v => {
      // Skip if an explicit src is already set (e.g. during prod smoke tests).
      if (v.getAttribute("src")) return;
      v.src = base + v.dataset.video;
    });
  })();

  // ----- Lazy video — IntersectionObserver driven autoplay -----
  // Replaces blanket preload="metadata" with preload="none"; starts only when
  // the video enters the viewport. Respects prefers-reduced-motion via CSS
  // (video[autoplay] { display: none } under reduced-motion — so we skip here too).
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReduced) {
    const lazyVideos = document.querySelectorAll('video[data-lazy-video]');
    if (lazyVideos.length && 'IntersectionObserver' in window) {
      const videoObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const vid = entry.target;
          if (entry.isIntersecting) {
            if (vid.readyState === 0) {
              vid.load();
            }
            vid.play().catch(() => {}); // autoplay policy: silent fail
            videoObserver.unobserve(vid);
          }
        });
      }, { rootMargin: '200px 0px' });

      lazyVideos.forEach(v => videoObserver.observe(v));
    }
  }

  // ----- Scroll reveal — IntersectionObserver -----
  const revealEls = document.querySelectorAll('[data-reveal]');
  if (revealEls.length && !prefersReduced && 'IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const delay = parseInt(el.dataset.revealDelay || '0', 10);
        setTimeout(() => el.classList.add('is-visible'), delay);
        revealObserver.unobserve(el);
      });
    }, { rootMargin: '0px 0px -60px 0px', threshold: 0.08 });

    revealEls.forEach(el => revealObserver.observe(el));
  } else {
    // Fallback: make everything visible immediately
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  // ----- Expanding video scrub — maps scroll progress within pinned section to --p CSS var
  const expandSection = document.querySelector('[data-expand-section]');
  const expandFrame = document.querySelector('[data-expand-frame]');
  if (expandSection && expandFrame && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let ticking = false;
    const updateExpand = () => {
      const rect = expandSection.getBoundingClientRect();
      const scrubLen = rect.height - window.innerHeight;
      let p = -rect.top / scrubLen;
      if (p < 0) p = 0;
      if (p > 1) p = 1;
      expandFrame.style.setProperty('--p', p.toFixed(3));
      ticking = false;
    };
    const onExpandScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateExpand);
        ticking = true;
      }
    };
    window.addEventListener('scroll', onExpandScroll, { passive: true });
    window.addEventListener('resize', onExpandScroll, { passive: true });
    updateExpand();
  }

  // Conditional service groups in the booking form
  const serviceSelect = document.querySelector('[data-service-select]');
  if (serviceSelect && form) {
    const groups = form.querySelectorAll('[data-service-group]');
    const matchMap = {
      'Airport transfer':    'airport',
      'Private aviation':    'private',
      'Wedding':             'event',
      'Special event':       'event',
    };
    const updateGroups = () => {
      const active = matchMap[serviceSelect.value] || null;
      groups.forEach(g => {
        const match = g.dataset.serviceGroup === active;
        g.hidden = !match;
        g.querySelectorAll('input, select, textarea').forEach(field => {
          field.disabled = !match;
        });
      });
    };
    serviceSelect.addEventListener('change', updateGroups);
    updateGroups();
  }

  // Sanitize a single-line header value (strip CR/LF, trim, cap length)
  const sanitizeHeader = (v, max = 80) =>
    String(v || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max);

  // Build a mailto: URL from form data and field labels — kept as the
  // last-resort fallback if POST /api/form/submit is unreachable
  const buildMailto = (to, subjectPrefix, data, labelFor) => {
    const subject = encodeURIComponent(
      sanitizeHeader(`${subjectPrefix} — ${data.name || data.contact_name || data.company || ''}`, 120)
    );
    const lines = [];
    for (const [k, v] of Object.entries(data)) {
      if (v && String(v).trim() !== '' && String(v) !== 'on') {
        lines.push(`${labelFor(k)}: ${v}`);
      }
    }
    const body = encodeURIComponent(lines.join('\n'));
    return `mailto:${to}?subject=${subject}&body=${body}`;
  };

  // Posts the form payload to the Railway endpoint. Returns the
  // server-assigned ref on success, throws on any failure so the
  // caller can fall back to mailto.
  const submitForm = async (type, data) => {
    const ctrl    = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch('/api/form/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify({ type, data }),
        signal:  ctrl.signal,
        credentials: 'same-origin'
      });
      if (!res.ok) throw new Error('http ' + res.status);
      const body = await res.json();
      if (!body || body.ok !== true) throw new Error(body && body.message || 'server-error');
      return body.ref || null;
    } finally {
      clearTimeout(timeout);
    }
  };

  // Wires a form: tries fetch() first, falls back to mailto on any
  // failure (network, rate-limit, non-200). The success state is
  // revealed in both paths so the user sees confirmation either way.
  const wireForm = ({ formEl, successEl, type, mailTo, subjectPrefix, labelFor }) => {
    if (!formEl) return;
    formEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(formEl).entries());

      let serverRef = null;
      try {
        serverRef = await submitForm(type, data);
      } catch (err) {
        // Endpoint unreachable / rate-limited / validation failed — open
        // the user's mail client so the request still lands somewhere.
        window.location.href = buildMailto(mailTo, subjectPrefix, data, labelFor);
      }

      if (successEl) {
        if (serverRef) {
          const refEl = successEl.querySelector('[data-success-ref]');
          if (refEl) refEl.textContent = serverRef;
        }
        successEl.hidden = false;
        successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  };

  // Booking form — lives on index.html (home booking panel)
  wireForm({
    formEl:    form,
    successEl: formSuccess,
    type:      'booking',
    mailTo:    'reservations@lunaexecutivechauffeurs.com',
    subjectPrefix: 'Reservation request',
    labelFor: (k) => ({
      name: 'Name', phone: 'Phone', email: 'Email',
      service: 'Service', vehicle: 'Vehicle',
      date: 'Date', time: 'Time', pax: 'Passengers',
      pickup: 'Pickup', dropoff: 'Drop-off',
      flight_number: 'Flight number', airline: 'Airline',
      tail_number: 'Tail number', fbo: 'FBO', aircraft_type: 'Aircraft type',
      parking_pass: 'Parking pass', car_seats: 'Child seats',
      beverages: 'Beverages', discretion: 'Discretion level',
      event_notes: 'Event notes', notes: 'Notes'
    }[k] || k.replace(/_/g, ' '))
  });

  // Affiliate application form — affiliate-application.html
  const affForm = document.querySelector('[data-affiliate-form]');
  wireForm({
    formEl:    affForm,
    successEl: affForm && affForm.querySelector('[data-form-success]'),
    type:      'affiliate',
    mailTo:    'affiliates@lunaexecutivechauffeurs.com',
    subjectPrefix: 'Affiliate application',
    labelFor: (k) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  });

  // Corporate account inquiry form — corporate.html
  const corpForm = document.querySelector('[data-corporate-form]');
  wireForm({
    formEl:    corpForm,
    successEl: corpForm && corpForm.querySelector('[data-form-success]'),
    type:      'corporate',
    mailTo:    'corporate@lunaexecutivechauffeurs.com',
    subjectPrefix: 'Corporate account inquiry',
    labelFor: (k) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  });

  // ----- Fleet signature: tilt on mouse (desktop, no reduced-motion) -----
  // Applies a subtle 3D tilt (max ±5°) to car images on mouse proximity.
  // Uses CSS custom props --rx / --ry on the wrapper element.
  // Falls back gracefully: no JS error, no layout shift.
  if (!prefersReduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const tiltEls = document.querySelectorAll('[data-tilt]');

    tiltEls.forEach(wrap => {
      const MAX_DEG = 5;

      const onMove = (e) => {
        const rect = wrap.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        const dx = (e.clientX - cx) / (rect.width  / 2);  // -1 → +1
        const dy = (e.clientY - cy) / (rect.height / 2);  // -1 → +1

        // ry positive = right edge comes forward (normal perspective tilt)
        const ry =  dx * MAX_DEG;
        const rx = -dy * MAX_DEG;

        wrap.style.setProperty('--rx', rx.toFixed(2));
        wrap.style.setProperty('--ry', ry.toFixed(2));
      };

      const onLeave = () => {
        wrap.style.setProperty('--rx', '0');
        wrap.style.setProperty('--ry', '0');
      };

      // Attach to the parent stage so the hit area is generous (Fitts' law)
      // Support old .fleet-panel-stage, .fleet-studio-inner, and new .fleet-vitrine-car-wrap
      const stage = wrap.closest('.fleet-panel-stage') || wrap.closest('.fleet-studio-inner') || wrap.closest('.fleet-vitrine-car-wrap') || wrap;
      stage.addEventListener('mousemove', onMove);
      stage.addEventListener('mouseleave', onLeave);
    });
  }

})();
