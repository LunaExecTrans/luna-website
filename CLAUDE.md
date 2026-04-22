# Luna Executive Chauffeurs — Website

Site público institucional da **Luna Executive Chauffeurs** (serviço de limo premium no sul da Flórida). Vitrine + captação de bookings. Parte do ecossistema Luna (driver app + client app + este site).

## Stack

- **HTML / CSS / JS vanilla** — sem framework, sem build step
- Google Fonts: Inter + Cormorant Garamond + IBM Plex Mono
- `schema.org` `LimousineService` JSON-LD
- Hero com `<video>` em loop (autoplay, muted, playsinline)

## Arquivos

- [index.html](index.html) — landing single-page (hero · services · fleet · why · area · booking · contact)
- [styles.css](styles.css) — DS canônico portado pra CSS custom properties em `:root`
- [app.js](app.js) — nav scrolled-state, mobile burger, form → mailto (placeholder)
- [assets/](assets/) — logo-luna.png, black-car.png, favicon.png, video-welcome.mp4
- [LUNA_DS.md](LUNA_DS.md) — **design system canônico da marca** (source of truth pros 3 surfaces)

## Design System

**Este repo é a casa canônica do DS Luna.** [`LUNA_DS.md`](LUNA_DS.md) é a fonte da verdade; driver app + client app implementam os mesmos tokens em RN a partir desse doc.

Regra de propagação ao mudar token:
1. Alterar `LUNA_DS.md` sob `## Unreleased`
2. Propagar em `styles.css` (este projeto)
3. Propagar em `theme.js` do driver e client apps
4. Mover `Unreleased` pra entrada datada

## Hosting

Servido como static site. Funciona em qualquer host (Bluehost, Netlify, Vercel static, Cloudflare Pages). Sem backend — form atualmente abre `mailto:` no cliente; trocar por endpoint (Formspree / backend próprio) quando sair do MVP.

## Gotchas

- Vídeo hero é 20MB — se virar gargalo, gerar versão 720p comprimida + poster frame
- Telefone/email ainda são placeholders (`+1 (000) 000-0000`, `reservations@lunaexecutivechauffeurs.com`) — trocar antes de publicar
- Logo PNG tem fundo transparente; fica bem sobre surface-page, não usar sobre cream

## Memórias relevantes

Auto-carregadas deste working dir (`~/.claude/projects/c--projetos-website-luna-executive-public/memory/`):
- `project_luna_website.md` — visão do site no ecossistema
- `reference_luna_ds.md` — ponteiro pro DS canônico
