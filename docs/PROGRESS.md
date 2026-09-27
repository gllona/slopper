# Slopper — build progress

Tracks the milestones in [DESIGN.md §24](DESIGN.md#24-build-plan-milestones). Newest notes first inside each milestone.
Status: ✅ done · 🟡 in progress · ⬜ not started · 🔒 waiting for Gorka.

| Milestone | Status | Summary |
|---|---|---|
| M0 — Scaffold | ✅ | TypeScript/ESM, config precedence, zod schemas, utils, CI, licenses, CLAUDE.md |
| M1 — Harness core | ✅ | layout, robot/datacenter/label, riso-duotone, compile, sanitize, render, lint, playground |
| M2 — Harness v1 | ✅ | all 9 components + raw, 3 style cards, animation, reduced motion, flashing check |
| M3 — Site | ⬜ | next |
| M4 — Fetch | ⬜ | |
| M5 — AI stages locally | ⬜ | |
| M6 — Automation | ⬜ | needs: GitHub App, secrets, Cloudflare, DNS |
| M7 — Calibration | ⬜ | |
| M8 — Launch | ⬜ | |
| M9 — Evolution | ⬜ | |

## Waiting for Gorka

1. Nothing committed yet: the repo is `git init`-ed with remote `origin = github.com/gllona/slopper`. Tell me
   when you want a first commit/push (and which git author name to use).

---

## M2 — Harness v1 ✅

- 2026-09-26: Gorka reviewed the fixture renders and approved the art direction (fonts + palettes).
- Playground now opens the default browser (`xdg-open`/`open`/`start`), with `--port`, `--host`, `--no-open`,
  and readable errors for a missing file or a busy port. Before, it only printed the URL.

- Components: `robot`, `human`, `cloud`, `datacenter`, `chart`, `speech-bubble`, `sun` (also moon), `label`,
  `meter`, plus the `raw` escape hatch. Shared mood faces (happy, neutral, worried, exhausted, proud, surprised, sad).
- Style cards: `riso-duotone` (multiply overprint + grain), `paper-cutout` (no outlines, soft shadows, torn-paper
  horizon), `blueprint` (grid, outlines, mono labels). Components draw with **roles** (`r-body`, `r-line`, …);
  cards map roles to palette tokens, so every component works in every style.
- Animation (`harness/animate.ts`): 20 generic actions (walk-in, pop, faint, shake, move, set, …) + component
  actions (`wave`, chart `draw`). Each channel (translate/rotate/scale/opacity/draw) compiles to its own linear
  keyframes, with easing sampled in JS. **Static CSS = final frame**, so reduced motion and the still always show
  the punchline. One optional ambient loop (blink/pulse/sway).
- Lint: flashing check (4×4 regions, 100 ms sampling, >3 flashes/s fails), blank-frame check, safe-area and
  cut-off checks from the *rendered* final frame.
- `docs/HARNESS.md` is generated from code (`npm run harness:docs`); a test fails if it is stale. The Art prompt
  will reuse it in M5.

### Findings worth remembering

- **opentype.js `toPathData()` emits `NaN`** for some glyph coordinates, and browsers stop drawing a path at the
  first invalid command ("GPU cooling" rendered as "GPU c"). The harness serializes glyph commands itself.
- **SVGO `convertPathData` corrupted multi-subpath glyph outlines**; it is disabled (paths are already rounded).
- **Reduced motion inside `<img>`**: the SVG's `@media (prefers-reduced-motion)` works inline, but Playwright's
  emulation does not reach SVG documents loaded through `<img>`, so it can't be verified there. For M3 the day
  page will use `<picture><source srcset="still.png" media="(prefers-reduced-motion: reduce)"><img src="slopper.svg"></picture>`
  (no JS needed).
- Playwright 1.63 needs Chromium build 1243; `npx playwright install chromium` replaced the older 1223 build
  (the `dev-chrome` helper picks up 1243 automatically).
- Text in the art is converted to paths at compile time (SVGs in `<img>` cannot load fonts), so renders are
  identical everywhere and lint counts words from the scene.

## M1 — Harness core ✅

- `harness/compile.ts`: scene → SVG. Validates structure (zod), each component's props (strict), beats, and raw
  fragments, and reports **all** problems at once as actionable messages for the Art stage.
- `harness/sanitize.ts`: allowlist sanitizer (elements, attributes, CSS) on SVGO's parser; reports every removal.
  28 malicious-SVG cases (scripts, event handlers, foreignObject, external/`javascript:`/`data:` refs, SMIL,
  `@import`, CSS escapes, entity expansion, external entities, …).
- `harness/render.ts`: Playwright renders `still.png`, `filmstrip.png` (6 frames, 3×2, timestamps), `og.png`
  (1200×630). `SLOPPER_CDP_URL` lets it use an existing Chrome instead.
- `harness/lint.ts`, `harness/cli.ts` (`npm run harness:render`, `npm run harness:fixtures`),
  `harness/playground.ts` (`npm run harness:watch`, live reload).

## M0 — Scaffold ✅

- Node 24, TypeScript 7 (`tsc --noEmit` only; code runs with `tsx`), Vitest, ESM.
- `pipeline/util/config.ts`: CLI > env (`VETO_MODE`, `DRY_RUN`, …, or `SLOPPER_<TUNABLE>`) > `slopper.config.json` > defaults.
- Schemas: digest, day, scene, critic, cop, storylines, config. `day.json` has no `published` field and
  `number = days since LAUNCH_DATE + 1` (decisions 19–20).
- `.github/workflows/ci.yml` (pinned SHAs, `contents: read`), Dependabot, MIT + CC BY 4.0 licenses.

### Deviations from DESIGN §14 (tree)

- Extra harness files: `cli.ts`, `index.ts`, `style.ts`, `fonts.ts`, `background.ts`, `docs.ts`, `fonts/`
  (art fonts + OFL licenses), `components/{types,face,meter,raw}.ts`.
- `harness/fixtures/` holds hand-written scenes; renders go to `.out/` (git-ignored).
- `vitest.config.ts` at the root.
