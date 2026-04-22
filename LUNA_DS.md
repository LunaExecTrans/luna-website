# Luna Executive Chauffeurs — Design System V3

**Canonical source of truth for the Luna brand.** Surfaces: website (`website-luna-executive-public`), driver app (`luna-executive-driver`), client app (`luna-executive-client`).

> **If you are changing the visual language, change this doc first.** Then propagate to each surface (CSS vars on web, `theme.js` on apps).

**Direction (V3, 2026-04-20):** Rolex / Four Seasons luxury hospitality. **Ivory first, navy second, champagne gold as accent whisper.** Drama comes from Playfair Display serif in headlines, not from color or effects. Living reference: [ds-preview.html](ds-preview.html).

---

## Part 1 — Brand pillars

1. **Ivory is the brand.** Day surfaces are cream/ivory (like Four Seasons stationery). Dark is the *alt* — evening — not the default.
2. **Navy is the anchor.** Deep navy-blue (not pure black) — every body copy reads on it or against it. Medium-deep, clearly blue.
3. **Champagne gold whispers.** Used in ≤3% of any view. Kickers, focus rings, corner accents, small badges — never large fills, never gradients.
4. **Drama through typography.** Playfair Display (high thin/thick contrast) carries editorial luxury. Inter handles 95% of UI silently. IBM Plex Mono for data only.
5. **Sharper than soft.** Radius scale is precise (2–16px) — Rolex-like. Nothing feels bubble-y.
6. **Whitespace is luxury.** 4px grid with heavy use of 48/64/96 for hero gaps.

## Part 2 — Anti-patterns (hard banned)

- ❌ Gradient as identity (gold-gradient fills, navy-to-purple, etc)
- ❌ Colored or gold-tinted shadows — shadows are navy-alpha only
- ❌ Glow, neon, blur-behind-color
- ❌ Large uniform border-radius (`16+` reserved for `xl` sheets only; pill `full` only on badges)
- ❌ Gold in area larger than ~3% of screen
- ❌ Icons filled/maciços — always 1.5px hairline strokes
- ❌ Body copy in serif
- ❌ More than ONE serif typeface
- ❌ Pure `#000` (Luna is navy-black, not tech-black)

## Part 3 — Surface implementations

Each surface ports these tokens to its native format. Do not drift.

- **Website** (`website-luna-executive-public/styles.css`) → CSS custom properties under `:root` and `[data-theme="dark"]`.
- **Driver app** (`luna-executive-driver/src/config/theme.js`) → JS theme object consumed by RN.
- **Client app** (`luna-executive-client/src/config/theme.js`) → same pattern as driver.

Font packages:
- Web: Google Fonts — `Playfair Display`, `Inter`, `IBM Plex Mono`
- RN: `@expo-google-fonts/playfair-display`, `@expo-google-fonts/inter`, `@expo-google-fonts/ibm-plex-mono`

---

## Part 4 — Canonical tokens

### Light — day luxury (default)

```
# SURFACES
surface-page       #F5F1E8   (ivory — Four Seasons stationery)
surface-card       #FFFFFF   (clean white card on ivory)
surface-elevated   #FDFAF2   (modals, sheets)
surface-overlay    rgba(245,241,232,0.92)

# TEXT
text-primary       #070C18   (deep navy-black)
text-secondary     rgba(7,12,24,0.66)
text-muted         rgba(7,12,24,0.44)
text-on-gold       #070C18   (text on gold surfaces)
text-on-dark       #F5F1E8   (text on dark surfaces)

# BORDERS
border-default     rgba(7,12,24,0.14)
border-subtle      rgba(7,12,24,0.06)
border-strong      rgba(7,12,24,0.22)
border-focus       #B89560   (deeper gold for contrast on ivory)

# ACCENT — champagne gold (≤3% usage)
accent-gold        #B89560   (deeper champagne for ivory bg)
accent-gold-deep   #9E7F4A   (pressed / hover)
accent-gold-glow   rgba(184,149,96,0.18)

# ACTIONS
action-primary-bg        #070C18  (navy solid)
action-primary-text      #F5F1E8
action-primary-press     #111828
action-secondary-bg      transparent
action-secondary-text    #070C18
action-secondary-border  rgba(7,12,24,0.22)
action-destructive-bg    #A25149
action-destructive-text  #F5F1E8

# STATUS (muted, hospitality-tuned)
status-success     #5E8E60   (sage)
status-warning     #B8894A   (amber)
status-error       #A25149   (rust)
status-info        #5E7E9A   (dusty blue)
```

### Dark — evening luxury (alt theme)

```
# SURFACES
surface-page       #0D1528   (medium-deep navy — clearly blue, 2 tones lighter than pure tech-navy)
surface-card       #121B30
surface-elevated   #182239
surface-overlay    rgba(13,21,40,0.92)

# TEXT
text-primary       #F5F1E8   (ivory — matches the light mode page bg, not a lesser cream)
text-secondary     rgba(245,241,232,0.64)
text-muted         rgba(245,241,232,0.40)
text-on-gold       #070C18
text-on-light      #070C18

# BORDERS
border-default     rgba(245,241,232,0.10)
border-subtle      rgba(245,241,232,0.06)
border-strong      rgba(245,241,232,0.20)
border-focus       #D4B878

# ACCENT — champagne gold (brighter on dark)
accent-gold        #D4B878   (classic champagne)
accent-gold-deep   #B89560   (pressed / hover)
accent-gold-glow   rgba(212,184,120,0.18)

# ACTIONS
action-primary-bg        #F5F1E8   (ivory solid on navy)
action-primary-text      #070C18
action-primary-press     #E5DFCE
action-secondary-bg      transparent
action-secondary-text    #F5F1E8
action-secondary-border  rgba(245,241,232,0.20)
action-destructive-bg    #A25149
action-destructive-text  #F5F1E8

# STATUS (slightly brighter for dark-mode contrast)
status-success     #7BAE7F
status-warning     #D4A76A
status-error       #C46B5F
status-info        #8AA7C7
```

### Hero treatment — always dark

The hero section on any page keeps dark-mode tokens even when the rest of the page is in light theme. Rationale: hero background is a dark video; flipping text to navy makes it illegible. This is the same convention used by Rolls-Royce, Aston Martin, Rolex web.

---

## Part 5 — Typography

### Families (hybrid)

```
font-serif   Playfair Display    (drama — hero titles, section headings, hero card names)
                                 400 Regular · 500 Medium · 600 SemiBold · 700 Bold · 900 Black
font-sans    Inter               (UI silent — body, kickers, buttons, labels)
                                 400 Regular · 500 Medium · 600 SemiBold · 700 Bold
font-mono    IBM Plex Mono       (data — phone, price, time, coordinates, reference IDs)
                                 400 Regular · 500 Medium
```

> **Cormorant Garamond removed in V3.** Playfair Display is the only serif.

### Scale

```
display     clamp(48, 9vw, 108) Playfair 400 italic optional · tracking -0.03em · leading 1.02
h1          clamp(40, 5vw, 56)  Playfair 500                 · tracking -0.02em · leading 1.08
h2          clamp(28, 3.5vw, 40) Playfair 400                · tracking -0.015em · leading 1.15
h3          22  Inter 600  · tracking -0.01em
subtitle    17  Inter 500
body        16  Inter 400  · leading 1.6
body-sm     14  Inter 400  · leading 1.5
caption     13  Inter 400  · color text-muted
kicker      11  Inter 500  · letter-spacing 0.2em · uppercase · color accent-gold
brand-kicker 11 Inter 700  · letter-spacing 0.4em · uppercase · color accent-gold
mono        14  IBM Plex Mono 400
kpi-value   32  IBM Plex Mono 500 · tracking -0.01em
kpi-label   10  Inter 500  · letter-spacing 0.2em · uppercase
```

**Rule:** Body text, buttons, kickers, labels are ALWAYS sans. Serif appears only in `display`, `h1`, `h2`, and hero card names (client names, service titles on cards).

---

## Part 6 — Spacing, radius, shadows, motion

### Spacing (4px grid)

```
space-1   4 · space-2  8 · space-3 12 · space-4 16 · space-5 20 · space-6 24
space-8  32 · space-12 48 · space-16 64 · space-20 80 · space-24 96 · space-32 128
```

Hero gaps: prefer 64/96/128. Inside cards: prefer 16/20/24.

### Radius (sharper than V2 — Rolex-precise)

```
radius-xs    2   (hairline chips)
radius-sm    4   (inputs, small badges)
radius-md    6   (buttons, chips)
radius-lg    10  (cards)
radius-xl    16  (sheets, modals, hero media frames)
radius-full  9999 (pill badges, avatars, dots)
```

### Shadows (navy-tinted, paper-soft)

```
shadow-none
shadow-sm   0 1px 2px   rgba(7,12,24,0.04)      (light) · rgba(0,0,0,0.25) (dark)
shadow-md   0 4px 12px  rgba(7,12,24,0.08)      (light) · rgba(0,0,0,0.40) (dark)
shadow-lg   0 16px 40px rgba(7,12,24,0.12)      (light) · rgba(0,0,0,0.55) (dark)
# NO gold-tinted, no colored, no glow shadows.
```

### Motion

```
duration-fast      120ms   (press feedback)
duration-normal    240ms   (sheets, modals, theme transition)
duration-slow      400ms   (hero entry, scroll-scrub)
easing-standard    cubic-bezier(0.2, 0, 0.2, 1)
easing-decelerate  cubic-bezier(0, 0, 0.2, 1)
```

---

## Part 7 — Component patterns

### Primary button
- bg `action-primary-bg` · text `action-primary-text` · Inter 600 14 · radius `md` (6) · padding 12×22
- shadow-sm · hover: bg `action-primary-press`

### Secondary / ghost button
- bg transparent · text `text-primary` · border 1px `action-secondary-border` (strong 22%) · radius `md`
- hover: border `accent-gold`, text `accent-gold`

### Gold accent CTA (rare)
- bg `accent-gold` · text `text-on-gold` · Inter 600 14 · radius `md`
- hover: bg `accent-gold-deep`

### Card
- bg `surface-card` · border 1px `border-subtle` · radius `lg` (10) · padding 24–28
- shadow-sm · hover (web): border `border-default`, translateY(-2px)
- No corner accents by default. Reserve for "hero" moments only (booking form, active ride).

### Corner accent (signature — ≤1 card per view)
- Gold L-shape in top-left and bottom-right, 16×16, 1px `accent-gold`, 0.7 opacity
- Only on the single "hero" card of a view

### Kicker
- Inter 500 11 · letter-spacing 0.2em · uppercase · color `accent-gold`
- `brand-kicker` variant uses Inter 700 + 0.4em tracking (for "LUNA EXECUTIVE CHAUFFEURS" appearances)

### Input
- bg `surface-page` · border 1px `border-default` · radius `md` · padding 13×14 · Inter 15
- focus: border `border-focus` (gold), bg `surface-elevated`

### Badge
- radius `full` · Inter 500 11 · letter-spacing 0.1em · uppercase · padding 4×12
- Outlined style: color = status · border = status 30% · bg = status 10%

### Inline link (hospitality convention)
- `text-decoration: underline` always visible · thickness 1px · offset 3px
- Color: `text-primary`, underline `border-strong`
- Hover: color + underline become `accent-gold`

---

## Part 8 — Changelog

### 2026-04-20 — V3 "Rolex/Four Seasons definitive"

Complete redefinition. Breaking changes across all surfaces.

**Typography:**
- Cormorant Garamond → **Playfair Display** (serif)
- Inter + IBM Plex Mono retained

**Palette — light (now default):**
- Ivory `#F5F1E8` page, white card, deep navy `#070C18` text
- Gold shifts to `#B89560` (deeper) for contrast on ivory
- Status colors muted further (sage/amber/rust/dusty at ~65% saturation)

**Palette — dark (now alt):**
- Deeper value shift: page `#070C18` → `#0D1528` (2 tones lighter, more clearly blue)
- Card `#0F1628` → `#121B30`, elevated `#141C32` → `#182239`
- Ivory text (full `#F5F1E8`, not dimmer cream)
- Gold stays `#D4B878`

**Radii (sharper):**
- Card `14` → `10`, button `10` → `6`, input `10` → `6`

**Shadows:**
- Black-rgba → navy-rgba `(7,12,24, ...)` in light, deeper black in dark
- `lg` shifts from 12px/32px to 16px/40px (softer throw)

**Anti-patterns added:**
- Hero-treatment-always-dark rule
- One-serif rule (Cormorant banned)
- 3% gold rule

### Unreleased

_Nothing pending._
