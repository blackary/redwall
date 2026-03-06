# Redwall RTS Spec

## Product
- Browser-only, static-hosted RTS inspired by Age of Empires.
- Single playable Abbey alliance civilization for v1.
- Deterministic skirmish simulation with local autosave/resume.

## Technical shape
- `src/core`: simulation, commands, AI, tech tree, persistence snapshots.
- `src/render`: Phaser scenes and generated art.
- `src/ui`: menus, HUD, overlays, and test hooks.
- `IndexedDB` stores the latest resumable match; `localStorage` stores settings and resume metadata.

## Milestones
1. Bootstrap, docs, deterministic query flags, and Playwright/Vitest harness.
2. Isometric map, camera, selection, movement shell.
3. Economy, construction, age-up, autosave/resume.
4. Military production, combat, research, pathfinding.
5. AI skirmish, fog, and match outcomes.
6. UX/art polish and GitHub Pages-compatible deployment.
