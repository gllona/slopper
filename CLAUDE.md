# Slopper — rules for Claude Code development sessions

**Read [`docs/DESIGN.md`](docs/DESIGN.md) first.** It is the single source of truth. If something is
missing or ambiguous there, ask Gorka and propose an update to it. Track progress in
[`docs/PROGRESS.md`](docs/PROGRESS.md). All documentation lives in `./docs/`.

## Stack and commands

- Node 24 (see `.nvmrc`), TypeScript run directly with `tsx` (no build step), ESM only.
- `npm run check` = typecheck + tests. Run it before saying something works.
- `npm run harness:render -- harness/fixtures/<scene>.json` renders a scene to `.out/<name>/`;
  `npm run harness:fixtures` renders all fixtures + `.out/contact-sheet.png`. Look at the PNGs.
- After changing components, actions, anchors, or style cards: `npm run harness:docs` (a test checks it).
- Tests: Vitest, under `tests/`. Harness tests launch Playwright Chromium.

## Rules

- **All dates are UTC** (`pipeline/util/dates.ts`). Never use local time.
- **Schemas are contracts** (`pipeline/schemas/`). Validate every stage output with zod.
- **Art is declarative.** `scene.json` is data, never code. Components use style tokens, never literal colors.
- **Every SVG passes `harness/sanitize.ts`.** Never weaken the allowlist without a malicious-SVG test.
- **AI stages are read-only** (DESIGN §19.2): no Bash/Write/Edit/Web tools in `claude -p` calls.
- **No real names, brands, or likenesses** in mottos, phrases, or art.
- Plain international English in all user-facing text: no idioms, puns, or slang.
- Do not pin a Claude model. Do not commit, push, or deploy unless Gorka asks.
- Pin GitHub Actions to full commit SHAs; set explicit `permissions:` per job.
