# Development Log

## 2026-03-06 Milestone 1
- Summary: Scaffolded the Vite/TypeScript/Phaser project, added Vitest and Playwright harnesses, documented the product spec, and exposed initial deterministic query/test hooks for the bootstrap shell.
- Tests run: `npm test`; `npm run build`; `npm run test:e2e -- tests/e2e/bootstrap.spec.ts`
- Known gaps: Gameplay systems are not implemented yet; the Phaser scene is a bootstrap shell only.
- Commit hash: `0508a59`

## 2026-03-06 Milestone 2
- Summary: Replaced the bootstrap scene with a deterministic isometric battlefield shell, added the core world/simulation model, camera controls, selection UI, movement commands, fog-aware rendering, and a minimap/HUD scaffold.
- Tests run: `npm test`; `npm run build`; `npm run test:e2e -- tests/e2e/bootstrap.spec.ts`
- Known gaps: Economy, construction, persistence, combat production, and AI are only partially scaffolded and not fully validated yet.
- Commit hash: `c654900`

## 2026-03-06 Milestone 3
- Summary: Implemented the economy loop, construction, production queues, age progression prerequisites, snapshot serialization, IndexedDB/localStorage persistence, and menu-based resume of the latest local skirmish.
- Tests run: `npm test`; `npm run build`; `npm run test:e2e -- tests/e2e/bootstrap.spec.ts tests/e2e/economy-resume.spec.ts`
- Known gaps: Combat tuning, AI build/combat behavior, and late-game presentation are still incomplete.
- Commit hash: `0f4e636`

## 2026-03-06 Milestone 4 and 5
- Summary: Tightened controls with explicit command modes and Mac-friendly secondary-command fallbacks, stabilized HUD updates, added AI expansion/attack behavior, and covered combat continuity plus AI pressure in tests.
- Tests run: `npm test`; `npm run build`; `npm run test:e2e -- tests/e2e/bootstrap.spec.ts tests/e2e/economy-resume.spec.ts tests/e2e/skirmish-ai.spec.ts`
- Known gaps: Deployment/docs polish and GitHub Pages automation still need to be finalized.
- Commit hash: `08b5604`

## 2026-03-06 Milestone 6
- Summary: Added a GitHub Pages deployment workflow, documented the current vertical slice and controls, and made the static build/deploy path explicit for the repo.
- Tests run: `npm run build`
- Known gaps: The built bundle is still large because Phaser ships in the main chunk; further split/polish work is possible, but the static deploy path is ready.
- Commit hash: `7ddcdcf`

## 2026-03-06 Control and Pages Polish
- Summary: Added persistent grid/reduced-motion settings in both menu and HUD, added explicit save-and-exit flow back to the resumable menu, fixed new-match versus resume config selection, cleaned up HUD key listener lifecycle, and hardened the Pages workflow to run unit and Playwright coverage before publishing `dist/`.
- Tests run: `npm test`; `npm run test:e2e -- tests/e2e/bootstrap.spec.ts tests/e2e/economy-resume.spec.ts tests/e2e/skirmish-ai.spec.ts tests/e2e/settings.spec.ts`; `npm run build`
- Known gaps: The main bundle is still large because Phaser remains in the primary chunk; deploy is now verified, but bundle splitting is still worth doing.
- Commit hash: `6de67ec`

## 2026-03-06 Art and Production Readability
- Summary: Reworked battlefield rendering with original stylized art for woodland units, buildings, terrain, and resources; added in-world work bars for construction and queues; and added a detailed building work-state panel so barracks, ranges, halls, and workshops clearly show current production plus queued follow-ups.
- Tests run: `npm test`; `npm run test:e2e -- tests/e2e/bootstrap.spec.ts tests/e2e/economy-resume.spec.ts tests/e2e/skirmish-ai.spec.ts tests/e2e/settings.spec.ts tests/e2e/production-progress.spec.ts`; `npm run build`
- Known gaps: Rendering is still immediate-mode Phaser graphics rather than sprite-atlas art, so there is room for a deeper illustration pass and bundle splitting later.
- Commit hash: `892b3d9`

## 2026-03-06 Match Flow and CI Hardening
- Summary: Added pause, victory, and defeat overlays with restart/menu flow; introduced deterministic forced-outcome test hooks; split the heavy skirmish engine out of the menu entry so the static shell loads first; fixed the hidden sidebar overlay intercepting clicks; stabilized e2e startup/helpers; and changed the Pages workflow to run on every push so build, Playwright, and deploy are validated per commit.
- Tests run: `npm test`; `npm run test:e2e -- tests/e2e/bootstrap.spec.ts tests/e2e/economy-resume.spec.ts tests/e2e/skirmish-ai.spec.ts tests/e2e/settings.spec.ts tests/e2e/production-progress.spec.ts tests/e2e/match-flow.spec.ts`; `npm run build`
- Known gaps: Phaser still ships as a large deferred chunk, so initial menu load is lighter now but there is still room for deeper engine chunking or asset-atlas optimization later.
- Commit hash: `141b110`

## 2026-03-06 CI Follow-up
- Summary: Stopped the session tick loop after victory or defeat so match-end overlays stay stable under GitHub Actions timing and no longer recreate their buttons while the Playwright runner is trying to click them.
- Tests run: `npm test`; `npm run test:e2e -- tests/e2e/bootstrap.spec.ts tests/e2e/economy-resume.spec.ts tests/e2e/skirmish-ai.spec.ts tests/e2e/settings.spec.ts tests/e2e/production-progress.spec.ts tests/e2e/match-flow.spec.ts`; `npm run build`
- Known gaps: The remote per-push deploy run still needs to be re-checked after this follow-up commit lands.
- Commit hash: `bcecc2b`

## 2026-03-06 AoE Shell Pass
- Summary: Reworked the in-match presentation into an over-canvas RTS shell with a top resource ribbon and bottom command dock, added hotkeyed command cards with cost/readiness states, richer selection and queue readouts, minimap camera navigation, same-type group selection hooks, and AoE-style Playwright coverage for the new shell behaviors.
- Tests run: `npm test`; `npm run test:e2e`; `npm run build`
- Known gaps: The game now reads much more like a classic RTS shell, but unit picking still needs a future dedicated pass for more precise sprite-level hit behavior without leaning on deterministic debug helpers in tests.
- Commit hash: `c55d4ac`

## 2026-03-06 Creature Art Pass
- Summary: Reworked the battlefield creature rendering so the Abbey and vermin units read as woodland animals instead of generic humanoids, with species-specific heads, ears, snouts, whiskers, tails, gait, and weapon silhouettes for mice, shrews, otters, hares, badgers, and the ram cart crew.
- Tests run: `npm test`; `npm run test:e2e`; `npm run build`
- Known gaps: The units now read much more clearly as Redwall creatures at gameplay scale, but a later pass could still add bespoke hand-drawn selection portraits and higher-detail sprite-atlas animation.
- Commit hash: `0e1e71d`

## 2026-03-06 Sidebar Guidance Pass
- Summary: Restored a persistent right-side advisor panel, moved it into its own HUD column so it no longer blocks the command card, and surfaced detailed per-action build, train, research, rally, and order guidance with costs, timing, unlock age, footprint, and explicit placement instructions.
- Tests run: `npm test`; `npm run test:e2e`; `npm run build`
- Known gaps: The sidebar now makes build and production flow legible again, but the next usability pass should add stronger portrait/icon identity and more advanced queue management interactions.
- Commit hash: `50bc4ee`

## 2026-03-06 Mixed Box Selection Fix
- Summary: Reworked drag selection to use the real screen-space marquee instead of snapped tile corners, restored box selection when units are dragged together with nearby buildings, added unit-first mixed-selection behavior so workers near the abbey hall remain selectable, and widened Vitest coverage to include render-side selection helpers.
- Tests run: `npm test`; `npm run test:e2e`; `npm run build`
- Known gaps: Box selection now behaves correctly around mixed unit/building clusters, but precise click-picking on dense overlapping sprites can still be tuned further in a future input pass.
- Commit hash: `7367747`

## 2026-03-06 Battlefield Animation Pass
- Summary: Added real frame-time unit poses for marching, harvesting, building, carrying, and attacking; animated weapon/tool motion and work/combat effects; added projectile trails, hit flashes, and subtle building activity animation; and exposed render animation state through the debug surface with dedicated render and Playwright coverage.
- Tests run: `npm test`; `npm run test:e2e`; `npm run build`
- Known gaps: Units now visibly work, march, and fight instead of sliding as static tokens, but a future pass could still add sprite-atlas animation, more directional facing, and richer death/impact effects.
- Commit hash: `ae0ba70`
