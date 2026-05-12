/* ============================================================
 * Luna Executive Chauffeurs — booking-modal Stripe integration
 * ============================================================
 * Adds a card pre-authorization step inside the booking modal:
 *
 *   1. Load Stripe.js on demand (only once the modal opens, so
 *      visitors who never reserve don't pay the JS download).
 *   2. Mount a Card Element inside #stripe-card-element.
 *   3. Estimate an authorization amount client-side from the
 *      service type + vehicle tier (rates table mirrors the
 *      values published on rates.html; dispatch confirms the
 *      final captured amount within 15 min).
 *   4. Expose window.LunaStripe.collectPayment(data) — an async
 *      function the booking submit handler calls right before
 *      writing the ride to dispatch. Returns:
 *          { ok: true,  paymentIntentId, amountCents }
 *          { ok: false, error: "<user-facing message>" }
 *
 * The integration uses PaymentIntent with capture_method:
 * "manual" — a pre-auth hold, NOT a charge. Dispatch captures
 * the real amount from the Stripe dashboard once the ride is
 * delivered.
 *
 * Graceful degradation: if config.js doesn't ship a publishable
 * key, or Stripe.js fails to load, window.LunaStripe.enabled
 * stays false and the booking submit handler skips the payment
 * step entirely — the form behaves exactly as it did before
 * Stripe was wired in. Same intent during the rollout window
 * before live keys land.
 * ============================================================ */

(function () {
  "use strict";

  const PK = (window.LunaConfig && window.LunaConfig.stripePublishableKey) || "";
  const looksLikeKey = /^pk_(test|live)_[A-Za-z0-9]{20,}$/.test(PK);

  // Public surface — minimal, mutates as the module wires up.
  window.LunaStripe = {
    enabled: false,
    init,
    mount,
    unmount,
    collectPayment,
    estimateAmountCents
  };

  if (!looksLikeKey) {
    console.log("[stripe-booking] disabled — stripePublishableKey missing or malformed in config.js");
    return;
  }

  let stripe       = null;
  let elements     = null;
  let cardElement  = null;
  let mountedNode  = null;
  let amountEl     = null;
  let errorEl      = null;
  let stripeReady  = false;
  let loadPromise  = null;

  /* ----------------- Stripe.js loader ----------------- */
  function loadStripeJs () {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise(function (resolve, reject) {
      if (window.Stripe) return resolve(window.Stripe);
      const s = document.createElement("script");
      s.src   = "https://js.stripe.com/v3/";
      s.async = true;
      s.onload  = function () { resolve(window.Stripe); };
      s.onerror = function () { reject(new Error("stripe-js-load-failed")); };
      document.head.appendChild(s);
    });
    return loadPromise;
  }

  /* ----------------- Quote estimator ------------------
   * Pragmatic mid-range estimate per service + vehicle. The
   * goal is a sane pre-authorization hold; dispatch captures
   * the exact amount after the ride. Values mirror the
   * conservative side of the published rate card.
   */
  const HOURLY = {
    "Executive Sedan":     { rate:  95, minHours: 2 },
    "Luxury SUV":          { rate: 135, minHours: 3 },
    "Executive Sprinter":  { rate: 195, minHours: 4 }
  };
  const FLAT_BY_SERVICE = {
    "Airport transfer":  { "Executive Sedan": 115, "Luxury SUV": 165, "Executive Sprinter": 235 },
    "Private aviation":  { "Executive Sedan": 145, "Luxury SUV": 195, "Executive Sprinter": 275 },
    "Point-to-point":    { "Executive Sedan": 125, "Luxury SUV": 175, "Executive Sprinter": 255 }
  };
  const EVENT_HOURS_DEFAULT = 4; // wedding / special event / corporate base bucket

  function estimateAmountCents (data) {
    const service = String((data && data.service) || "");
    const vehicle = String((data && data.vehicle) || "Executive Sedan");

    if (service === "Hourly / As-directed") {
      const r = HOURLY[vehicle] || HOURLY["Executive Sedan"];
      return Math.round(r.rate * r.minHours * 100);
    }
    if (service === "Wedding" || service === "Special event" || service === "Corporate / Roadshow") {
      const r = HOURLY[vehicle] || HOURLY["Executive Sedan"];
      const hours = Math.max(EVENT_HOURS_DEFAULT, r.minHours);
      return Math.round(r.rate * hours * 100);
    }
    const flat = FLAT_BY_SERVICE[service];
    if (flat && flat[vehicle]) return Math.round(flat[vehicle] * 100);

    // Fallback: vehicle hourly × 2 hrs. Never returns less than $100
    // because Stripe requires amount >= 50 cents and we want the hold
    // to feel like a real reservation, not a verification ping.
    const r = HOURLY[vehicle] || HOURLY["Executive Sedan"];
    return Math.max(10000, Math.round(r.rate * 2 * 100));
  }

  function fmtUsd (cents) {
    if (!Number.isFinite(cents)) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(cents / 100);
  }

  /* ----------------- Init (lazy, on first mount) ----------------- */
  function init () {
    if (stripeReady) return Promise.resolve(true);
    return loadStripeJs().then(function () {
      try {
        stripe = window.Stripe(PK);
        elements = stripe.elements();
        stripeReady = true;
        window.LunaStripe.enabled = true;
        return true;
      } catch (e) {
        console.error("[stripe-booking] init failed:", e.message);
        return false;
      }
    }).catch(function (e) {
      console.error("[stripe-booking] Stripe.js load failed:", e.message);
      return false;
    });
  }

  /* ----------------- Mount / unmount Card Element ----------------- */
  function mount (cardSelector, amountSelector, errorSelector) {
    return init().then(function (ok) {
      if (!ok) return false;

      mountedNode = document.querySelector(cardSelector);
      amountEl    = amountSelector ? document.querySelector(amountSelector) : null;
      errorEl     = errorSelector  ? document.querySelector(errorSelector)  : null;
      if (!mountedNode) return false;

      // Clear out any previously mounted element (re-open of modal).
      if (cardElement) { try { cardElement.unmount(); } catch (e) {} }
      cardElement = elements.create("card", {
        style: {
          base: {
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize:   "15px",
            color:      cssVar("--text-primary", "#012B5B"),
            "::placeholder": { color: cssVar("--text-muted", "rgba(1,43,91,0.50)") }
          },
          invalid: {
            color:     "#B85C5C",
            iconColor: "#B85C5C"
          }
        }
      });
      cardElement.mount(mountedNode);
      cardElement.on("change", function (event) {
        if (errorEl) {
          if (event.error) {
            errorEl.textContent = event.error.message;
            errorEl.hidden = false;
          } else {
            errorEl.textContent = "";
            errorEl.hidden = true;
          }
        }
      });
      return true;
    });
  }

  function unmount () {
    if (cardElement) {
      try { cardElement.unmount(); } catch (e) {}
      cardElement = null;
    }
    if (errorEl) { errorEl.textContent = ""; errorEl.hidden = true; }
    mountedNode = null;
    errorEl = null;
    amountEl = null;
  }

  /* ----------------- Live estimate update ----------------- */
  function refreshEstimate (data) {
    if (!amountEl) return;
    const cents = estimateAmountCents(data);
    amountEl.textContent = fmtUsd(cents);
  }
  window.LunaStripe.refreshEstimate = refreshEstimate;

  /* ----------------- Collect payment (called by submit handler) ----------------- */
  function collectPayment (data) {
    if (!stripeReady || !cardElement) {
      return Promise.resolve({
        ok: false,
        error: "Payment form not ready. Please try again."
      });
    }
    const amount = estimateAmountCents(data);

    // 1) Create PaymentIntent on the server
    return fetch("/api/stripe/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        amount,
        currency: "usd",
        metadata: {
          ride_service: String(data.service || "").slice(0, 60),
          ride_vehicle: String(data.vehicle || "").slice(0, 60),
          ride_date:    String(data.date || ""),
          ride_time:    String(data.time || ""),
          ride_email:   String(data.email || "").slice(0, 120),
          ride_phone:   String(data.phone || "").slice(0, 40)
        }
      })
    })
    .then(function (r) { return r.json(); })
    .then(function (body) {
      if (!body || !body.ok || !body.clientSecret) {
        const msg = (body && body.message) || "Could not initialize payment. Please try again.";
        return { ok: false, error: msg };
      }

      // 2) Confirm card payment with Stripe.js
      return stripe.confirmCardPayment(body.clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name:  String(data.name  || "") || undefined,
            email: String(data.email || "") || undefined,
            phone: String(data.phone || "") || undefined
          }
        }
      }).then(function (result) {
        if (result.error) {
          return { ok: false, error: result.error.message };
        }
        const pi = result.paymentIntent;
        if (pi && (pi.status === "requires_capture" || pi.status === "succeeded")) {
          return {
            ok: true,
            paymentIntentId: pi.id,
            amountCents:     pi.amount,
            status:          pi.status
          };
        }
        return {
          ok: false,
          error: "Card authorization did not complete (" + (pi && pi.status) + "). Please try a different card."
        };
      });
    })
    .catch(function (err) {
      console.error("[stripe-booking] collectPayment error:", err && err.message);
      return { ok: false, error: "Network error. Please try again or call dispatch." };
    });
  }

  /* ----------------- CSS var resolver (for Card Element theming) ----------------- */
  function cssVar (name, fallback) {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }

})();
