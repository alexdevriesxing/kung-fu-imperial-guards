# Kung-Fu: Imperial Guards

A polished, original browser-based martial-arts platform fighter. It captures the compact exploration, ladders, traps and close-range action associated with classic home-computer games while using original characters, level layouts, code, artwork and presentation.

## Included vertical slice

- One continuous 6,400-pixel Moon Gate Fortress stage
- Five Imperial Seals placed across elevated routes
- Sword guards, spear guards and acrobatic guards
- Multi-phase Crimson Captain boss encounter
- Punch, kick, aerial kick, sweep, dash, climbing and combo systems
- Checkpoints, hazards, score, Chi, health and local high-score saving
- Cinematic layered fortress rendering, particles, lighting and animated HUD
- Keyboard, touch and responsive landscape controls
- Procedural Web Audio effects and atmospheric music pulses
- Key art, title logo, app icon, menus, pause screen and end screen
- PWA service worker and Cloudflare Pages deployment configuration

## Controls

- Move: `A/D` or `←/→`
- Jump: `Space` or `W/↑` while grounded
- Climb: `W/S` or `↑/↓` near ladders
- Punch: `J`
- Kick / aerial kick: `K`
- Sweep: `L`
- Dash: `Shift`
- Pause: `Esc` or `P`

Touch controls appear automatically on mobile and tablet devices.

## Local development

```bash
npm install
npm run dev
npm run check
npm run build
```

The production build is written to `dist/`.

## Cloudflare Pages

`wrangler.toml` and `.github/workflows/deploy-cloudflare.yml` are included. The workflow validates and builds the game, creates the Cloudflare Pages project when necessary, and deploys `dist/` after pushes to `main`.

Add these GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The API token needs Cloudflare Pages edit permission. The Pages project name is `kung-fu-imperial-guards`.

## Commercial production notes

This repository is a complete playable vertical slice suitable for testing, pitching and further production. A full commercial release should still receive broader device QA, controller remapping, accessibility review, localization, authored music, analytics/privacy configuration and additional stages.
