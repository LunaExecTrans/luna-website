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

  // Build a mailto: URL from form data and field labels
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

  // Booking form — fires mailto, reveals honest success state
  if (form) {
    const fieldLabel = (k) => ({
      name: 'Name', phone: 'Phone', email: 'Email',
      service: 'Service', vehicle: 'Vehicle',
      date: 'Date', time: 'Time', pax: 'Passengers',
      pickup: 'Pickup', dropoff: 'Drop-off',
      flight_number: 'Flight number', airline: 'Airline',
      tail_number: 'Tail number', fbo: 'FBO', aircraft_type: 'Aircraft type',
      parking_pass: 'Parking pass', car_seats: 'Child seats',
      beverages: 'Beverages', discretion: 'Discretion level',
      event_notes: 'Event notes', notes: 'Notes',
    }[k] || k.replace(/_/g, ' '));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const href = buildMailto(
        'reservations@lunaexecutivechauffeurs.com',
        'Reservation request',
        data,
        fieldLabel
      );
      window.location.href = href;

      if (formSuccess) {
        formSuccess.hidden = false;
        formSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  // Affiliate application form
  const affForm = document.querySelector('[data-affiliate-form]');
  if (affForm) {
    const affSuccess = affForm.querySelector('[data-form-success]');
    const affLabel = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    affForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(affForm).entries());
      const href = buildMailto(
        'affiliates@lunaexecutivechauffeurs.com',
        'Affiliate application',
        data,
        affLabel
      );
      window.location.href = href;

      if (affSuccess) {
        affSuccess.hidden = false;
        affSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  // Corporate account inquiry form
  const corpForm = document.querySelector('[data-corporate-form]');
  if (corpForm) {
    const corpSuccess = corpForm.querySelector('[data-form-success]');
    const corpLabel = (k) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    corpForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(corpForm).entries());
      const href = buildMailto(
        'corporate@lunaexecutivechauffeurs.com',
        'Corporate account inquiry',
        data,
        corpLabel
      );
      window.location.href = href;

      if (corpSuccess) {
        corpSuccess.hidden = false;
        corpSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  // ----- Fleet showroom: tab switching -----
  // Tabs switch between the three vehicle cards with a quick fade-slide.
  // Keyboard: arrow keys within the tablist per ARIA pattern.
  const fleetTabList = document.querySelector('.fleet-tabs');
  if (fleetTabList) {
    const tabs  = Array.from(fleetTabList.querySelectorAll('[data-fleet-tab]'));
    const cards = Array.from(document.querySelectorAll('[data-fleet-card]'));

    const showCard = (idx, skipAnim) => {
      tabs.forEach((t, i) => {
        const active = i === idx;
        t.classList.toggle('fleet-tab--active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
        t.setAttribute('tabindex', active ? '0' : '-1');
      });

      cards.forEach((c, i) => {
        if (i === idx) {
          c.hidden = false;
          if (!skipAnim && !prefersReduced) {
            c.classList.remove('fleet-card-showroom--active', 'fleet-card-showroom--entering');
            // Force reflow then add entering class
            void c.offsetWidth;
            c.classList.add('fleet-card-showroom--active', 'fleet-card-showroom--entering');
          } else {
            c.classList.add('fleet-card-showroom--active');
          }
          // Re-attach tilt listeners for the newly visible card
          c.querySelectorAll('[data-tilt]').forEach(wrap => {
            const stage = wrap.closest('.fleet-studio-inner') || wrap;
            // Remove old listeners by re-setting (simplest safe method for vanilla)
            stage._tiltActive = true;
          });
        } else {
          c.hidden = true;
          c.classList.remove('fleet-card-showroom--active', 'fleet-card-showroom--entering');
        }
      });
    };

    tabs.forEach((tab, idx) => {
      tab.addEventListener('click', () => showCard(idx));
    });

    // Keyboard navigation within tablist (ARIA roving tabindex)
    fleetTabList.addEventListener('keydown', (e) => {
      const current = tabs.findIndex(t => t === document.activeElement);
      if (current === -1) return;
      let next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        next = (current + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        next = (current - 1 + tabs.length) % tabs.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        next = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        next = tabs.length - 1;
      }
      if (next !== -1) {
        showCard(next);
        tabs[next].focus();
      }
    });

    // Initialize ARIA tabindex
    tabs.forEach((t, i) => t.setAttribute('tabindex', i === 0 ? '0' : '-1'));

    // Sync dot nav clicks → tab switch (mobile)
    const dotsNav = document.querySelector('.fleet-showroom-dots');
    if (dotsNav) {
      dotsNav.querySelectorAll('[data-fleet-dot]').forEach(dot => {
        dot.addEventListener('click', () => {
          const idx = parseInt(dot.dataset.fleetDot, 10);
          showCard(idx);
          // Update dot active state
          dotsNav.querySelectorAll('[data-fleet-dot]').forEach((d, i) => {
            d.classList.toggle('fleet-sig-dot--active', i === idx);
            d.setAttribute('aria-current', i === idx ? 'true' : 'false');
          });
        });
      });
    }
  }

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

  // ----- Fleet signature: dot nav visibility + active state + smooth scroll -----
  const fleetSection = document.querySelector('[data-fleet-sig]');
  if (fleetSection) {
    const fleetNav  = fleetSection.querySelector('.fleet-sig-nav');
    const panels    = Array.from(fleetSection.querySelectorAll('[data-fleet-panel]'));
    const dots      = Array.from(fleetSection.querySelectorAll('[data-fleet-dot]'));

    // Dot click → smooth scroll to panel
    dots.forEach(dot => {
      dot.addEventListener('click', () => {
        const idx   = parseInt(dot.dataset.fleetDot, 10);
        const panel = panels[idx];
        if (!panel) return;
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });

    if ('IntersectionObserver' in window) {
      // 1. Toggle nav visibility when fleet section is in view
      if (fleetNav) {
        const sectionObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            fleetNav.classList.toggle('is-in-view', entry.isIntersecting);
          });
        }, { threshold: 0.05 });
        sectionObserver.observe(fleetSection);
      }

      // 2. Update active dot as panels enter viewport (middle 40% of screen)
      const setActive = (idx) => {
        dots.forEach((d, i) => {
          const isActive = i === idx;
          d.classList.toggle('fleet-sig-dot--active', isActive);
          d.setAttribute('aria-current', isActive ? 'true' : 'false');
        });
      };

      const panelObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const idx = parseInt(entry.target.dataset.fleetPanel, 10);
          if (!isNaN(idx)) setActive(idx);
        });
      }, {
        rootMargin: '-30% 0px -30% 0px',
        threshold: 0
      });

      panels.forEach(p => panelObserver.observe(p));
    }
  }

})();
