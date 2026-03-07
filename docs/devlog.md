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

## 2026-03-06 Chronicle Expansion Foundation
- Summary: Added selectable map presets, faction bonuses, persistent Chronicle progression, a guided tutorial scenario, menu-side unlock feedback, faction-aware HUD/sidebar labeling, faction-colored battlefield rendering, map/faction persistence in saves, and unit plus Playwright coverage for unlocking Abbey Orchard and the Riverfolk Collective through tutorial completion.
- Tests run: `npm test`; `npm run test:e2e`; `npm run build`
- Known gaps: The game now supports multiple maps, factions, and a progression loop, but it still needs more playable factions, tutorial chapters, mission-style content, and deeper faction-specific art/audio to complete the full expansion plan.
- Commit hash: `50a0af5`

## 2026-03-06 CI Resume and Animation Stabilization
- Summary: Added a pause hook to the debug surface so save/resume assertions can freeze the sim at the saved frame, and tightened the animation-state Playwright test to verify harvesting motion over time instead of relying on a single peak-swing sample that could miss on slower CI runners.
- Tests run: `npm test`; `npm run test:e2e`; `npm run build`
- Known gaps: CI is stabilized for the current suite, but future test additions should keep preferring deterministic state transitions over timing-sensitive frame sampling where possible.
- Commit hash: `0287801`

## 2026-03-06 Command Palette and Worker Tasking
- Summary: Reworked the bottom action area into a visibly grouped Command Palette, split actions into Orders, Tasking, Construction, Training, Research, and Age Advancement sections, added explicit worker buttons for Food, Wood, Stone, and Iron assignments, and added Playwright coverage for the new palette flow.
- Tests run: `npm test`; `npm run test:e2e`; `npm run build`
- Known gaps: The command palette is now explicit and clickable, but follow-up work can still add deeper submenus, multi-step production tabs, and richer contextual portraits/icons for each action family.
- Commit hash: `6686f1c`

## 2026-03-06 Building Attack and Target Lock Feedback
- Summary: Fixed combat pathing and range checks so units can reliably attack multi-tile buildings from reachable edge tiles, added explicit attack and gather target-lock highlights in the battlefield renderer, exposed target indicators through the debug surface, and added core plus Playwright coverage for building attack and target feedback.
- Tests run: `npm test`; `npm run test:e2e`; `npm run build`
- Known gaps: Target lock is now explicit once an order lands, but a later UX pass can still add hover previews and more precise sprite-level click affordances for dense overlapping targets.
- Commit hash: `907fe9f`

## 2026-03-07 Battlefield Click Selection and Menu Restore
- Summary: Fixed the battlefield pointer path so live mouse clicks use the same screen-to-world conversion as the reliable drag/debug paths, let clicks pass through the HUD host to the canvas again, and added real click-based Playwright coverage to ensure selecting a worker on the battlefield actually opens the command palette and build menu.
- Tests run: `npm test`; `npm run test:e2e`; `npm run build`
- Known gaps: Live click selection now opens the menu correctly again, but hover previews and richer pre-click affordances are still the next control pass for dense overlapping units and build placement.
- Commit hash: `87fcd4d`

## 2026-03-07 Widescreen HUD and Native Click Path Fix
- Summary: Fixed the real widescreen layout regression that had pushed the HUD and sidebar below the viewport by restoring the live `.hud` root to an absolute overlay and constraining the battlefield shell to viewport height, switched runtime picking to use native canvas-relative mouse coordinates instead of the broken pointer conversion, and hardened the Playwright click-selection regression to verify both the worker command palette and the right sidebar stay visible on a large display.
- Tests run: `npm test`; `npm run test:e2e`; `npm run build`
- Known gaps: Clicking and menu visibility are restored on the tested layouts, but dense overlapping creature clusters still deserve a later pass for hover previews and more forgiving sprite hit affordances.
- Commit hash: `bedcda9`

## 2026-03-07 Canvas Click Accuracy and Dock Height Fix
- Summary: Reworked screen-to-world conversion to use the actual displayed canvas bounds instead of Phaser's abstract display size so battlefield clicks line up with what the player sees, enlarged unit hit ellipses for more forgiving selection around clustered creatures and buildings, and constrained the bottom dock to a fixed viewport slice with internal scrolling so selecting a worker no longer lets the construction palette consume the whole battlefield.
- Tests run: `npm test`; `npm run test:e2e`; `npm run build`
- Known gaps: Click targeting now matches the visible battlefield much more closely on the tested layouts, but there is still room for future polish like hover outlines and tighter sprite-specific pick masks on dense late-game armies.
- Commit hash: `3db3f9b`

## 2026-03-07 Hover Preview and Armed Controls Pass
- Summary: Added live battlefield hover previews for friendly units, enemy targets, resources, and build placement validity; surfaced the current hover state through the debug API for browser regression coverage; marked armed build and command palette buttons with a persistent active state; and hardened the resume regression so the suite waits for the restored snapshot to settle before comparing saved state.
- Tests run: `npm test`; `npm run test:e2e`; `npm run build`
- Known gaps: The battlefield now previews intent before clicks land, but later control polish can still add richer hover art, sprite-level occlusion hints, and more explicit invalid-target messaging for edge cases like blocked rally points.
- Commit hash: `546d017`

## 2026-03-07 Detailed Build Placement Preview Pass
- Summary: Promoted building placement checks into a shared evaluator that reports per-tile blocked reasons, upgraded build ghosts from a single rectangle into tile-by-tile isometric footprint previews with valid/blocked coloring, and extended hover messaging plus browser coverage so blocked placement explains whether the problem is another structure, a resource node, or map bounds.
- Tests run: `npm test`; `npm run test:e2e`; `npm run build`
- Known gaps: Build placement feedback is now much clearer, but dense creature overlap can still benefit from stronger hover silhouettes and more explicit pre-click target emphasis in a future control pass.
- Commit hash: `4fef1ab`

## 2026-03-07 Hover and Click Coherence Pass
- Summary: Added explicit hover action detail for units, buildings, resources, and attack targets; strengthened battlefield hover emphasis so hovered creatures and structures stand out more clearly; and made click selection prefer the currently hovered friendly target so what the player clicks matches what the battlefield is previewing.
- Tests run: `npm test`; `npm run test:e2e`; `npm run build`
- Known gaps: Hover and click targeting are now aligned much more closely, but a later polish pass can still add faction-specific portraits/icons and richer multi-unit formation selection feedback.
- Commit hash: `0009203`

## 2026-03-07 Live Selection Order HUD Pass
- Summary: Stopped the right sidebar from defaulting to the first command card, made it fall back to the selected unit or building's actual current state instead, added live task/target readouts to the selection card, surfaced building activity and rally state more explicitly, and added browser coverage for worker task visibility directly in the HUD.
- Tests run: `npm test`; `npm run test:e2e`; `npm run build`
- Known gaps: Selection status is now much clearer, but later UX work can still add richer group-order summaries, portrait art, and deeper formation-level feedback for larger armies.
- Commit hash: `3ec289b`
