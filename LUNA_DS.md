# Luna Executive Chauffeurs — Design System v1.1 "Personnalité"

**Canonical source of truth for the Luna brand.** Surfaces: website (`website-luna-executive-public`), driver app (`luna-executive-driver`), client app (`luna-executive-client`), dispatch (`luna-dispatch`).

> **If you are changing the visual language, change this doc first.** Then propagate to each surface (CSS vars on web/dispatch, `theme.js` on apps).

**Direction (v1.1, 2026-04-27):** Itaú Personnalité — quiet luxury, financial-grade. **Ivory first, royal navy as anchor, Personnalité gold accent.** Inspired by Itaú Personnalité private banking — the same emotional register Luna's chauffeur clients already trust. Drama through Playfair Display serif italic emphasis. Dark mode is the *signature* (Personnalité-style royal navy gradient with gold-fill primary).

Living reference: [ds-preview.html](ds-preview.html).

---

## Part 1 — Brand pillars

1. **Ivory is the day surface.** Light mode pages are ivory cream (`#F5F1E8`) like Four Seasons stationery.
2. **Royal navy is the anchor.** Personnalité royal navy `#012B5B` — clearly blue, deep, not pure black. Gradient terminus `#001C44` (near-black navy).
3. **Personnalité gold whispers — except dark-mode primary.** Warm gold `#CDA65B` is restrained on light surfaces (≤3%). On dark mode, the primary CTA is gold-fill — that is the Personnalité signature, the recognizable "Itaú P" tactile.
4. **Drama through typography.** Playfair Display (italic carries tradition: "*arriving* on your terms"). Inter handles 95% of UI silently. IBM Plex Mono for kickers/eyebrows/data — typewriter feel of a confirmation receipt.
5. **Sharper than soft.** Radius scale 2/4/6/10/16. Cards default to 6 (Rolex-precise), large hero panels go to 16. Nothing feels bubble-y.
6. **Whitespace is luxury.** 4px grid with heavy use of 48/64/80/96 for hero gaps.

## Part 2 — Anti-patterns (hard banned)

- ❌ Gradient as identity in light mode (no gold gradients, no navy-purple)
- ❌ Pure `#000` (Luna is royal navy, not tech-black)
- ❌ Cyan/teal/magenta/neon in any quantity
- ❌ Glow, neon, blur-behind-color
- ❌ Large uniform border-radius (`16+` reserved for `xl` hero panels; pill `full` only on badges/avatars)
- ❌ Gold in area larger than ~3% of *light-mode* views (dark-mode primary CTA is the explicit exception — Personnalité signature)
- ❌ Icons filled/maciços — always 1.5px hairline strokes
- ❌ Body copy in serif
- ❌ More than ONE serif typeface
- ❌ Bouncy/overshoot animations (use Luna easing `cubic-bezier(0.2, 0, 0.2, 1)`, no springs except `gentle`/`stiff`)

## Part 3 — Surface implementations

Each surface ports these tokens to its native format. Do not drift.

- **Website** (`website-luna-executive-public/styles.css`) → CSS custom properties under `:root` and `[data-theme="dark"]`.
- **Dispatch** (`luna-dispatch/core/ds-tokens.css`) → CSS custom properties (loaded first by all dispatch stylesheets).
- **Driver app** (`luna-executive-driver/src/config/theme.js`) → JS theme object consumed by RN.
- **Client app** (`luna-executive-client/src/config/theme.js`) → JS bridge re-exporting from canonical TS source at `theme/` (the new modular DS).

Font packages:
- Web: Google Fonts — `Playfair Display` (incl. italic), `Inter`, `IBM Plex Mono`
- RN: `@expo-google-fonts/playfair-display`, `@expo-google-fonts/inter`, `@expo-google-fonts/ibm-plex-mono`

---

## Part 4 — Canonical tokens

### Light — day luxury (default)

```
# SURFACES
surface-page       #F5F1E8   (ivory — Four Seasons stationery)
surface-card       #FFFFFF   (clean white card on ivory)
surface-elevated   #FDFAF2   (modals, sheets, lifted cards)
surface-overlay    rgba(245,241,232,0.92)

# TEXT — Personnalité royal navy ink
text-primary       #012B5B   (royal navy ink)
text-secondary     rgba(1,43,91,0.72)
text-muted         rgba(1,43,91,0.50)
text-on-gold       #001C44   (deep navy on gold surfaces)
text-on-dark       #F5F1E8   (ivory on dark surfaces)

# BORDERS
border-default     rgba(1,43,91,0.16)
border-subtle      rgba(1,43,91,0.08)
border-strong      rgba(1,43,91,0.26)
border-focus       #CDA65B   (gold border on focus)

# ACCENT — Personnalité gold (≤3% on light)
accent-gold        #CDA65B   (Personnalité signature gold — warmer than champagne)
accent-gold-deep   #A88547   (pressed / hover)
accent-gold-light  #DDB876   (hover lighter)
accent-gold-glow   rgba(205,166,91,0.20)

# ACCENT — Royal navy
navy-default       #012B5B
navy-deep          #001C44   (gradient terminus, deepest)
navy-light         #003D7A   (hover, lighter areas)
navy-glow          rgba(1,43,91,0.18)

# ACTIONS (light: primary is navy-fill)
action-primary-bg        #012B5B
action-primary-text      #F5F1E8
action-primary-press     #001C44
action-secondary-bg      transparent
action-secondary-text    #012B5B
action-secondary-border  rgba(1,43,91,0.26)
action-destructive-bg    #A25149   (muted terracotta — kept)
action-destructive-text  #F5F1E8

# STATUS (hospitality-tuned, never garish)
status-success     #5E8E60   (sage)
status-warning     #B8894A   (amber)
status-error       #A25149   (rust)
status-info        #5E7E9A   (dusty blue)
```

### Dark — evening luxury (Personnalité signature)

```
# SURFACES — mid-deep navy (Personnalité royal kept as ACCENT only)
# Page is intentionally less saturated than Personnalité signature #012B5B
# so the bright royal navy doesn't dominate full-screen real estate. The
# signature blue stays loud where it belongs: gold-band partner, kickers,
# brand splash, accent strokes. Page bg = navy-grey territory.
surface-page          #0A1530   (mid-deep navy — controlled, not gritante)
surface-card          #11203D   (slightly lifted, navy with charcoal)
surface-elevated      #182A4A   (modals, sheets, hover)
surface-overlay       rgba(10,21,48,0.92)
surface-gradient-end  #020510   (almost-black navy — drama terminus)

# TEXT — ivory ink
text-primary       #F5F1E8
text-secondary     rgba(245,241,232,0.70)
text-muted         rgba(245,241,232,0.45)
text-on-gold       #001C44   (deep navy on gold)
text-on-light      #001C44

# BORDERS
border-default     rgba(245,241,232,0.12)
border-subtle      rgba(245,241,232,0.06)
border-strong      rgba(245,241,232,0.22)
border-focus       #CDA65B

# ACCENT — Personnalité gold (brighter on dark navy)
accent-gold        #CDA65B
accent-gold-deep   #A88547
accent-gold-light  #DDB876
accent-gold-glow   rgba(205,166,91,0.22)

# ACCENT — Royal navy
navy-default       #012B5B
navy-deep          #001C44
navy-light         #003D7A
navy-glow          rgba(1,43,91,0.40)

# ACTIONS (dark: primary is GOLD-fill — Personnalité signature)
action-primary-bg        #CDA65B
action-primary-text      #001C44
action-primary-press     #A88547
action-secondary-bg      transparent
action-secondary-text    #F5F1E8
action-secondary-border  rgba(245,241,232,0.22)
action-destructive-bg    #A25149
action-destructive-text  #F5F1E8

# STATUS (slightly brighter for dark-mode contrast)
status-success     #7BAE7F
status-warning     #D4A76A
status-error       #C46B5F
status-info        #8AA7C7
```

### Hero treatment — always dark

The hero section on any page keeps dark-mode tokens even when the rest of the page is in light theme. Rationale: hero background is a dark video; flipping text to navy makes it illegible. This is the same convention used by Rolls-Royce, Aston Martin, Personnalité product pages.

### Dark-mode page gradient (signature, REQUIRED)

When dark theme is active, page background MUST be a vertical gradient from `surface-page` (top, royal navy `#012B5B`) to `surface-gradient-end` (bottom, navy-black `#000A1F`). Reason: pure royal navy across a tall scroll reads "too saturated blue". The gradient anchors the page in Personnalité signature blue at the fold and lets the depth grow into navy-black drama as you scroll. Mimics the bottom half of the Itaú P card art.

```
/* Web */
[data-theme="dark"] body {
  background:
    linear-gradient(180deg, var(--surface-page) 0%, var(--surface-gradient-end) 100%)
    var(--surface-gradient-end) fixed;
}

/* RN apps */
atmosphere.pageGradient = [surface.page, '#050C1F', '#020510']  /* top → terminus */
atmosphere.pageGradientLocations = [0, 0.3, 1]                  /* faster fade-to-black */
```

Cards (`surface-card #022F63`) and elevated panels (`#03366E`) retain their flat fills — gradient is page-only.

### Gradients (Personnalité signature)

```
personnaliteNavy           ['#012B5B', '#001C44']
                           Iconic navy gradient. Use as background for splash, dark hero sections.

personnaliteNavyVertical   ['#012B5B', '#001A40']
                           Vertical version — mimics the actual Itaú P logo's bottom half.

personnaliteGold           ['#DDB876', '#CDA65B', '#A88547']
                           Premium element backgrounds (rare, restrained — never large fills).

personnaliteSplit          ['#CDA65B', '#CDA65B', '#012B5B', '#001C44']
                           Navy + gold split (banner-style, like the Personnalité card art).

ivoryPage                  ['#F5F1E8', '#FDFAF2']
                           Subtle light-mode page gradient.

glassNavy                  ['rgba(1,43,91,0.85)', 'rgba(0,28,68,0.95)']
                           Glass overlay over hero photos.
```

---

## Part 5 — Typography

### Families (hybrid)

```
font-serif   Playfair Display    (drama — hero titles, section headings, hero card names, italic emphasis)
                                 400 Regular · 500 Medium · 600 SemiBold · 700 Bold · 900 Black · 400 Italic
font-sans    Inter               (UI silent — body, kickers, buttons, labels)
                                 400 Regular · 500 Medium · 600 SemiBold · 700 Bold
font-mono    IBM Plex Mono       (eyebrows / data — phone, price, time, coordinates, reference IDs, the "luxury receipt" feel)
                                 400 Regular · 500 Medium
```

> **Cormorant Garamond removed in V3 (2026-04-20). Playfair Display is the only serif.**
> **Italic Playfair is signature in v1.1** — used inline for emphasis ("the quiet luxury of *arriving*", "Three stages. *One* standard."). Never for body.

### Scale

```
hero        clamp(48, 9vw, 108) Playfair 900 italic optional · tracking -1     · leading 1.08
display     clamp(40, 5vw, 56)  Playfair 700                · tracking -0.5   · leading 1.15
h1          28  Playfair 700  · tracking -0.3
h2          22  Playfair 700  · tracking -0.2
h3          18  Playfair 600
h4          16  Inter 600     (UI heading)
h5          14  Inter 600     (UI heading)
body-large  17  Inter 400     · leading 1.55
body        15  Inter 400     · leading 1.55  (matches website)
body-sm     13  Inter 400     · leading 1.46
label       13  Inter 500     · letter-spacing 0.1
label-sm    12  Inter 500
eyebrow     11  IBM Plex Mono 500 · letter-spacing 2.5  · uppercase  (signature monospace tag)
meta        10  IBM Plex Mono 400 · letter-spacing 1.5  · uppercase
code        12  IBM Plex Mono 400
button      14  Inter 600     · letter-spacing 0.2  (primary/gold variants force uppercase + 1.5)
button-sm   12  Inter 600     · letter-spacing 0.2
stat-number 48  Playfair 900  · tracking -1     · leading 1.08
price       20  Playfair 700  · leading 1.20
italic      —   Playfair Italic (inline emphasis, never standalone)
```

**Rule:** Body text, buttons, kickers, labels are ALWAYS sans. Serif appears only in `hero`, `display`, `h1-h3`, hero card names, and italic inline emphasis. Eyebrow/meta/code are always mono.

---

## Part 6 — Spacing, radius, shadows, motion

### Spacing (4px grid)

```
2xs  2 · xs   4 · sm   8 · md  12 · lg  16 · xl  20 · 2xl 24
3xl 32 · 4xl 40 · 5xl 48 · 6xl 64 · 7xl 80 · 8xl 96 · 9xl 128
```

Hero gaps: prefer 64/80/96/128. Inside cards: prefer 16/20/24.

### Radius (Rolex-precise)

```
xs    2   (hairline pills, tag corners — Badge default)
sm    4   (input fields, small chips)
md    6   (default for cards, buttons — NOT 12 like MTU)
lg    10  (larger cards, modals)
xl    16  (hero panels, large buttons — max for "boxes")
full  9999 (circles, pill badges, avatars only)
```

### Shadows (navy-tinted, paper-soft)

```
shadow-none
shadow-sm   0 1px 2px   rgba(1,43,91,0.04)      (light) · rgba(0,0,0,0.25) (dark)
shadow-md   0 4px 16px  rgba(1,43,91,0.08)      (light) · rgba(0,0,0,0.40) (dark)
shadow-lg   0 16px 60px rgba(1,43,91,0.12)      (light) · rgba(0,0,0,0.55) (dark)
shadow-gold 0 8px 20px  rgba(184,149,96,0.18)   (rare — only over ivory, never on dark bg, key CTAs only)
# NO neon, no colored, no glow shadows.
```

### Motion (Luna easing)

```
duration-fast      120ms   (press feedback, hover, focus)
duration-normal    240ms   (sheets, modals, theme transition)
duration-slow      400ms   (hero entry, scroll-scrub)
duration-splash    2400ms  (splash hold)

easing-luna        cubic-bezier(0.2, 0, 0.2, 1)   (signature — 95% of motion)
easing-decelerate  cubic-bezier(0, 0, 0.2, 1)
easing-accelerate  cubic-bezier(0.4, 0, 1, 1)

springs:
  default  tension 30 friction 12   (settles smoothly, no overshoot)
  stiff    tension 80 friction 14   (snappy state changes)
  gentle   tension 18 friction 10   (hero entrances)
  # bouncy/overshoot springs are BANNED. Luxury services don't bounce.
```

### Layout (RN apps)

```
maxWidth          1200    (web container)
screenPadding     20      (mobile safe content padding)
sectionGap        80      (luxury breathing between major sections)
sectionGapMobile  48
cardPadding       24
navbarHeight      72
tapTarget         44      (Apple HIG minimum)
buttonHeight      48      (md default) · 36 sm · 56 lg
inputHeight       52
iconSize          xs:12 · sm:14 · md:18 · lg:22 · xl:28
hitSlop           {top:8, right:8, bottom:8, left:8}
```

---

## Part 7 — Component patterns

### Primary button
- **Light:** bg `action-primary-bg` (royal navy `#012B5B`) · text ivory · Inter 600 14 · radius `md` (6) · padding 12×22 · uppercase + letter-spacing 1.5
- **Dark (Personnalité signature):** bg `accent-gold` (`#CDA65B`) · text deep navy · Inter 600 14 · radius `md`
- shadow-sm · press: bg `action-primary-press`, scale 0.98

### Secondary / ghost button
- bg transparent · text `text-primary` · border 1px `action-secondary-border` · radius `md`
- press: scale 0.98, opacity 0.85

### Gold accent CTA (rare, light-mode only)
- bg `accent-gold` · text `text-on-gold` · Inter 600 14 · radius `md` · uppercase
- hover: bg `accent-gold-deep`
- Use sparingly — sealed actions like "See full specs", "Confirm reservation"

### Card
- bg `surface-card` · border 1px `border-subtle` · radius `md` (6) · padding 24
- Variants: default · elevated (with shadow-md) · outline (no fill) · gold-edge (3px gold left border for VIP/featured) · overlay (semi-transparent over photos)
- No corner accents by default. Reserve for "hero" moments only (splash, primary booking card).

### Corner accent (signature — ≤1 card per view)
- Gold L-shape in top-left and bottom-right, 16×16, 1px `accent-gold`, 0.7 opacity
- Only on the single "hero" card of a view

### Eyebrow (signature)
- IBM Plex Mono 500 11 · letter-spacing 2.5em · uppercase · color `accent-gold`
- The "LUNA EXECUTIVE CHAUFFEURS · SOUTH FLORIDA" tag at top of sections
- Variant `meta`: 10px, letter-spacing 1.5

### Input
- bg `surface-page` · border 1px `border-default` · radius `md` (6) · padding 13×14 · Inter 15
- height 52
- focus: border `border-focus` (gold), bg `surface-elevated`

### Badge
- radius `xs` (2px — Rolex-sharp) · IBM Plex Mono 500 10/11 · letter-spacing 1.5/2 · uppercase · padding 4×8
- Variants: default (hairline border) · gold (gold glow + border) · success/warning/error/info (transparent + status border)

### Inline link (hospitality convention)
- `text-decoration: underline` always visible · thickness 1px · offset 3px
- Color: `text-primary`, underline `border-strong`
- Hover: color + underline become `accent-gold`

### Italic emphasis (signature)
```
The quiet luxury of <em>arriving</em> on your own terms.
Three stages. <em>One</em> standard.
```
- Inline `<em>` or `<Em>` (RN) → Playfair Italic
- Use inside `hero`, `display`, `h1-h2` for editorial emphasis only
- Never on body, never standalone

---

## Part 8 — Changelog

### 2026-04-27 — v1.1 "Personnalité"

Migration from V3 Rolex/Four Seasons to v1.1 Itaú Personnalité — same luxury register, different anchor reference. Visual familiarity for chauffeur clients who hold Personnalité private banking.

**Palette shift:**
- Navy `#070C18` (deep navy-black, Rolex) → `#012B5B` (royal navy ink, Personnalité)
- Gold `#B89560` (champagne, deeper) → `#CDA65B` (Personnalité warm gold)
- Surfaces dark `#0D1528 / #121B30 / #182239` → `#012B5B / #022F63 / #03366E` (royal navy gradient base)
- Light text/borders shift to navy-alpha `rgba(1,43,91,…)` (was navy-black `rgba(7,12,24,…)`)

**Behavioral changes:**
- Dark-mode primary action: ivory-fill → **gold-fill** (Personnalité signature). The 3% gold rule still applies on light mode; on dark, the primary CTA *is* the gold moment.
- Italic Playfair promoted to first-class signature treatment. New `italic` typography token + `<Em>` component.
- Personnalité gradient family added (`personnaliteNavy`, `personnaliteSplit`, `personnaliteGold`, `glassNavy`, `ivoryPage`).
- Cards default radius adjusted to `md` (6) from `lg` (10) — matches the new modular DS convention. `lg` (10) reserved for larger cards/modals.

**Structural additions:**
- Modular RN DS in `luna-executive-client/theme/` (TypeScript) — colors.ts, typography.ts, spacing.ts, radius.ts, shadows.ts, animations.ts, ThemeProvider.tsx
- Pre-built RN components in `luna-executive-client/components/` (Badge, Button, Card, Divider, Heading/Em/Eyebrow/Body, ServiceCard, StatBlock)
- Legacy `src/config/theme.js` becomes a bridge re-exporting v1.1 values under V3 API names (so already-migrated screens render with new palette without refactor)

**Anti-patterns retained from V3:**
- Hero-treatment-always-dark
- One-serif rule (Cormorant banned, only Playfair)
- 3% gold rule on light
- No bouncy/overshoot motion
- No pure `#000`

### 2026-04-20 — V3 "Rolex/Four Seasons definitive"

Complete redefinition. Cormorant → Playfair Display. Light-first ivory + navy-black + champagne gold. Replaced by v1.1 Personnalité on 2026-04-27.

### Unreleased

_Nothing pending._
