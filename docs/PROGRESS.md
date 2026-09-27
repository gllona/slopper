# Slopper — build progress

Tracks the milestones in [DESIGN.md §24](DESIGN.md#24-build-plan-milestones). Newest notes first inside each milestone.
Status: ✅ done · 🟡 in progress · ⬜ not started · 🔒 waiting for Gorka.

| Milestone | Status | Summary |
|---|---|---|
| M0 — Scaffold | ✅ | TypeScript/ESM, config precedence, zod schemas, utils, CI, licenses, CLAUDE.md |
| M1 — Harness core | ✅ | layout, robot/datacenter/label, riso-duotone, compile, sanitize, render, lint, playground |
| M2 — Harness v1 | ✅ | all 9 components + raw, 3 style cards, animation, reduced motion, flashing check |
| M3 — Site | ✅ | Eleventy site live at https://slopper.logicos.org (Coming soon) + sample preview |
| M4 — Fetch | ✅ | 6 sources, robots.txt-aware HTTP, digest.json, recorded fixtures |
| M5 — AI stages locally | ⬜ | |
| M6 — Automation | ⬜ | needs: GitHub App, secrets, Cloudflare, DNS |
| M7 — Calibration | ⬜ | |
| M8 — Launch | ⬜ | |
| M9 — Evolution | ⬜ | |

## Waiting for Gorka

1. Review M4 (branch `feat/m4-fetch`, not committed yet) and say when to commit.
2. Optional: enable **Cloudflare Web Analytics** (dashboard → Workers & Pages → slopper → Metrics).
3. Cloudflare platform change (DESIGN §13.1, decision 27): confirm before M6 that classic Pages stays supported.

---

## M4 — Fetch ✅

- **Sources changed** (decision 30, Gorka's choice): `robots.txt` disallows Google News RSS, Reddit, and the
  arXiv API. Now: Hacker News (Algolia), Hugging Face (Daily Papers + trending models for recent dates),
  arXiv via `rss.arxiv.org`, **publisher feeds** (MIT Technology Review, Ars Technica, The Verge, Wired,
  TechCrunch, BBC News and Rest of World with an AI keyword filter), GDELT, Techmeme (AI keyword filter).
  Sources whose terms forbid AI use (The Guardian, Al Jazeera) or automated querying (Bing) are excluded.
- **Timing changed** (decision 29): generate at 15:00 UTC; fixed veto deadline 19:00 UTC (`PUBLISH_HOUR_UTC`,
  14:00 for Gorka, UTC-5 all year) plus 60-minute minimum PR age (`VETO_MIN_MINUTES`); `VETO_HOURS` removed.
  Config, `.env.example`, DESIGN §4/§5/§15/§16/§17 updated. Workflows implement it in M6.
- `pipeline/fetch/http.ts`: SlopperBot User-Agent, robots.txt checked per URL (RFC 9309: 4xx = allow,
  5xx/unreachable = disallow, one retry), per-host spacing (GDELT 12 s, arXiv 3 s, others 1 s), per-host
  timeouts, one retry with backoff honoring `Retry-After`, 5 MB cap, error causes in logs.
  `RecordingHttp`/`ReplayHttp` for offline tests; recorded bodies are trimmed so fixtures never contain full
  article text.
- `pipeline/fetch/index.ts`: sources run in parallel; items are cleaned (plain text, control characters removed,
  titles ≤ 300, snippets ≤ 300 chars), kept only inside the UTC day window (per-source slack: arXiv +1 day,
  trending models −14 days), capped per source, and de-duplicated across sources (canonical URL, or title
  word-overlap ≥ 0.75). More than half of the sources failing → `FetchFailedError` (the partial digest is still
  written for debugging) and exit code 1.
- A live run for 2026-09-26 (a Saturday) took 87 s: 46 items, including the week's big AI-safety story. arXiv
  had 0 items because arXiv announces nothing on weekends. 24 new tests (robots, text cleanup, feeds, HTTP
  politeness with a fake `fetch`, the failure rule, a full replayed day).

### Findings

- GDELT answered **429 for hours** after a few probe requests from this IP, needs 13–16 s even for a 404, resets
  connections under load, and rejects short keywords like "AI". It is best-effort now (decision 31); to be
  observed from GitHub runners in M6.
- Some feeds embed full article text (`content:encoded`); the recorder strips it (DESIGN §7: never store it).
- Techmeme covers all of tech, so it gets the AI keyword filter too.
- Not done here (belongs to M5, Curate's input): loading the last 14 days, storylines, ontology, and lessons.

## M3 — Site ✅

- Eleventy 3 (config in TypeScript, run through tsx), Nunjucks templates, one stylesheet, one script
  (`replay.js`). Pages: `/`, `/YYYY/MM/DD/`, `/archive/` (by month), `/about/` (satire notice, license,
  takedown contact, privacy), `/404.html`, `/feed.xml` (Atom), `/sitemap.xml`, `/robots.txt`, `/_redirects`
  (`/today/` → latest, 302), `/_headers`.
- "Published" = tracked by git (`SLOPPER_SITE_MODE=build`); `dev` shows untracked folders with a Draft badge;
  `all` is for fixture previews. Only `slopper.svg`, `still.png`, `og.png` are deployed.
- SEO: title, description, canonical, Open Graph + Twitter card (`og.png`), `image_src` (`still.png`),
  JSON-LD `CreativeWork` with license. Sources in `<details>` (in the HTML for crawlers).
- Reduced motion: `<picture>` serves `still.png`; the Replay button is hidden then. Replay reloads the
  `<img>` with a new URL fragment: the animation restarts with no new download.
- Light/dark themes, self-hosted fonts (Bricolage Grotesque 800, Atkinson Hyperlegible Next 400/700,
  latin + latin-ext), responsive down to 390 px (checked with screenshots).
- CI now also builds the site (published only) and the fixture preview.

### Custom domain (2026-09-27)

- Gorka added the CNAME at freedns; the domain was attached via the Cloudflare API (`POST
  /accounts/:id/pages/projects/slopper/domains`, using the local wrangler login; wrangler has no command for it).
  Validation + certificate (Google Trust Services, auto-renewed) took ~90 s.
- First production deployment (`--branch main`): the real build, i.e. the "Coming soon" page.
- Fixes found while testing the live domain: `/today/` returned 404 with an empty archive (now → `/`); the
  `pages.dev` copy was indexable (now `X-Robots-Tag: noindex`); HSTS enabled (`max-age=300`); feed served as
  `application/atom+xml`. A comment inside a `_headers` rule could be read as a header, so comments sit above rules.
- Verified: HTTP→HTTPS 301, headers, redirects, and a clean browser load on `https://slopper.logicos.org`.

### Deployed and verified (preview)

- Classic Pages project `slopper` created (`slopper-coh.pages.dev`) and deployed with
  `wrangler pages deploy dist --branch preview`.
- `curl` checks: HTML CSP as designed; `slopper.svg` has its own locked-down CSP and `image/svg+xml`;
  media `immutable` 1 year; dated pages 1 hour; `/`, archive, feed 5 minutes; assets 1 day; `/today/` → 302;
  unknown paths → our 404. The `! Header` detach rules work: each response has a single CSP and Cache-Control.
- A browser on the live preview showed no CSP violations, no failed requests, and all fonts loaded.
- Preview URLs get `x-robots-tag: noindex` from Cloudflare automatically.

### Findings

- **PNG size**: the paper grain is random noise, so `still.png` was ~2 MB. Now a 216 px tiled texture posterized
  to 3 alpha levels, plus 256-color palette PNGs (sharp): stills ~110–165 KB, og ~220 KB, filmstrips ~200 KB,
  looking practically the same (decision 25).
- **Cloudflare**: `wrangler pages project create` now delegates to Workers and failed without a Worker entry
  point; `--force` created a classic Pages project (decision 27). The default hostname is `slopper-coh.pages.dev`,
  so the freedns CNAME target is that name.
- Nunjucks reads Markdown heading anchors like `{#license}` as comments: use HTML headings with ids.

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
