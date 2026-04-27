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

    // Match the exit animation duration in styles.css
    // (.booking-modal.is-closing .booking-modal-sheet ≈ 340ms).
    const CLOSE_DURATION = 340;
    let closeTimer = null;

    function openModal () {
      if (!hasModal) return;
      // If a close animation is mid-flight, cancel it and reopen.
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      modal.classList.remove('is-closing');
      if (!modal.hidden) return;
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
      if (modal.classList.contains('is-closing')) return;

      const finish = () => {
        closeTimer = null;
        modal.hidden = true;
        modal.classList.remove('is-closing');
        document.body.classList.remove('booking-modal-open');
        // Strip the hash so the URL doesn't hold a stale #book that
        // would re-open on back/forward navigation.
        if (location.hash === '#book') {
          history.replaceState(null, '', location.pathname + location.search);
        }
      };

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) { finish(); return; }

      modal.classList.add('is-closing');
      closeTimer = setTimeout(finish, CLOSE_DURATION);
    }

    // Expose so the form submit handler (outside this IIFE) can
    // trigger a polished close + reset after a successful booking.
    if (typeof window !== 'undefined') {
      window.LunaBookingModal = { open: openModal, close: closeModal };
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

  // Booking form — lives on index.html (home booking panel).
  // Tries the Firebase bridge first (writes straight into
  // /dispatch/rides so the dispatcher hears the chime instantly).
  // Falls back to /api/form/submit and finally a mailto so a
  // request never gets lost if Firebase is unreachable.

  // Minimum lead time per vehicle class — matches the FAQ copy on
  // index.html ("2-hour lead for sedans and SUVs, 4 hours for
  // Sprinters"). Anything tighter has to land through phone dispatch
  // so a human can confirm chauffeur availability in real time.
  const minLeadHoursFor = (vehicle) => {
    const v = String(vehicle || '').toLowerCase();
    if (v.includes('sprinter')) return 4;
    return 2;
  };

  // Parse "YYYY-MM-DD" + "HH:MM" into a local Date. Returns null if
  // either piece is missing or malformed — the caller treats that as
  // "don't block submit on a lead-time check we can't compute".
  const parsePickupDate = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return null;
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    const t = /^(\d{1,2}):(\d{2})$/.exec(timeStr);
    if (!d || !t) return null;
    const dt = new Date(
      Number(d[1]), Number(d[2]) - 1, Number(d[3]),
      Number(t[1]), Number(t[2]), 0, 0
    );
    return isNaN(dt.getTime()) ? null : dt;
  };

  // Returns { ok:true } or { ok:false, message } — message is ready
  // to paint into the .form-error panel.
  const validateLeadTime = (data) => {
    const pickup = parsePickupDate(data.date, data.time);
    if (!pickup) return { ok: true }; // let HTML required catch it
    const minHours = minLeadHoursFor(data.vehicle);
    const leadMs   = pickup.getTime() - Date.now();
    const leadHrs  = leadMs / (1000 * 60 * 60);
    if (leadHrs < minHours) {
      const vehicleLabel = minHours === 4 ? 'Sprinter reservations' : 'Sedan and SUV reservations';
      return {
        ok: false,
        message:
          `${vehicleLabel} need at least ${minHours} hours of lead time online. ` +
          `For anything sooner, call dispatch at +1 (954) 910-9739 — a human answers 24/7.`
      };
    }
    return { ok: true };
  };

  // Lock the date input's `min` attribute to today so the picker
  // cannot surface past dates. Re-runs on focus in case the page sat
  // open past midnight.
  if (form) {
    const dateInput = form.querySelector('input[type="date"][name="date"]');
    if (dateInput) {
      const setMinToday = () => {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm   = String(now.getMonth() + 1).padStart(2, '0');
        const dd   = String(now.getDate()).padStart(2, '0');
        dateInput.min = `${yyyy}-${mm}-${dd}`;
      };
      setMinToday();
      dateInput.addEventListener('focus', setMinToday);
    }
  }

  const bookingMailTo = 'reservations@lunaexecutivechauffeurs.com';
  const bookingSubject = 'Reservation request';
  const bookingLabelFor = (k) => ({
    name: 'Name', phone: 'Phone', email: 'Email',
    service: 'Service', vehicle: 'Vehicle',
    date: 'Date', time: 'Time', pax: 'Passengers',
    pickup: 'Pickup', dropoff: 'Drop-off',
    flight_number: 'Flight number', airline: 'Airline',
    tail_number: 'Tail number', fbo: 'FBO', aircraft_type: 'Aircraft type',
    parking_pass: 'Parking pass', car_seats: 'Child seats',
    beverages: 'Beverages', discretion: 'Discretion level',
    event_notes: 'Event notes', notes: 'Notes'
  }[k] || k.replace(/_/g, ' '));

  if (form) {
    const formError = form.querySelector('[data-form-error]');
    const clearFormError = () => {
      if (!formError) return;
      formError.hidden = true;
      formError.textContent = '';
    };
    const paintFormError = (message) => {
      if (formError) {
        formError.textContent = message;
        formError.hidden = false;
        formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        alert(message);
      }
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormError();
      const data = Object.fromEntries(new FormData(form).entries());

      // 0) Lead-time gate — block submissions that are too close to
      //    pickup. Keeps the dispatcher from getting "reservations"
      //    for 30 minutes from now that nobody can realistically
      //    crew. Those callers belong on the phone line.
      const leadCheck = validateLeadTime(data);
      if (!leadCheck.ok) {
        paintFormError(leadCheck.message);
        return;
      }

      let displayRef = null;

      // 1) Firebase bridge — the happy path. Writes directly to
      //    /dispatch/rides with status PENDING_REVIEW.
      try {
        if (window.LunaBooking && typeof window.LunaBooking.submitToDispatch === 'function') {
          const result = await window.LunaBooking.submitToDispatch(data);
          if (result && result.ok) {
            displayRef = result.displayId || result.rideId;
          }
        }
      } catch (err) { /* swallow — fall through to legacy paths */ }

      // 2) Legacy server endpoint (kept for resilience while
      //    Firebase rules / anonymous auth are settling in).
      if (!displayRef) {
        try {
          displayRef = await submitForm('booking', data);
        } catch (err) {
          // 3) Last resort — open the user's mail client so the
          //    request still lands in the dispatch inbox.
          window.location.href = buildMailto(bookingMailTo, bookingSubject, data, bookingLabelFor);
        }
      }

      if (formSuccess) {
        if (displayRef) {
          const refEl = formSuccess.querySelector('[data-success-ref]');
          if (refEl) refEl.textContent = displayRef;
        }
        formSuccess.hidden = false;
        formSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Auto-close after the user has had a beat to read the
      // confirmation reference. The modal plays its exit animation
      // and then resets so a second booking starts from a clean form
      // (old values / success / error state would otherwise bleed in).
      if (window.LunaBookingModal && typeof window.LunaBookingModal.close === 'function') {
        setTimeout(() => {
          window.LunaBookingModal.close();
          // Give the exit animation room to finish before we reset
          // so the user doesn't see the form blank out under them.
          setTimeout(() => {
            form.reset();
            if (formSuccess) formSuccess.hidden = true;
            clearFormError();
            // Re-run the service group toggler so airport/event fields
            // collapse back to the default state.
            if (serviceSelect) serviceSelect.dispatchEvent(new Event('change'));
          }, 380);
        }, 2000);
      }
    });
  }

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
