/* ============================================================
 * Luna Executive Chauffeurs — Places Autocomplete (booking modal)
 * ============================================================
 * Adds Google Places Autocomplete to the pickup and dropoff
 * fields of the booking modal so a visitor typing "Four Sea..."
 * gets predictive completion to "Four Seasons Hotel Miami" with
 * a clean formatted_address back into the input.
 *
 * Design choices:
 *   - Lazy-load the Maps JS SDK only when the booking modal
 *     opens (custom event "luna:booking-modal-opened" fired
 *     from app.js openModal). Visitors who never click Reserve
 *     never download the ~200KB SDK.
 *   - Bias (not restrict) toward South Florida — the Miami →
 *     Palm Beach corridor — so addresses outside the bias still
 *     work but the predictions surface relevant local hotels /
 *     FBOs / addresses first.
 *   - Component restriction "us" — Luna doesn't operate outside
 *     the US, so prediction noise from international addresses
 *     is wasted bandwidth and confusing UX.
 *   - Fields restricted to formatted_address + geometry to
 *     minimize Places billing (other fields charge extra).
 *
 * Public surface:
 *   window.LunaPlaces.init()  — idempotent loader + binder.
 *   Auto-called on luna:booking-modal-opened event.
 *
 * Graceful degradation: missing or malformed API key in
 * config.js → module no-ops, inputs stay as plain text fields.
 * ============================================================ */

(function () {
  "use strict";

  const apiKey = (window.LunaConfig && window.LunaConfig.googleMapsApiKey) || "";
  if (!apiKey || !/^AIza[A-Za-z0-9_-]{30,}$/.test(apiKey)) {
    console.log("[places] disabled — googleMapsApiKey missing or malformed in config.js");
    return;
  }

  let loadPromise = null;

  function loadGoogleMaps () {
    if (loadPromise) return loadPromise;
    if (window.google && window.google.maps && window.google.maps.places) {
      return Promise.resolve();
    }
    loadPromise = new Promise(function (resolve, reject) {
      // The Maps JS API requires a global callback name. We assign
      // a uniquely-named one so this module never clashes with other
      // Maps integrations (e.g. a future static map on the area
      // section). The callback is removed after first fire.
      window.__lunaPlacesInit__ = function () {
        delete window.__lunaPlacesInit__;
        resolve();
      };
      const s = document.createElement("script");
      s.src = "https://maps.googleapis.com/maps/api/js?key=" +
              encodeURIComponent(apiKey) +
              "&libraries=places&loading=async&callback=__lunaPlacesInit__";
      s.async  = true;
      s.defer  = true;
      s.onerror = function () { reject(new Error("maps-js-load-failed")); };
      document.head.appendChild(s);
    });
    return loadPromise;
  }

  /* Bias bounds — Miami (south) to Palm Beach (north), Atlantic
     to inland. Predictions inside these bounds rank higher; outside
     ones still appear but lower in the list. */
  function southFloridaBounds () {
    return new google.maps.LatLngBounds(
      new google.maps.LatLng(25.4, -80.6), // SW: south of Homestead
      new google.maps.LatLng(26.9, -79.8)  // NE: north of Jupiter
    );
  }

  function initOn (input) {
    if (!input || input.dataset.placesInited) return;
    try {
      const ac = new google.maps.places.Autocomplete(input, {
        bounds: southFloridaBounds(),
        strictBounds: false,
        componentRestrictions: { country: "us" },
        fields: ["formatted_address", "geometry", "name"]
      });
      ac.addListener("place_changed", function () {
        const p = ac.getPlace();
        if (p && p.formatted_address) {
          input.value = p.name && !p.formatted_address.startsWith(p.name)
            ? p.name + " — " + p.formatted_address
            : p.formatted_address;
          input.dispatchEvent(new Event("input",  { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
      input.dataset.placesInited = "true";
      console.log("[places] bound autocomplete to:", input.id || input.name || input);
    } catch (e) {
      console.warn("[places] failed to bind on", input.name || "(unnamed)", e.message);
    }
  }

  // Selectors covering every address input on the site. Used both
  // by initAll and by the MutationObserver below.
  const PLACES_SELECTOR =
    'input[name="pickup"], input[name="dropoff"], ' +
    'input[name="pickupAddress"], input[name="dropoffAddress"], ' +
    'input[name="defaultPickup"], ' +
    'input[name="address"][autocomplete="street-address"], ' +
    'input[data-luna-place]';

  function initAll () {
    // Covers every address input across the site:
    //   index.html booking modal:    name="pickup" / name="dropoff"
    //   account.html new-ride:       name="pickupAddress" / name="dropoffAddress"
    //   account/profile.html prefs:  name="defaultPickup"
    //   account/profile.html places: name="address" (Saved addresses form)
    //   future surfaces:             opt-in via [data-luna-place]
    const inputs = document.querySelectorAll(PLACES_SELECTOR);
    if (!inputs.length) {
      console.log("[places] no matching inputs on this page yet — will watch for dynamic adds");
      return;
    }
    inputs.forEach(initOn);
  }

  window.LunaPlaces = {
    init: function () {
      return loadGoogleMaps()
        .then(initAll)
        .catch(function (err) {
          console.warn("[places] init failed:", err && err.message);
        });
    }
  };

  // Lazy init when any booking-style modal opens. Listener stays
  // bound forever (idempotent — both load and initOn no-op on
  // subsequent calls).
  //   - index.html booking modal: dispatched by app.js openModal
  //   - account.html new-ride modal: dispatched by openCreateModal
  document.addEventListener("luna:booking-modal-opened", function () {
    window.LunaPlaces.init();
  });

  // Eager init for pages where address fields render inline (no modal
  // gate). Covers profile.html's "Default pickup" + the Saved-addresses
  // form's Address field. Also any opt-in [data-luna-place] input.
  function eagerInitIfNeeded () {
    if (document.querySelector(
      'input[name="defaultPickup"], ' +
      'input[name="address"][autocomplete="street-address"], ' +
      'input[data-luna-place]'
    )) {
      console.log("[places] eager init: matching input found on this page");
      window.LunaPlaces.init();
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", eagerInitIfNeeded);
  } else {
    eagerInitIfNeeded();
  }

  // Safety net: watch for inputs added after first paint (e.g. a
  // template-cloned row inside a CRUD list, or a tab that mounts a
  // form on click). MutationObserver is cheap and fires only on
  // actual DOM mutations.
  function watchDynamicInputs () {
    if (!("MutationObserver" in window)) return;
    const mo = new MutationObserver((mutations) => {
      let foundNew = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches(PLACES_SELECTOR)) { foundNew = true; break; }
          if (node.querySelector && node.querySelector(PLACES_SELECTOR)) { foundNew = true; break; }
        }
        if (foundNew) break;
      }
      if (foundNew) window.LunaPlaces.init();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchDynamicInputs);
  } else {
    watchDynamicInputs();
  }

})();
