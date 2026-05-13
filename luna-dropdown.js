/* ============================================================
 * Luna dropdown — custom listbox over a native <select>
 * ============================================================
 * The native control owns form submission and validation; this
 * module only renders a styled menu and writes the chosen value
 * back into the <select>. Used initially by the Vehicle field of
 * the Book-a-new-ride modal on account.html.
 *
 * Markup contract:
 *   <div class="luna-dropdown" data-luna-dropdown data-target="cr-vehicle">
 *     <button class="luna-dropdown-btn" id="cr-vehicle-btn"
 *             aria-haspopup="listbox" aria-expanded="false">
 *       <span class="luna-dropdown-value" data-placeholder="Select…">Select…</span>
 *       <svg class="luna-dropdown-chevron" ... />
 *     </button>
 *     <ul class="luna-dropdown-menu" role="listbox" hidden></ul>
 *   </div>
 *   <select id="cr-vehicle" class="luna-dropdown-shadow" name="vehicleType" required>
 *     <option value="">…</option>
 *     <optgroup label="Sedan">
 *       <option value="Mercedes S-Class">Mercedes S-Class — executive sedan</option>
 *       …
 *     </optgroup>
 *   </select>
 *
 * Behaviour:
 *   - Click trigger to open / close. Outside click closes.
 *   - Escape closes and returns focus to the trigger.
 *   - Click option → write value to the native <select>, dispatch
 *     a bubbling `change` event so existing listeners (validation,
 *     account.js submission flow) run unchanged.
 *   - Native <select> innerHTML changes (e.g. account-vehicles.js
 *     re-rendering from the vehicles-store) are observed via
 *     MutationObserver — the menu rebuilds itself, no manual
 *     re-init needed.
 *
 * Display rules:
 *   - <optgroup label="X"> becomes a non-clickable header row.
 *   - <option> with empty value is skipped (used for "Loading…"
 *     and placeholder rows on the native select).
 *   - Option text in the form "Main — Meta" splits at the em
 *     dash (or " - " ASCII fallback) so the trigger shows just
 *     the main label and the menu can render the meta as a
 *     muted second line.
 * ============================================================ */

(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function splitOptionLabel(text) {
    var s = String(text || '').trim();
    var m = s.split(' — ');           // em dash
    if (m.length < 2) m = s.split(' - '); // ascii fallback
    return {
      main: m[0] || s,
      meta: (m.length > 1 ? m.slice(1).join(' — ') : '')
    };
  }

  function init(container) {
    if (container.__lunaDropdownReady) return;
    container.__lunaDropdownReady = true;

    var targetId = container.getAttribute('data-target');
    if (!targetId) return;
    var select = document.getElementById(targetId);
    if (!select) return;

    var btn     = container.querySelector('.luna-dropdown-btn');
    var menu    = container.querySelector('.luna-dropdown-menu');
    var valueEl = container.querySelector('.luna-dropdown-value');
    if (!btn || !menu || !valueEl) return;

    var placeholder = valueEl.getAttribute('data-placeholder') || 'Select…';

    function isOpen() { return container.getAttribute('data-open') === 'true'; }

    function open() {
      if (isOpen()) return;
      container.setAttribute('data-open', 'true');
      btn.setAttribute('aria-expanded', 'true');
      menu.hidden = false;
      // Scroll the currently selected option into view.
      var sel = menu.querySelector('.luna-dropdown-option[aria-selected="true"]');
      if (sel && typeof sel.scrollIntoView === 'function') {
        sel.scrollIntoView({ block: 'nearest' });
      }
    }
    function close() {
      if (!isOpen()) return;
      container.setAttribute('data-open', 'false');
      btn.setAttribute('aria-expanded', 'false');
      menu.hidden = true;
    }
    function toggle() { isOpen() ? close() : open(); }

    function updateTriggerLabel() {
      var opt = select.options[select.selectedIndex];
      if (opt && opt.value) {
        var parts = splitOptionLabel(opt.textContent);
        valueEl.textContent = parts.main;
        btn.setAttribute('data-empty', 'false');
      } else {
        valueEl.textContent = placeholder;
        btn.setAttribute('data-empty', 'true');
      }
    }

    var CHECK_SVG =
      '<svg class="luna-dropdown-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="20 6 9 17 4 12"/></svg>';

    function buildMenu() {
      var html = [];
      var nodes = select.children;
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.tagName === 'OPTGROUP') {
          html.push('<li class="luna-dropdown-group" role="presentation">' + escapeHtml(node.label) + '</li>');
          for (var j = 0; j < node.children.length; j++) {
            html.push(renderOption(node.children[j]));
          }
        } else if (node.tagName === 'OPTION' && node.value) {
          html.push(renderOption(node));
        }
      }
      if (!html.length) {
        html.push('<li class="luna-dropdown-group" role="presentation">No vehicles available</li>');
      }
      menu.innerHTML = html.join('');
      bindOptionClicks();
      updateTriggerLabel();
    }

    function renderOption(opt) {
      var selected = String(opt.value) === String(select.value);
      var parts = splitOptionLabel(opt.textContent);
      var meta = parts.meta ? '<span class="luna-dropdown-option-meta">' + escapeHtml(parts.meta) + '</span>' : '';
      return (
        '<li class="luna-dropdown-option" role="option" tabindex="0" data-value="' + escapeHtml(opt.value) + '" aria-selected="' + (selected ? 'true' : 'false') + '">' +
          '<div class="luna-dropdown-option-body">' +
            '<span class="luna-dropdown-option-main">' + escapeHtml(parts.main) + '</span>' +
            meta +
          '</div>' +
          CHECK_SVG +
        '</li>'
      );
    }

    function bindOptionClicks() {
      var items = menu.querySelectorAll('.luna-dropdown-option');
      items.forEach(function (li) {
        function pick() {
          var v = li.getAttribute('data-value');
          select.value = v;
          // Refresh aria-selected on every option without rebuilding.
          items.forEach(function (x) {
            x.setAttribute('aria-selected', x === li ? 'true' : 'false');
          });
          updateTriggerLabel();
          // Bubble a real change event so any existing listener fires.
          select.dispatchEvent(new Event('change', { bubbles: true }));
          close();
          btn.focus();
        }
        li.addEventListener('click', pick);
        li.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pick();
          }
        });
      });
    }

    // Trigger interactions
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
        var first = menu.querySelector('.luna-dropdown-option');
        if (first) first.focus();
      }
    });

    // Menu keyboard nav (Arrow up/down between options)
    menu.addEventListener('keydown', function (e) {
      var focused = document.activeElement;
      if (!focused || !focused.classList.contains('luna-dropdown-option')) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        var next = focused.nextElementSibling;
        while (next && !next.classList.contains('luna-dropdown-option')) next = next.nextElementSibling;
        if (next) next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        var prev = focused.previousElementSibling;
        while (prev && !prev.classList.contains('luna-dropdown-option')) prev = prev.previousElementSibling;
        if (prev) prev.focus();
      }
    });

    // Outside click / Escape
    document.addEventListener('click', function (e) {
      if (!isOpen()) return;
      if (!container.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) {
        close();
        btn.focus();
      }
    });

    // Re-render whenever the native <select>'s options change
    // (account-vehicles.js rebuilds innerHTML on every store event).
    var observer = new MutationObserver(buildMenu);
    observer.observe(select, { childList: true, subtree: false });

    // Also re-sync if some other code sets select.value programmatically.
    select.addEventListener('change', function () {
      updateTriggerLabel();
      // refresh aria-selected on existing items without rebuilding
      var items = menu.querySelectorAll('.luna-dropdown-option');
      items.forEach(function (li) {
        li.setAttribute('aria-selected', String(li.getAttribute('data-value')) === String(select.value) ? 'true' : 'false');
      });
    });

    buildMenu();
  }

  function initAll() {
    document.querySelectorAll('[data-luna-dropdown]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
