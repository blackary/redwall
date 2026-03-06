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
- Commit hash: pending in git history after commit
