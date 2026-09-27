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
- Site: `npm run dev` (real archive, drafts badged), `npm run preview:fixtures && npm run preview:dev` (sample
  sloppers), `npm run build` (published only → `dist/`). Keep templates CSP-clean: no inline styles or scripts.
- Fetch: `npm run fetch -- --date YYYY-MM-DD [--out file]`; `--replay tests/fixtures/fetch/<date>` works offline.
  Never add a source without checking its robots.txt *and* its terms for AI-use restrictions (DESIGN §7).
- Day pipeline: `npm run day -- --date YYYY-MM-DD --replay tests/fixtures/fetch/2026-09-26 --out .out/live`
  uses the real Claude (subscription usage!). For code changes, test with
  `SLOPPER_CLAUDE_BIN=tests/fixtures/fake-claude.mjs` first. AI calls go only through `pipeline/claude.ts`.
- Workflows: pin actions to SHAs; lint with actionlint + shellcheck. Setup steps for Gorka: `docs/SETUP.md`.
- Stage JSON schemas must not use tuples (the Claude CLI and API disagree on tuple syntax).
- Tests: Vitest, under `tests/`. Harness tests launch Playwright Chromium.
- Preview deploy: `npm run deploy:preview` (Cloudflare Pages project `slopper`, branch `preview`). Never deploy
  the `main` branch by hand.

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
