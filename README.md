# Redwall RTS

Browser-only real-time strategy prototype inspired by Age of Empires, reframed around Redwall-style woodland factions. The current vertical slice ships a playable Abbey alliance skirmish with economy, tech progression, combat, local autosave/resume, and a scripted AI opponent.

## Current scope
- Static-site build with no backend
- One playable Abbey alliance civilization
- Isometric 1v1 skirmish on `Mossflower Meadows`
- Three ages: `Settlement`, `Abbey`, `Warhost`
- Economy, building placement, unit production, ranged/melee combat, towers, and fog of war
- Original stylized in-engine art for units, buildings, terrain, and resources
- Building work-state UI for construction, training, research, and age-up progress
- Local resume via IndexedDB + localStorage metadata
- GitHub Pages deployment workflow that publishes the built `dist/` artifact

## Controls
- `Left click`: select units or buildings
- `Box select`: drag with left click
- `Right click`: contextual command
- `Ctrl+click` or `Alt+left-click`: Mac-friendly contextual command fallback
- `W/A/S/D` or arrow keys: move the camera
- `Shift + drag`: pan the camera directly
- Mouse wheel: zoom
- `M`: arm move mode for left-click command placement
- `G`: arm gather mode
- `T`: arm attack mode
- `Y`: arm rally mode for selected buildings
- `H`: worker dormitory shortcut
- `B`: worker barracks shortcut
- `Q`: train worker from `Abbey Hall`
- `R`: train archer from `Range`
- `Escape`: clear armed build/command modes
- `Grid` toggle in HUD: sharpen tile outlines for precise placement
- `Motion` toggle in HUD: reduce animated command pings
- `Save & Exit`: save the current skirmish and return to the menu with `Continue Last Match` ready

## Local development
```bash
npm ci
npm run dev
```

Open the local Vite URL and start a skirmish from the main menu.

## Verification
```bash
npm test
npm run test:e2e
npm run build
```

The Playwright suite covers:
- bootstrap and menu flow
- camera/selection/movement loop
- economy + autosave/resume
- production queue visibility
- AI skirmish expansion/pressure

## GitHub Pages
The Pages workflow in [.github/workflows/deploy-pages.yml](/Users/zachary/projects/redwall/.github/workflows/deploy-pages.yml) installs dependencies, runs `npm test`, runs `npm run test:e2e`, builds the app with `npm run build`, and deploys the `dist/` output. Because Vite is configured with `base: "./"`, the generated `index.html` and asset paths are GitHub Pages compatible without router rewrites.
