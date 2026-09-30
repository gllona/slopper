# Slopper — Design Document

> **For Claude Code:** This document is the single source of truth for the Slopper project. It captures the goals, the reasoning, and every decision made during the design conversation with the project owner (Gorka). Read it fully before writing code. When something here conflicts with your own defaults, follow this document. When something is missing or ambiguous, ask Gorka instead of guessing, and propose an update to this file.

---

## Table of contents

1. [What Slopper is](#1-what-slopper-is)
2. [Goals, principles, and non-goals](#2-goals-principles-and-non-goals)
3. [Glossary](#3-glossary)
4. [Architecture overview](#4-architecture-overview)
5. [The daily pipeline](#5-the-daily-pipeline)
6. [Understanding the state of AI: ontology, relevance, storylines](#6-understanding-the-state-of-ai-ontology-relevance-storylines)
7. [Sources (v1)](#7-sources-v1)
8. [Writing: motto, phrase, and voice](#8-writing-motto-phrase-and-voice)
9. [The art-as-code harness](#9-the-art-as-code-harness)
10. [The Critic](#10-the-critic)
11. [The Cop](#11-the-cop)
12. [The static site](#12-the-static-site)
13. [Hosting and DNS](#13-hosting-and-dns)
14. [Repository tree](#14-repository-tree)
15. [Configuration](#15-configuration)
16. [GitHub Actions workflows](#16-github-actions-workflows)
17. [GitHub Operations (Gorka's daily routine)](#17-github-operations-gorkas-daily-routine)
18. [Local development](#18-local-development)
19. [Security model](#19-security-model)
20. [Failure handling](#20-failure-handling)
21. [Feedback and evolution](#21-feedback-and-evolution)
22. [Versioning](#22-versioning)
23. [Licensing and legal pages](#23-licensing-and-legal-pages)
24. [Build plan (milestones)](#24-build-plan-milestones)
25. [Open items](#25-open-items)
26. [Decision log](#26-decision-log)
27. [Appendix A — Voice candidates (reviewed)](#appendix-a--voice-candidates-reviewed)

---

## 1. What Slopper is

**Slopper** is a website at **https://slopper.logicos.org** that publishes, once per day, a small piece of art that reflects the current state of Artificial Intelligence in the world. Think of it as Google Doodles, but about AI, and made by AI.

Each daily piece is called **a slopper**. A slopper is:

- a **square image or short animation** (art-as-code: SVG, rendered to PNG for sharing);
- a **motto**: a short, title-like tag for the day;
- a **phrase**: a funny and insightful caption about the state of AI that day;
- a hidden-by-default list of **relevant sources** that the slopper is based on.

The name is self-aware: this project is, by definition, "AI slop". We do **not** expect fine art in the traditional sense. A good slopper is valued because it is **meaningful, communicative, pertinent, timely, and original**. At the same time, a visitor's first reaction must never be "Ugghhhhh". A minimum level of aesthetic quality is a hard requirement.

The quality bar and spirit are similar to Simon Willison's "pelican riding a bicycle" test: a language model producing drawings through code, where the charm is in the attempt and the idea, and where quality visibly improves over time.

**"State of AI" is broad.** It is not only technical news (models, benchmarks, releases). It includes users, society, the planet, education, youth, employment, the economy, politics, governments, law, culture — every aspect of human culture and resources that AI touches.

**Stories can last several days.** A slopper can continue a trend from previous days. If a day has no relevant news, that day's slopper relates to yesterday's instead of inventing importance.

---

## 2. Goals, principles, and non-goals

### Goals

1. Publish one slopper per UTC day, automatically, with optional human veto.
2. **Zero variable cost.** All AI work runs on Gorka's **Claude Max 5x subscription** via Claude Code in headless mode. Hosting is free (Cloudflare Pages). CI is free (GitHub Actions on a public repo). OpenRouter credits are *not* used in the daily loop (see §9.9).
3. **Fully static, serverless site.** No backend server, no database, no request-time code. Visitors receive only files.
4. **Meaningful, dated URLs** for every slopper (e.g. `/2026/09/27/`).
5. **Indexable.** Robots may crawl and index everything.
6. **Shareable.** Square art, open license (CC BY 4.0), good social previews.
7. **Improves over time**, with Gorka's feedback, through files in the repo (style guide, lessons, component library, rubrics).
8. **Legally careful.** A dedicated "Cop" stage prevents publishing content that could expose Gorka to legal action.
9. **Runnable locally** on Gorka's machine, end to end, in dry-run mode.

### Principles

- **Deterministic code around creative AI.** Scripts do fetching, rendering, linting, building, and deploying. Claude does reading, judging, writing, and designing. Claude never scrapes, never deploys, never pushes.
- **Least privilege.** AI stages cannot write to the repo, cannot access the network beyond the Claude API, and never hold deployment secrets.
- **Constrained creativity beats free-form.** Style cards, a component library, a fixed artboard, and rubrics make results look intentional.
- **Everything is traceable.** Every slopper keeps its source digest, brief, scene, critic scores, and Cop verdict in the repo.
- **Fail closed.** When in doubt (Cop flag, pipeline error), do not publish. Yesterday's slopper staying up is always acceptable.
- **Plain English.** The site is English-only, written for an international audience, including non-native speakers.

### Non-goals (v1)

- No user accounts, comments, likes, or any dynamic features.
- No raster image-generation models (diffusion, etc.) in the daily loop.
- No automatic posting to social media (possible later).
- No multilingual site.
- No per-trend pages (planned for later; the data model supports them from day one).

---

## 3. Glossary

| Term | Meaning |
|---|---|
| **Slopper** | One day's publication: slop-art + motto + phrase + sources. Also the project name. |
| **Slop-art** | What visitors are told the images are: AI-made pictures and animations, not art (decision 42). |
| **Slopper number** | `days since LAUNCH_DATE + 1`, fixed at generation time and stored in `day.json`. Gaps (skipped or taken-down days) never renumber later sloppers. |
| **Slopper date** | The UTC day the slopper is *about* (the previous UTC day relative to generation time). |
| **Digest** | Deterministic JSON bundle of fetched items from all sources for a date. |
| **Dimension** | One axis of the ontology (e.g. "labor", "planet"). |
| **Storyline** | A news thread that can span several days, tracked in `knowledge/storylines.json`. |
| **Fresh day** | A day with enough relevant news to deserve its own slopper. |
| **Continuation day** | A quiet day; the slopper continues or references yesterday's. |
| **Motto** | 2–5 word title-like tag for the day. |
| **Phrase** | The joke/caption, 1–2 sentences, max 30 words. |
| **Brief** | Structured creative plan produced from the digest. |
| **Scene** | Declarative JSON description of the art, compiled by the harness. |
| **Harness** | Our art-as-code toolkit: compile, render, lint, sanitize. |
| **Style card** | A YAML definition of a visual style (palette, strokes, texture, typography). |
| **Component** | A reusable, parameterized drawing (robot, datacenter, cloud…) in the harness library. |
| **Filmstrip** | A contact sheet of frames sampled across an animation, used by the Critic. |
| **Critic** | AI stage that judges art quality against a rubric. |
| **Cop** | AI stage that judges legal risk against a rubric. |
| **Veto window** | Time between PR creation and automatic publishing, during which Gorka can block. |

---

## 4. Architecture overview

```
                        ┌──────────────────────── GitHub (public repo) ────────────────────────┐
                        │                                                                        │
  15:00 UTC cron ──────►│  generate.yml                                                          │
                        │   ┌────────┐   ┌─────────────────────────────────┐   ┌─────────────┐  │
                        │   │ fetch  │──►│ create                          │──►│ open-pr     │  │
                        │   │ (no AI)│   │ curate → art ⟲ critic → cop     │   │ (no AI)     │  │
                        │   └────────┘   │ (AI, read-only repo)            │   │ commit + PR │  │
                        │                └─────────────────────────────────┘   └──────┬──────┘  │
                        │                                                              │         │
                        │                        PR "Slopper #N — date — motto"  ◄──────┘         │
                        │                        (Gorka may veto / approve)                       │
                        │                                                                        │
  hourly cron ─────────►│  publish.yml: eligible PR? (≥ 19:00 UTC) → merge → build → deploy       │
                        └──────────────────────────────────────────────────┬─────────────────────┘
                                                                           │ wrangler pages deploy
                                                                           ▼
                                                        Cloudflare Pages (project "slopper")
                                                                           ▲
                                               CNAME slopper.logicos.org ──┘  (DNS at freedns.afraid.org)
```

**Components:**

- **GitHub repository (public):** source code, knowledge files, and the full archive of sloppers. Public so GitHub Actions minutes are free.
- **GitHub Actions:** runs the daily pipeline (with Claude Code headless using Gorka's Max subscription OAuth token), the publisher, CI, and the weekly lessons job.
- **Claude Code (headless, `claude -p`):** the only AI. Uses Claude Code's **default model** (do not pin models).
- **Cloudflare Pages:** hosts the static site for free, with global CDN.
- **freedns.afraid.org:** hosts DNS for `logicos.org`. One manual CNAME record, set once.

There is **no backend server**. The previously considered Ubuntu/nginx server is out of the design.

---

## 5. The daily pipeline

Generation starts at **11:07 UTC** (with backups at 13:07 and 15:07) and produces the slopper for the **previous UTC day** (the "slopper date"). All dates are UTC, always.

**Daily timeline** (Gorka's local time is UTC-5 all year, no daylight saving, so these never drift):

| UTC | Gorka (UTC-5) | What happens |
|---|---|---|
| 11:07 | 06:07 | `generate.yml` first try (fetch → create → open PR); backups at 13:07 and 15:07 UTC run only if no PR exists yet for the date (GitHub cron can start hours late) |
| ~11:20 (or later) | ~06:20 | PR `Slopper #N — date — motto` appears; Telegram + GitHub Mobile notify Gorka |
| 17:00 | 12:00 | Gorka reviews |
| **19:00** | **14:00** | **Veto deadline** (`PUBLISH_HOUR_UTC`); the next hourly `publish.yml` run (at :05) publishes eligible PRs |

The slopper date stays the previous **UTC** day. Generating at 15:00 UTC (not right after midnight) also lets late-reported news of that day appear in the sources.

The orchestrator is `pipeline/run.ts`. It calls stages in order, validates every stage output against a schema (zod), and writes results to `sloppers/YYYY/MM/DD/`.

### Stage 1 — Fetch (deterministic, no AI)

- Fetch all sources (§7) for the time window `[date 00:00 UTC, date+1 00:00 UTC)`.
- Normalize items to a common shape: `{ id, source, url, title, snippet, publishedAt, score?, lang }`.
- Deduplicate by canonical URL and near-duplicate titles.
- Cap items per source (config), truncate snippets (max ~300 characters).
- Write `digest.json`.
- Also load: the last 14 days of `day.json`, `knowledge/storylines.json`, `knowledge/ontology.yaml`, `knowledge/LESSONS.md`.

### Stage 2 — Curate (AI)

Input: digest, recent days, storylines, ontology, voice guide, lessons.
Output: `day.json` draft containing:

1. **Dimension scores** for the day (see §6).
2. **Top stories**, each scored for relevance and linked to digest item IDs.
3. **Storyline updates**: which storylines continue, which are new, which cool down.
4. **Day mode decision**: `fresh` or `continuation` (see §6.3). This is step 2 of the original process: *if there is not enough relevant news, the previous day is used as the "current day"*.
5. **Motto** (§8).
6. **Phrase** (§8), with 3 alternative candidates kept in the record.
7. **Creative brief**: concept (1 sentence), visual metaphor, cast (archetypes only), chosen style card, composition notes, art type (`static` or `animated`), story beats if animated, alt text.
8. **Sources**: the digest item IDs that support any factual element of the phrase or art (the "relevant sources" section).

### Stage 3 — Art loop (AI + harness)

Up to `maxArtIterations` (default **3**):

1. **Art (AI):** from the brief (plus previous critique, if any), write `scene.json` using the harness vocabulary (§9).
2. **Compile (harness):** `scene.json` → `slopper.svg`.
3. **Sanitize (harness):** strip anything unsafe (§9.7).
4. **Render (harness, Playwright):** `still.png` (final frame), `filmstrip.png` (if animated).
5. **Lint (harness, deterministic):** hard failures skip the Critic and go straight back to Art with the lint report.
6. **Critic (AI, fresh context):** scores against the rubric (§10). Pass → exit loop. Fail → notes go back to Art.

If no iteration passes, keep the best-scoring one, mark `critic.passed = false`, and continue. The PR will be labeled `critic-fail` and **never auto-published**.

### Stage 4 — Cop (AI, fresh context)

Runs in the same GitHub Actions job as Curate and the art loop (see §16.1), but as a separate Claude invocation with a fresh context.

Legal-risk review of the phrase, motto, alt text, stills, SVG source text, and sources (§11). Verdicts:

- `pass` → continue.
- `revise` → one retry (`copRetries`, default **1**): the relevant stage (curate or art) regenerates with the Cop's notes, then Cop reviews again.
- `hold` (or `revise` twice) → PR labeled `cop-hold`, never auto-published.

### Stage 5 — Package and open PR (deterministic)

- Generate `og.png` (1200×630): the square art on a branded background with the motto and phrase beside it.
- Write final `day.json`, `critic.json`, `cop.json`.
- Commit everything to branch `slopper/YYYY-MM-DD` and open a PR titled `Slopper #N — YYYY-MM-DD — <motto>`.
- The PR body shows the still image, the phrase, the mode, critic scores, the Cop verdict, and the sources.

### Stage 6 — Publish (deterministic, separate workflow)

Depending on `VETO_MODE` (§15), the publisher merges the PR, builds the full site, deploys to Cloudflare Pages, and tags the commit.

### Mapping to the original process

| Original step | Where it happens |
|---|---|
| 1. Gather the state of AI for the previous day | Stage 1 Fetch |
| 2. Decide if there are enough relevant news | Stage 2 Curate (`mode`) |
| 3. Motto | Stage 2 Curate |
| 4. Funny and insightful phrase | Stage 2 Curate |
| 5. Art style | Stage 2 Curate (style card choice) |
| 6. Art description | Stage 2 Curate (brief) |
| 7. Art type (still / animation) | Stage 2 Curate (brief) |
| 8. Generate the art | Stage 3 Art + harness |
| 9. Validate quality, iterate | Stage 3 Critic loop (+ Stage 4 Cop for legal) |
| 10. Build the static page | Stage 6 Publish (site build) |
| 11. Publish | Stage 6 Publish (Cloudflare Pages) |

---

## 6. Understanding the state of AI: ontology, relevance, storylines

### 6.1 Ontology (`knowledge/ontology.yaml`)

The ontology keeps the project from becoming "model release of the day". Every top story is classified into one or more **dimensions**:

| ID | Dimension | Examples |
|---|---|---|
| `capabilities` | Capabilities and models | new models, benchmarks, open weights, agents |
| `industry` | Industry, money, compute | funding, stock moves, chips, datacenters, deals |
| `labor` | Labor and employment | layoffs, new jobs, automation, unions |
| `policy` | Policy, governance, geopolitics | laws, regulation, export controls, government use |
| `law` | Law and intellectual property | lawsuits, copyright, licensing |
| `safety` | Safety and security | incidents, jailbreaks, deepfakes, cyberattacks, misuse |
| `society` | Society and culture | slop, relationships, trust, art, media, religion |
| `education` | Education and youth | schools, students, cheating, learning, children |
| `planet` | Planet and resources | energy, water, emissions, minerals |
| `science` | Science and health | research breakthroughs, medicine, biology |

Plus two **mood axes**, scored per day from -2 to +2:

- `hype_doom`: from strong doom (-2) to strong hype (+2);
- `calm_frantic`: from calm (-2) to frantic (+2).

The ontology file is versioned and may evolve (new dimensions, better descriptions, examples). Changes go through a normal PR reviewed by Gorka.

### 6.2 Relevance scoring

Each top story is scored 0–3 on:

- **novelty** — is this genuinely new, or a repeat?
- **magnitude** — how big is the effect?
- **breadth** — how many people or dimensions does it touch?

`relevance = novelty × magnitude × breadth` (0–27). The day's relevance is the maximum story relevance.

### 6.3 Fresh vs continuation days

- If day relevance ≥ `relevanceThreshold` (config, initial value **8**) → `fresh`.
- Otherwise → `continuation`: the slopper references yesterday's (same cast, a follow-up moment, a callback). Quiet days are an opportunity for humor ("Nothing happened. The robot is still waiting.").
- A continuation day still gets its own date, number, motto, phrase, and art.
- Never more than `maxContinuationDays` (default **3**) in a row; after that, the most relevant available story becomes fresh regardless of threshold.

### 6.4 Topic balance rule

To avoid a tech-only feed: if the same dimension was the primary dimension for 3 days in a row, the relevance threshold for stories in *other* dimensions is lowered by `balanceBonus` (default **3**) for the next day.

### 6.5 Storylines (`knowledge/storylines.json`)

```json
{
  "version": 1,
  "storylines": [
    {
      "id": "datacenter-water",
      "title": "Datacenters and water use",
      "dimensions": ["planet", "industry"],
      "firstSeen": "2026-09-24",
      "lastSeen": "2026-09-27",
      "daysActive": 4,
      "heat": 0.8,
      "status": "active",
      "sloppers": ["2026-09-24", "2026-09-27"],
      "motifs": ["the thirsty datacenter", "the water meter"]
    }
  ]
}
```

- Curate matches new stories to existing storylines before creating new ones.
- `heat` decays each day a storyline is not seen (config `heatDecay`, default 0.7×). Below 0.1 → `status: "dormant"`.
- `motifs` let recurring visual elements evolve across days ("Day 4 of the datacenter-water saga").
- The file is updated only through the daily PR (so Gorka sees changes).

---

## 7. Sources (v1)

All sources must be **free** and accessible without paid API keys. Each source is one module in `pipeline/fetch/sources/`.

| Source | Access | Covers |
|---|---|---|
| Hacker News | Algolia HN Search API (AI-related queries, by date, with points) | developer pulse |
| Hugging Face | Daily Papers API (by date) + trending models API | open models, research |
| arXiv | `rss.arxiv.org` feed for cs.AI, cs.CL, cs.LG, cs.CY (latest announcement) | research, society-related research |
| Publisher feeds | Configurable list of AI-section RSS/Atom feeds (e.g. MIT Technology Review, Ars Technica, The Verge, BBC Technology, Wired, TechCrunch, Rest of World); general feeds are filtered by AI keywords | broad news: jobs, schools, energy, law, government |
| GDELT | DOC 2.0 API, one query per dimension group | global, multilingual, society/policy |
| Techmeme | RSS | curated tech/industry |

Rules:

- Respect each source's terms, rate limits, and `robots.txt`. Use a clear User-Agent: `SlopperBot/1.0 (+https://slopper.logicos.org/about/)`. The fetcher checks `robots.txt` for every URL before requesting it (product token `SlopperBot`, falling back to `*`), and skips disallowed URLs.
- **Do not use sources whose terms forbid AI/LLM use of their content**, even when `robots.txt` allows the URL (we pass titles and snippets to Claude). Examples excluded for this reason (2026-09): The Guardian, Al Jazeera. Bing News RSS is excluded because Microsoft's terms forbid automated querying outside the paid API.
- Excluded because `robots.txt` disallows them (checked 2026-09-26): **Google News RSS** (`/rss/` disallowed for all agents), **Reddit** (`Disallow: /`), and the **arXiv API** at `export.arxiv.org` (`Disallow: /`; `rss.arxiv.org` is used instead).
- Rate limits: GDELT at most one request every 5 seconds (it answers 429 otherwise); arXiv at most one every 3 seconds; other hosts one per second. 429/5xx responses are retried with backoff (respecting `Retry-After`).
- Store only titles, URLs, short snippets, dates, and scores. Never store full article text.
- A failing source must not fail the pipeline; log a warning. If **more than half** of sources fail (4 or more of 6), the pipeline stops (see §20).
- Feed lists and queries (HN, GDELT, publisher feeds) are defined in config so they can be tuned without code changes.

---

## 8. Writing: motto, phrase, and voice

### 8.1 Motto

- 2–5 words, title case, no punctuation at the end.
- A tag for the day, not a joke by itself. Examples of shape: "Benchmark Season", "The Thirsty Cloud", "Quiet Day".

### 8.2 Phrase

- 1–2 sentences, maximum **30 words**.
- The joke and the insight. It should make sense together with the art, but must also work alone (it is shown as HTML text and in social previews).

### 8.3 Voice guide (`knowledge/voice.md`)

**Audience:** international, many non-native English speakers.

Do:

- Use plain, clear English (roughly CEFR B2 level).
- Use humor from **irony, understatement, contrast, absurd juxtaposition, and literal descriptions** of strange situations.
- Point at **trends, institutions, and situations**, not at individuals.
- Keep a friendly, observational tone. The reader should smile and think.

Do not:

- **No puns, wordplay, or idioms** that only native speakers understand (no "break a leg", no double meanings, no rhymes-as-joke).
- No culture-specific references (TV shows, sports, local politics of one country) that need insider knowledge.
- No internet slang or memes ("main character", "touch grass", etc.).
- **No names of real people**, in the phrase, motto, or art. Companies and products are not named either; use descriptions ("a big lab", "a new model"). Names appear only in the sources section.
- No mocking of groups of people, no punching down, no cruelty.
- No factual claims that are not supported by the day's sources.

The voice guide contains **approved examples** (good) and **rejected examples** (bad) as few-shot anchors. The initial examples, reviewed by Gorka, are in [Appendix A](#appendix-a--voice-candidates-reviewed): 18 approved, 2 denied.

---

## 9. The art-as-code harness

### 9.1 Why a harness

A language model writing raw SVG must invent the idea **and** place every coordinate by hand, blindly, in one pass. The harness separates these jobs: Claude focuses on **meaning and composition**, and code handles **geometry, timing, style consistency, and safety**. It starts minimal and grows by accretion.

### 9.2 The artboard

- **Square, 1080×1080** (`viewBox="0 0 1080 1080"`). Chosen for easy sharing on social networks.
- **Safe area:** 60 px margin on all sides; important content stays inside.
- **Layout anchors** instead of pixel math: a 3×3 grid (`top-left`, `center`, `bottom-right`, …), thirds (`left-third`, `right-third`), `ground` line, `sky`.
- Maximum **6 words** of text inside the art (labels only; the joke lives in the phrase).

### 9.3 Scene format (`scene.json`)

Scenes are **declarative JSON**, validated by a schema. Scenes are never executable code (security, see §19).

```json
{
  "harness": "0.1",
  "style": "riso-duotone",
  "background": { "type": "sky-ground", "horizon": 0.72 },
  "elements": [
    { "id": "bot", "component": "robot", "at": "left-third", "scale": 1.0,
      "props": { "mood": "exhausted" } },
    { "id": "dc", "component": "datacenter", "at": "right-third", "scale": 1.4 },
    { "id": "water", "component": "meter", "attachTo": "dc", "props": { "level": 0.2 } },
    { "id": "tag", "component": "label", "at": "top-center", "props": { "text": "Day 4" } }
  ],
  "animation": {
    "durationSec": 6,
    "beats": [
      { "t": 0.0, "target": "bot", "action": "walk-in", "from": "left" },
      { "t": 1.5, "target": "water", "action": "set", "props": { "level": 0.95 }, "ease": "ease-in" },
      { "t": 3.0, "target": "bot", "action": "faint" }
    ],
    "holdSec": 2
  },
  "alt": "A tired robot walks toward a huge datacenter whose water meter fills up; the robot faints."
}
```

- `animation` is omitted for static sloppers.
- Unknown components, props, actions, or anchors are schema errors (fed back to Art).
- **Escape hatch:** an element may use `"component": "raw"` with an `svg` string for one-off shapes. Raw SVG is sanitized and size-limited (config `rawSvgMaxBytes`, default 8 KB per element, max 3 raw elements per scene).

### 9.4 Components (`harness/components/`)

Each component is a TypeScript function: `(props, style, box) → SVG group`. Components use only style tokens (no hard-coded colors).

**v1 library (8):** `robot`, `human` (generic silhouette, never a real likeness), `cloud`, `datacenter` (server racks), `chart` (line/bar, simple), `speech-bubble`, `sun`, `label`. Plus `meter` if needed by early scenes.

Each component supports a small set of props (e.g. `robot.mood: happy | neutral | worried | exhausted | proud`) and animation actions (e.g. `walk-in`, `bounce`, `faint`, `wave`, `grow`, `fade-in`, `set`).

**Growth by accretion:** when a raw element is used and turns out well, the weekly lessons job (or Gorka) may propose promoting it into a real component. Component code changes are code: they go through a normal PR reviewed by Gorka (label `component-proposal`). Proposed components live in `harness/components/_proposed/` until approved.

### 9.5 Style cards (`harness/styles/*.yaml`)

A style card defines: palette tokens (`bg`, `ink`, `accent1`, `accent2`, max 5 colors), stroke width and linecap, fill rules, texture (optional SVG filter or pattern), corner rounding, typography for labels (self-hosted font family), and "mood words" that guide Claude.

**v1 cards (3):** `riso-duotone` (two-color risograph print), `paper-cutout` (flat layered paper with soft shadows), `blueprint` (white lines on blue, technical).

Later candidates: linocut, isometric, 8-bit pixel, flat mid-century, chalkboard. Claude may propose new style cards in the lessons PR; Gorka approves.

Curate chooses the card; novelty rules (§10) discourage using the same card on consecutive days.

### 9.6 Animation rules

Animations must **make sense to visitors**:

- **Story beats:** setup → action → punchline → hold. Total duration **3–9 seconds** (config).
- **Plays once**, then rests on the final frame. The site offers a small replay button. No endless loops (except subtle ambient motion like a blinking light, max 1 element).
- **The final frame must tell the joke alone.** It is also `still.png`, the base of `og.png`, and what `prefers-reduced-motion` users see.
- Implemented with **CSS keyframes inside the SVG** (`animation-fill-mode: forwards`), generated by `harness/animate.ts` from beats. No SMIL, no scripts.
- `@media (prefers-reduced-motion: reduce)` inside the SVG disables animation and shows the final state.
- **No flashing** more than 3 times per second (WCAG 2.3.1). No rapid large-area color changes.

### 9.7 Sanitize (`harness/sanitize.ts`)

Because the pipeline starts from untrusted internet text, every SVG is sanitized with an **allowlist** after compile:

- Remove `<script>`, `<foreignObject>`, `<iframe>`, `<use>` pointing outside the document, all `on*` event attributes, `javascript:` and any external `href`/`xlink:href`, external `url()` in CSS, `@import`.
- Allow only known elements and attributes (shapes, paths, groups, text, gradients, filters, `<style>` with keyframes).
- Then optimize with SVGO (keeping IDs needed for animation).

### 9.8 Render and lint

**Render (`harness/render.ts`, Playwright + Chromium):**

- Load the SVG inside an HTML page.
- For animated scenes, pause all animations via `document.getAnimations()`, then seek to exact timestamps.
- Output `still.png` (final frame, 1080×1080), `filmstrip.png` (6 frames at 0%, 20%, 40%, 60%, 80%, 100% in a 3×2 grid with timestamps), and `og.png` (1200×630 composite).

**Lint (`harness/lint.ts`, deterministic):**

- SVG parses; sanitizer made no unexpected removals.
- Size ≤ `svgMaxKB` (default 150 KB).
- Colors used ⊆ style card palette (with tolerance for opacity).
- Text words in art ≤ 6.
- Animation duration within bounds; no flashing pattern detected (compare luminance across sampled frames at 100 ms steps).
- All elements' bounding boxes within the artboard; key elements within the safe area.
- Rendered still is not blank/near-uniform.

### 9.9 Role of OpenRouter

Not used in the daily loop (it is pay-per-use and would break the zero-variable-cost rule). Possible future uses, each behind a monthly budget cap in config: a "special edition" slopper for a major event, or a second-opinion critic. Not part of v1.

---

## 10. The Critic

A separate Claude invocation with a **fresh context** (it has not seen the Art stage's reasoning). It reads `still.png`, `filmstrip.png` (if animated), the phrase, the brief, and the stills of the last 14 sloppers (for novelty). Rubric in `knowledge/rubric-art.md`.

| Criterion | Question |
|---|---|
| `clarity` | Does the concept read within 3 seconds? |
| `coherence` | Do art and phrase support each other? |
| `composition` | Is it balanced, with a clear focal point, inside the safe area? |
| `style` | Does it respect the style card? Does it look intentional? |
| `narrative` | (Animated only) Does the filmstrip read like a comic strip, with a clear punchline at the end? |
| `polish` | No rendering bugs, clipping, overlaps, broken shapes? |
| `novelty` | Different enough from the last 14 sloppers (composition, palette, cast)? |
| `kindness` | Is the joke kind, not cruel? |

Scores 1–5. **Pass:** average ≥ **3.5** and no criterion below **2**. Output `critic.json` with scores, a short verdict, and concrete revision notes ("move the robot to the left third; the meter is unreadable at small size").

---

## 11. The Cop

**Purpose:** protect Gorka, the developer and publisher, from content that could be the object of legal action. The Cop is a separate Claude invocation with a fresh context, **read-only**, and it reviews final outputs only. Rubric in `knowledge/rubric-cop.md`.

Checks:

1. **Defamation / false statements:** every factual element in the phrase, motto, alt text, or art must be supported by the listed sources. Satire must be recognizable as satire, and must not state or imply false facts about identifiable people or organizations.
2. **Real people:** no names, no recognizable likeness, no caricatures of real people.
3. **Trademarks and brands:** no logos, brand marks, product names, or implied endorsement.
4. **Copyright:** no reproduction of characters, artworks, photos, lyrics, or distinctive existing designs.
5. **Privacy:** no private individuals, no personal data.
6. **Hate and harassment:** no content targeting protected groups; no harassment.
7. **Dangerous or regulated advice:** no health, legal, or financial statements presented as fact or advice.
8. **Sensitive events:** no jokes about deaths, disasters, violence, or victims.

Output `cop.json`: `{ verdict: "pass" | "revise" | "hold", findings: [{ check, severity, evidence, suggestion }] }`.

**Fail closed:** `hold`, or `revise` after the allowed retry, blocks automatic publishing (label `cop-hold`). Gorka can still override manually, at his own responsibility (§17).

**Audit trail:** every `cop.json` is committed, forming a record of good-faith diligence.

> Note: the Cop reduces legal risk but does not eliminate it. It is not legal advice. Gorka should consider a short consultation with a lawyer familiar with the jurisdiction he publishes from.

---

## 12. The static site

### 12.1 Stack

- **Eleventy** (static site generator), Node LTS, TypeScript for data and helpers.
- **No client framework.** One small JS file (`replay.js`) for the replay button and nothing else.
- **Self-hosted fonts** (open-licensed, e.g. from Google Fonts downloaded into the repo), so no third-party requests and a strict CSP.
- Light and dark themes via `prefers-color-scheme`.

### 12.2 URLs

| URL | Content |
|---|---|
| `/` | Today's slopper (the latest published), same layout as a day page |
| `/YYYY/MM/DD/` | **Canonical** page for a slopper |
| `/YYYY/MM/DD/slopper.svg` | Animated/static art |
| `/YYYY/MM/DD/still.png` | Square still (1080×1080) |
| `/YYYY/MM/DD/og.png` | Social preview (1200×630) |
| `/today/` | Redirect (302) to latest canonical page, via `_redirects` |
| `/archive/` | Grid of all sloppers (newest first), grouped by month |
| `/about/` | What Slopper is, satire notice, license, takedown contact, privacy note |
| `/feed.xml` | Atom feed (one entry per slopper, with image) |
| `/sitemap.xml` | All pages |
| `/robots.txt` | Allow all, link to sitemap |

No slugs in URLs, so a URL never changes if a motto is edited.

### 12.3 Day page layout

Simple and clean, like a Google Doodle page:

1. Small wordmark "Slopper" at the top (links to `/`).
2. The art, centered, square, max ~560 px on desktop, full width on mobile. Shown with `<img src="slopper.svg" alt="…">` (an `<img>` never runs scripts: extra isolation). Replay button below animated art.
3. Motto as `<h1>`.
4. Phrase as a paragraph.
5. Date and number: "#42 · 27 September 2026".
6. `<details><summary>Relevant sources</summary>…</details>` — hidden by default, present in HTML for crawlers.
7. Continuation days show a small link: "Continues from #41".
8. Navigation: ← previous · today · archive · next →.
9. Footer: about · feed · license (CC BY 4.0).

### 12.4 SEO and sharing

- `<title>`: `Slopper #42 — Benchmark Season — 2026-09-27`.
- `<meta name="description">`: the phrase.
- `<link rel="canonical">` to the dated URL.
- Open Graph and Twitter card tags using `og.png`; also link `still.png` for square sharing.
- JSON-LD `CreativeWork` with `image` (ImageObject), `dateCreated`, `headline` (motto), `description` (phrase), `license` (CC BY 4.0 URL), `creator`.
- Alt text on every image (from the scene's `alt`).

### 12.5 Headers (`site/static/_headers`, Cloudflare Pages format)

- For HTML: `Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`.
- For `*.svg`: `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:` (so an SVG opened directly still cannot run anything) and `Content-Type: image/svg+xml`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- `Strict-Transport-Security: max-age=31536000` (add only after HTTPS on the custom domain is confirmed; start with a short `max-age` such as 300 during M6).
- Cache: dated media files (`/YYYY/MM/DD/slopper.svg`, `still.png`, `og.png`) `Cache-Control: public, max-age=31536000, immutable`; dated HTML pages `max-age=3600` (so a takedown reaches browsers within an hour); `/`, `/archive/`, `/feed.xml`, `/sitemap.xml` short cache (e.g. 5 minutes).

### 12.6 Analytics

**Cloudflare Web Analytics** (free, cookieless): no cookie banner needed. Mentioned in the privacy note on `/about/`. Enabled in the Cloudflare dashboard for the Pages project.

### 12.7 Build

`npm run build` reads all `sloppers/**/day.json` files that are **published** and generates `dist/`. "Published" means *committed on `main`*: the build includes only slopper folders tracked by git (`git ls-files sloppers/`); in CI the build runs on a `main` checkout after the merge. There is no `published` field. `npm run dev` also shows untracked (local dry-run) folders, with a "draft" badge. Only public files are copied to `dist/` (`slopper.svg`, `still.png`, `og.png`); `digest.json`, `scene.json`, `filmstrip.png`, `critic.json`, and `cop.json` stay in the repo only. This keeps the deployed file count low (Cloudflare Pages has a per-deployment file limit; verify the current value).

---

## 13. Hosting and DNS

### 13.1 Cloudflare Pages

- Project name: `slopper`, created 2026-09-26. Cloudflare assigned the hostname **`slopper-coh.pages.dev`** (the name `slopper.pages.dev` was taken). Preview deployments: `preview.slopper-coh.pages.dev`.
- **Platform note (2026-09):** wrangler 4.141 now delegates `wrangler pages project create` to "Cloudflare Pages, now part of Cloudflare Workers". The project was created as a classic Pages project with `--force`, to keep the external-DNS CNAME custom domain this design relies on. Later `wrangler pages` commands act on it directly. Re-check this before M6 in case classic Pages is being retired.
- Deploy method: **Direct Upload** from GitHub Actions with `wrangler pages deploy dist --project-name slopper --branch main`. Cloudflare's Git integration is **not** used (the publisher controls exactly when deployments happen).
- **Why Pages and not Workers:** Workers custom domains require the domain to be a Cloudflare zone. Pages supports a subdomain with **external DNS** through a simple CNAME, which fits freedns.afraid.org.

### 13.2 DNS setup (one-time, manual, at freedns.afraid.org)

Order matters (a CNAME added before associating the domain in Pages can cause errors):

1. Create the Pages project with a first manual deploy (`npx wrangler pages deploy dist --project-name slopper`).
2. In the Cloudflare dashboard → Workers & Pages → `slopper` → **Custom domains** → add `slopper.logicos.org`. Cloudflare shows the CNAME target.
3. At freedns.afraid.org, create: `CNAME  slopper.logicos.org  →  slopper-coh.pages.dev` (use the exact target shown by Cloudflare).
4. Wait for Cloudflare to verify and issue the certificate. If `logicos.org` has CAA records, they must allow Cloudflare's certificate authorities.
5. Done. This record never needs to change again.

**Status (2026-09-27): done.** CNAME `slopper.logicos.org → slopper-coh.pages.dev` at freedns; domain attached to the Pages project through the Cloudflare API (wrangler has no command for it); certificate issued by Google Trust Services in ~90 s; HTTP → HTTPS 301 works; HSTS enabled with `max-age=300`. The production deployment currently shows the "Coming soon" page (empty archive).

**HTTPS:** Cloudflare issues and renews a certificate for `slopper.logicos.org` itself (not for `pages.dev`) once the domain is added in step 2. Renewal is automatic as long as the CNAME stays in place. Verify with `curl -I https://slopper.logicos.org` and the browser padlock. HSTS is set in `_headers` (§12.5) only after HTTPS is confirmed working.

---

## 14. Repository tree

```
slopper/
├── CLAUDE.md                      # short rules for Claude Code dev sessions; points to docs/DESIGN.md
├── docs/                          # all project documentation
│   ├── DESIGN.md                  # this document
│   └── PROGRESS.md                # detailed build progress, milestone by milestone
├── README.md                      # public overview, how to run locally
├── LICENSE                        # MIT (code)
├── LICENSE-ART.md                 # CC BY 4.0 (everything under sloppers/)
├── package.json
├── package-lock.json
├── tsconfig.json
├── .nvmrc                         # Node LTS version
├── .env.example                   # local env vars (no secrets needed locally for Claude)
├── slopper.config.json            # non-secret tunables (§15)
│
├── .github/
│   ├── workflows/
│   │   ├── generate.yml           # daily 15:00 UTC: fetch → create (incl. cop) → open PR
│   │   ├── publish.yml            # hourly: merge eligible PRs → build → deploy
│   │   ├── ci.yml                 # PRs and main: typecheck, tests, lint sloppers, build
│   │   ├── regenerate.yml         # label "regenerate" on a slopper PR → new attempt
│   │   └── lessons.yml            # weekly: distill feedback issues → PR to LESSONS.md
│   ├── ISSUE_TEMPLATE/
│   │   ├── feedback.yml
│   │   ├── style-idea.yml
│   │   └── takedown.yml
│   ├── pull_request_template.md
│   └── dependabot.yml
│
├── pipeline/
│   ├── run.ts                     # orchestrator: `npm run day -- --date YYYY-MM-DD [--dry-run]`
│   ├── claude.ts                  # wrapper around `claude -p` (tools, turns, JSON parsing, retries)
│   ├── fetch/
│   │   ├── index.ts               # runs all sources, normalizes, window filter, caps, dedupes → digest
│   │   ├── cli.ts                 # `npm run fetch -- --date … [--record dir | --replay dir]`
│   │   ├── http.ts                # User-Agent, robots.txt, per-host rate limits, retries, size cap, record/replay
│   │   ├── robots.ts              # robots.txt parser (RFC 9309)
│   │   ├── feed.ts                # RSS / Atom / RDF parser (no entity expansion)
│   │   ├── normalize.ts           # plain text, truncation, canonical URLs, de-duplication, AI keyword filter
│   │   ├── types.ts
│   │   └── sources/
│   │       ├── hackernews.ts
│   │       ├── huggingface.ts
│   │       ├── arxiv.ts
│   │       ├── feeds.ts           # publisher RSS/Atom feeds (config list)
│   │       ├── gdelt.ts
│   │       └── techmeme.ts
│   ├── stages/
│   │   ├── curate.ts
│   │   ├── art.ts                 # art loop incl. compile/render/lint/critic calls
│   │   ├── critic.ts
│   │   ├── cop.ts
│   │   └── package.ts             # og.png, final day.json, PR body
│   ├── schemas/                   # zod schemas = contracts between stages
│   │   ├── digest.ts
│   │   ├── day.ts
│   │   ├── scene.ts
│   │   ├── critic.ts
│   │   ├── cop.ts
│   │   └── storylines.ts
│   └── util/
│       ├── dates.ts               # UTC-only date helpers
│       ├── numbering.ts           # slopper number = days since LAUNCH_DATE + 1
│       ├── config.ts              # config precedence (§15)
│       └── log.ts
│
├── prompts/                       # stage prompts (versioned)
│   ├── curate.md
│   ├── art.md
│   ├── critic.md
│   ├── cop.md
│   └── lessons.md
│
├── knowledge/                     # evolving "brain" of the project
│   ├── ontology.yaml
│   ├── voice.md                   # voice guide + approved/rejected examples
│   ├── rubric-art.md
│   ├── rubric-cop.md
│   ├── LESSONS.md                 # distilled feedback, read every day
│   └── storylines.json
│
├── infra/
│   └── clock/                     # slopper-clock Cloudflare Worker: starts generate/publish on time
│
├── harness/
│   ├── compile.ts                 # scene.json → SVG
│   ├── layout.ts                  # anchors, grid, safe area
│   ├── animate.ts                 # beats → CSS keyframes
│   ├── sanitize.ts                # allowlist sanitizer + SVGO
│   ├── render.ts                  # Playwright: still, filmstrip, og
│   ├── lint.ts
│   ├── playground.ts              # `npm run harness:watch <scene.json>` live preview
│   ├── components/
│   │   ├── index.ts
│   │   ├── robot.ts
│   │   ├── human.ts
│   │   ├── cloud.ts
│   │   ├── datacenter.ts
│   │   ├── chart.ts
│   │   ├── speech-bubble.ts
│   │   ├── sun.ts
│   │   ├── label.ts
│   │   └── _proposed/             # candidate components awaiting review
│   ├── styles/
│   │   ├── riso-duotone.yaml
│   │   ├── paper-cutout.yaml
│   │   └── blueprint.yaml
│   └── fixtures/                  # example scenes for tests and site development
│
├── sloppers/                      # the archive (CC BY 4.0)
│   └── 2026/
│       └── 09/
│           └── 27/
│               ├── day.json       # motto, phrase, number, mode, sources, storylines, versions
│               ├── digest.json    # fetched items (titles, URLs, short snippets)
│               ├── scene.json
│               ├── slopper.svg
│               ├── still.png
│               ├── og.png
│               ├── filmstrip.png  # only if animated
│               ├── critic.json
│               ├── cop.json
│               ├── curate.json    # Curate's full answer (top stories, storyline matches, brief)
│               ├── storylines.json # storyline state after this day (next day's input; copied to knowledge/ by open-pr)
│               └── pr.md          # PR title, labels, and body
│
├── site/
│   ├── eleventy.config.ts         # run through tsx; global data instead of _data/*.ts
│   ├── lib/sloppers.ts            # loads day.json files: build | dev (drafts) | all (fixtures)
│   ├── fixtures/                  # sample sloppers for previews (sloppers.json + build.ts)
│   ├── src/
│   │   ├── _includes/
│   │   │   ├── base.njk
│   │   │   └── slopper.njk
│   │   ├── index.njk              # today
│   │   ├── day.njk                # paginated → /YYYY/MM/DD/
│   │   ├── archive.njk
│   │   ├── about.md
│   │   ├── feed.njk               # → /feed.xml
│   │   ├── sitemap.njk            # → /sitemap.xml
│   │   ├── robots.njk             # → /robots.txt (needs SITE_URL)
│   │   ├── redirects.njk          # → /_redirects (/today/ → latest)
│   │   └── 404.njk
│   ├── assets/
│   │   ├── css/site.css
│   │   ├── js/replay.js
│   │   └── fonts/
│   └── static/
│       ├── _headers
│       └── favicon.svg
│
└── tests/
    ├── harness/                   # compile, sanitize (malicious SVG cases!), lint
    ├── pipeline/                  # schemas, dates, numbering, config precedence, fetch (replayed)
    ├── site/                      # build smoke test
    └── fixtures/fetch/<date>/     # recorded source responses (full article text stripped)
```

---

## 15. Configuration

### 15.1 Precedence

`CLI flag` > `environment variable` (GitHub repository variable in CI, `.env` locally) > `slopper.config.json` > code default.

### 15.2 GitHub repository variables (Settings → Secrets and variables → Actions → Variables)

| Variable | Values | Default | Meaning |
|---|---|---|---|
| `VETO_MODE` | `off` \| `window` \| `approve` | `window` | How publishing is gated (§17) |
| `PUBLISH_HOUR_UTC` | integer 0–23 | `19` | In `window` mode: PRs publish at or after this UTC hour of the day they were opened (19 = 14:00 in UTC-5). This is Gorka's veto deadline |
| `VETO_MIN_MINUTES` | integer | `60` | In `window` mode: minimum PR age before publishing, even after `PUBLISH_HOUR_UTC` (a late PR still gets a review window) |
| `DRY_RUN` | `true` \| `false` | `true` until launch | If `true`, PRs are created but never published |
| `SITE_URL` | URL | `https://slopper.logicos.org` | Canonical base URL |
| `CLOUDFLARE_ACCOUNT_ID` | string | — | Cloudflare account ID (not secret) |
| `LAUNCH_DATE` | `YYYY-MM-DD` | — | Date of Slopper #1 (number = days since this date + 1) |
| `TELEGRAM_CHAT_ID` | integer | — | Gorka's Telegram chat id (notifications) |
| `REVIEWER_UTC_OFFSET` | integer | `-5` | Only for showing the deadline in Gorka's local time |
| `BOT_APP_ID` | integer | — | GitHub App ID of the Slopper bot (not secret) |

### 15.3 GitHub secrets

| Secret | Used by | Notes |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | generate (`create` job, incl. Cop), regenerate, lessons | From `claude setup-token` with Gorka's Max account. Has an expiry: keep a calendar reminder. |
| `CLOUDFLARE_API_TOKEN` | publish (deploy job only) | Scoped to "Cloudflare Pages: Edit" on this account only. Stored in the `production` environment. |
| `TELEGRAM_BOT_TOKEN` | generate (`open-pr` notify step, failure alert), publish (tag notify, failure alert) | Telegram bot token from @BotFather. Only sends messages. |
| `BOT_APP_PRIVATE_KEY` | generate (`open-pr` job), publish (merge step) | Private key of the Slopper bot GitHub App (see §16.7). Used to mint short-lived installation tokens. |

### 15.4 `slopper.config.json` (non-secret tunables)

```json
{
  "generateHourUTC": 15,
  "maxArtIterations": 3,
  "copRetries": 1,
  "relevanceThreshold": 8,
  "maxContinuationDays": 3,
  "balanceBonus": 3,
  "heatDecay": 0.7,
  "noveltyWindowDays": 14,
  "artboard": 1080,
  "safeArea": 60,
  "svgMaxKB": 150,
  "rawSvgMaxBytes": 8192,
  "maxRawElements": 3,
  "maxWordsInArt": 6,
  "animation": { "minSec": 3, "maxSec": 9, "filmstripFrames": 6 },
  "critic": { "passAverage": 3.5, "minScore": 2 },
  "sources": {
    "perSourceCap": 40,
    "snippetMaxChars": 300,
    "hnQueries": ["AI", "LLM", "artificial intelligence", "machine learning"],
    "gdeltQueries": ["…one per dimension group, see slopper.config.json…"],
    "feeds": [{ "name": "MIT Technology Review", "url": "https://www.technologyreview.com/topic/artificial-intelligence/feed" }, "…"]
  }
}
```

### 15.5 Claude Code usage

- Invoke with `claude -p` in headless mode; use the **default model** (do not pass a model flag).
- Each stage passes a restricted tool list (see §19.2), a `--max-turns` limit, and requests JSON output. The orchestrator validates output with zod and retries once on invalid JSON.
- Verified against Claude Code 2.1.283 (M5). Every call: `claude -p <prompt> --restricted --tools Read --strict-mcp-config --permission-mode dontAsk --no-session-persistence --disable-slash-commands --output-format json --json-schema <schema>`, run with the working directory set to a **throwaway workspace** that contains only that stage's input files (`--restricted` confines file tools to it, removes Bash/code tools and WebFetch, and ignores user/project settings). Tested: a `Read` outside the workspace is refused.
- `--bare` is **not** usable: it authenticates only with an API key and never reads the OAuth token, which would bypass the Max subscription.
- There is no `--max-turns` flag in this version; `pipeline/claude.ts` enforces a wall-clock timeout per stage instead (curate 15 min, art 10, critic 8, cop 8).
- Structured output (`structured_output`) is validated with zod plus stage-specific checks; one retry quotes the problems back to the model.
- Budget: the pipeline shares Gorka's Max 5x usage with his interactive work. Keep iteration caps as configured. The 15:00 UTC run (10:00 for Gorka) may overlap with interactive work; if usage limits become a problem, move `generateHourUTC` earlier (the veto deadline does not depend on it).

---

## 16. GitHub Actions workflows

General rules for all workflows:

- Pin third-party actions to a full commit SHA.
- Set `permissions:` explicitly per job (default `contents: read`).
- Never expose secrets to workflows triggered by forks. Keep GitHub's default "require approval for workflows from outside collaborators".
- `concurrency` groups so two runs for the same date never overlap.

### 16.1 `generate.yml`

Triggers: `schedule` at `7 11 * * *`, `7 13 * * *`, `7 15 * * *` and `workflow_dispatch` (inputs: `date`, optional). GitHub cron has no guaranteed start time (the first scheduled run started 3 h 42 min late), so the later tries are backups: a scheduled run exits in its `fetch` job when a PR (any state) already exists for the date. Manual runs always proceed. Minute 7 avoids the top-of-the-hour load.

**Calibration history (while `DRY_RUN=true`):** dry-run PRs are closed, not merged, so `open-pr` also commits each dry-run folder to a long-lived `calibration` branch (replacing the day on regeneration), and `create` overlays `sloppers/` from that branch before running. Earlier days, storylines, continuation, and style rotation can therefore be calibrated without anything reaching `main` or the site. With `DRY_RUN=false` both steps are off; the branch stays as a record.

| Job | AI? | Secrets | Permissions | Does |
|---|---|---|---|---|
| `fetch` | no | none | `contents: read` | Runs fetch, uploads `digest.json` as an artifact |
| `create` | yes | `CLAUDE_CODE_OAUTH_TOKEN` | `contents: read` | Curate + art loop (Chromium via Playwright) + Cop, each as a separate fresh-context Claude call; a Cop `revise` retries the relevant stage inside this job. Uploads the slopper folder and storylines update as an artifact |
| `open-pr` | no | `BOT_APP_PRIVATE_KEY` (bot installation token) | job: `contents: read`; bot token: `contents: write`, `pull-requests: write` | Downloads artifacts, re-validates schemas and sanitizer, commits to `slopper/YYYY-MM-DD`, opens PR with labels |

Cop and Create share one job because the Cop's `revise` verdict loops back into Curate or Art; doing that across jobs is awkward in Actions. Isolation is unchanged: every Claude call has a fresh context and read-only tools, and the job holds only the Claude token.

Key point: **AI jobs cannot write to the repository.** Only the `open-pr` job writes, and it contains no AI. It uses the bot App token (not `GITHUB_TOKEN`) because PRs opened with `GITHUB_TOKEN` do not trigger `ci.yml`, so the required `ci` check would never report.

PR labels set automatically: `slopper`, plus `fresh` or `continuation`, plus `critic-fail` or `cop-hold` if applicable, plus `dry-run` if `DRY_RUN=true`.

### 16.2 `publish.yml`

Triggers: `schedule: cron "5 * * * *"` (hourly, at :05, so the 19:05 UTC run publishes right after the deadline) and `workflow_dispatch`.

1. List open PRs with label `slopper`.
2. A PR is **eligible** when all are true:
   - CI passed; no labels `veto`, `cop-hold`, `critic-fail`, `dry-run`;
   - mode rule: `off` → always; `window` → (current UTC time ≥ `PUBLISH_HOUR_UTC`:00 on the PR's creation day **and** PR age ≥ `VETO_MIN_MINUTES`) **or** label `approved`; `approve` → label `approved` only.
   - Gorka may override `cop-hold` or `critic-fail` by adding **both** `approved` and `override` labels.
3. Merge eligible PRs (squash) in date order, using the bot App token (the App is on the `main` ruleset bypass list).
4. Build the site (`npm ci && npm run build`).
5. Deploy job (`environment: production`, holds `CLOUDFLARE_API_TOKEN`): `wrangler pages deploy dist`.
6. Tag the merge commit `slopper-YYYY-MM-DD`.

Note: build and deploy happen inside this same workflow run (not via a `push` trigger), so the publisher controls exactly when a deployment happens.

If `DRY_RUN=true`, the workflow only reports which slopper PRs it would merge. It still deploys `main` when it changed (site code, takedowns): see below.

**Deploy state (M6):** a lightweight tag `deployed` marks the last deployed commit of `main`. Every run compares `main` with it and deploys when they differ, so a failed deploy is retried by the next hourly run, and code or takedown merges go live within the hour. Tags (`deployed`, `slopper-YYYY-MM-DD`) are written through the GitHub API with the bot token.

### 16.3 `ci.yml`

Triggers: `pull_request`, `push` to `main`. Typecheck, unit tests, schema validation of any changed `sloppers/**`, sanitizer re-check of changed SVGs, and a full site build. Required status check for `main`.

### 16.3b `setup-labels.yml`

`workflow_dispatch` only: creates or updates every label in §17.5 (idempotent). Used once during setup (see `docs/SETUP.md`).

### 16.4 `regenerate.yml`

Trigger: `pull_request` `labeled` with label `regenerate`, only if `github.actor` is the repo owner. Closes the current PR (comment: "Regenerating") and dispatches `generate.yml` for the same date. Maximum 2 regenerations per date (counted from closed PRs).

### 16.5 `lessons.yml`

Trigger: weekly `cron "0 8 * * 0"` (Sunday 08:00 UTC) and `workflow_dispatch`.

1. Collect open issues with label `feedback`, `great`, `bad`, or `style-idea` **authored by the repo owner only** (public issues from others are untrusted input and are ignored by the AI).
2. Claude distills them into updates for `knowledge/LESSONS.md` (and optionally proposals for style cards or components).
3. A non-AI job opens a PR `Weekly lessons — YYYY-Www` and comments on the processed issues. Issues are closed when Gorka merges the PR.

### 16.6 Repository settings

- Branch protection on `main`: require `ci` status check; require PRs (except the bot merge path in `publish.yml`, which is allowed via the workflow's `GITHUB_TOKEN`).
- Environment `production`: holds `CLOUDFLARE_API_TOKEN`; restricted to `main`.
- Dependabot for npm and GitHub Actions.

### 16.7 The Slopper bot (GitHub App)

A small GitHub App owned by Gorka, installed **only** on `gllona/slopper`, with repository permissions `contents: write`, `pull-requests: write`, `issues: write` (labels, failure issues), `metadata: read`. Workflows mint a short-lived installation token with `actions/create-github-app-token` (pinned SHA) only in the non-AI steps that need it. Why an App and not `GITHUB_TOKEN` or a PAT: PRs and pushes made with `GITHUB_TOKEN` do not trigger other workflows (so CI would never run on slopper PRs), and a PAT is broader, tied to a person, and expires. The App is added to the bypass list of the `main` ruleset so the publisher can merge.

---

## 17. GitHub Operations (Gorka's daily routine)

### 17.1 Every day (about 1 minute)

Around **15:30–16:00 UTC (10:30–11:00 your time)** a PR appears: **`Slopper #N — YYYY-MM-DD — <motto>`**. Your phone gets a **Telegram** message (still image, motto, phrase, critic and Cop results, your deadline, an "Open PR" button) and a **GitHub Mobile** push (the bot requests your review). Approve or veto by adding the label in GitHub Mobile. Failures and publications are also sent to Telegram. The PR body shows the still, the phrase, critic scores, the Cop verdict, and sources.

Your options:

| You want to… | Do this | Result |
|---|---|---|
| Let it publish | Nothing | In `window` mode, publishes at the first hourly run after 19:00 UTC (≈ 14:05 your time) |
| Publish now | Add label `approved` | Publishes at the next hourly run |
| Block it | Add label `veto` (or close the PR) | Not published; yesterday's slopper stays |
| Try again | Add label `regenerate` | New attempt, new PR (max 2 per date) |
| Leave feedback on it | Comment on the PR, or open an issue with label `great` / `bad` | Used by the weekly lessons job |

In `approve` mode nothing publishes until you add `approved`.

### 17.2 Special PR labels

- **`cop-hold`**: the Cop blocked it. Read `cop.json` in the PR. Either close the PR, `regenerate`, or, if you disagree and accept the responsibility, add `approved` **and** `override`.
- **`critic-fail`**: quality did not pass. Same options.
- **`dry-run`**: pre-launch; never publishes. Use these PRs to calibrate.
- **`pipeline-failure`** (on issues): opened automatically when a run fails; see the linked run logs.

### 17.3 Weekly (about 10 minutes)

- Review and merge the **weekly lessons PR** (edit it if needed).
- Review any **`component-proposal`** or style card proposals.
- Merge Dependabot PRs after CI passes.

### 17.4 Monthly

- Check Cloudflare Pages usage and the deployed file count.
- Check the `CLAUDE_CODE_OAUTH_TOKEN` expiry date; renew with `claude setup-token` and update the secret.
- Skim the archive for drift in quality or topic balance.

### 17.5 Labels reference

| Label | On | Meaning |
|---|---|---|
| `slopper` | PR | A daily slopper PR (set by bot) |
| `fresh` / `continuation` | PR | Day mode (set by bot) |
| `approved` | PR | Publish (early in `window`, required in `approve`) |
| `veto` | PR | Never publish this PR |
| `override` | PR | With `approved`: publish despite `cop-hold`/`critic-fail` |
| `regenerate` | PR | New attempt for the same date |
| `cop-hold` / `critic-fail` / `dry-run` | PR | Blocking states (set by bot) |
| `feedback` / `great` / `bad` / `style-idea` | issue | Input for the weekly lessons job |
| `component-proposal` | PR | New or changed harness component |
| `takedown` | issue | Legal or rights request — highest priority |
| `pipeline-failure` | issue | Automatic failure report |
| `bug` | issue | Code problem |

### 17.6 Branches, merges, and tags

- `main`: always deployable; the deployed site is built from `main`.
- `slopper/YYYY-MM-DD`: daily PR branches, created and merged (squash) by bots; deleted after merge.
- `feat/…`, `fix/…`, `docs/…`: development branches (Claude Code sessions); Gorka reviews and merges.
- Tags: `slopper-YYYY-MM-DD` for every published slopper; `harness-vX.Y.Z` for harness releases.

### 17.7 Takedown procedure

If someone reports a problem (issue `takedown` or email from the about page):

1. Add `veto` to any pending PR on the same subject.
2. Create a `fix/takedown-YYYY-MM-DD` PR that removes the slopper folder (the site build skips missing days; the archive shows a gap) and merge it; `publish.yml` redeploys (use `workflow_dispatch` to deploy immediately).
3. Note that the content remains in git history of a public repo. For serious cases, history rewriting may be needed; handle manually.
4. Record the case and the lesson in `knowledge/LESSONS.md` and, if relevant, in `knowledge/rubric-cop.md`.

---

## 18. Local development

### 18.1 Prerequisites

- Node LTS (see `.nvmrc`), npm.
- Claude Code installed and logged in with Gorka's Max account (locally no token is needed; the CLI uses the logged-in session).
- Playwright Chromium: `npx playwright install chromium`.
- Optional: `wrangler` for preview deploys.

### 18.2 Commands (`package.json` scripts)

| Command | Does |
|---|---|
| `npm run fetch -- --date 2026-09-26` | Fetch only; writes `sloppers/2026/09/26/digest.json` (`--out` to change) |
| `npm run fetch -- --date 2026-09-26 --record tests/fixtures/fetch/2026-09-26` | Fetch live and save every response as a test fixture (bodies trimmed) |
| `npm run fetch -- --date 2026-09-26 --replay tests/fixtures/fetch/2026-09-26` | Fetch offline from recorded responses |
| `npm run day -- --date 2026-09-26 --dry-run` | Full pipeline locally, writes to `sloppers/…`, no git, no deploy |
| `npm run day -- --date 2026-09-26 --from-stage art` | Rerun from a stage (`fetch`, `curate`, `art`, `cop`), reusing earlier outputs |
| `npm run day -- --date 2026-09-26 --replay tests/fixtures/fetch/2026-09-26 --out .out/live` | Full run on a recorded digest, into a scratch folder (keeps `sloppers/` clean) |
| `SLOPPER_CLAUDE_BIN=tests/fixtures/fake-claude.mjs npm run day -- …` | Run the pipeline with a fake Claude (no subscription usage) |
| `npm run harness:render -- path/to/scene.json` | Compile + sanitize + render + lint one scene |
| `npm run harness:watch -- path/to/scene.json` | Live playground in the browser while editing a scene |
| `npm run dev` | Eleventy dev server with all local sloppers (published or not, with a "draft" badge) |
| `npm run build` | Production build into `dist/` (published only) |
| `npm run preview:fixtures` | Render the harness fixtures into a sample archive (`.out/site-fixtures/`) |
| `npm run preview:build` / `preview:dev` | Build / serve the site from that sample archive |
| `npm run deploy:preview` | `wrangler pages deploy dist --branch preview` (preview URL, not production) |
| `npm test` | All tests |

### 18.3 Local vs CI parity

The same orchestrator and the same stage code run in both places. Differences are only: how Claude authenticates, whether git/PR steps run, and whether deploy runs. `--dry-run` is the default locally.

---

## 19. Security model

Gorka works in cybersecurity awareness; this project should be an example of good practice.

### 19.1 Threats and mitigations

| Threat | Mitigation |
|---|---|
| **Prompt injection** via fetched news, feed items, HN titles | Sources are data, never instructions (stated in every prompt). AI stages have no write access, no network tools, no secrets except their own OAuth token. Outputs are schema-validated. Cop reviews with fresh context. Human veto window. |
| **Prompt injection via issues** from strangers | Lessons job reads only issues authored by the repo owner. |
| **Malicious SVG** (scripts, external loads) | Declarative scene format (no executable scene code), allowlist sanitizer, re-check in `open-pr` and CI, `<img>` embedding, strict CSP headers including on `.svg`. |
| **Secret leakage** | Secrets only in the jobs that need them; Cloudflare token only in the `production` environment deploy job; no secrets on fork PRs; never print secrets; `.env` in `.gitignore`. |
| **Supply chain** | Lockfile, `npm ci`, pinned action SHAs, Dependabot, minimal dependencies. |
| **Repo tampering by a compromised AI run** | AI jobs are `contents: read`. The only writing job has no AI and re-validates everything. |
| **Legal risk** | The Cop (§11), sources required for factual claims, no real names/likenesses/brands, satire notice, takedown procedure. |

### 19.2 Claude Code tool permissions per stage

| Stage | Allowed tools |
|---|---|
| Curate | `Read` (knowledge files, digest, recent days) |
| Art | `Read` (brief, style card, component docs, previous critique, previous stills) |
| Critic | `Read` (PNG images, phrase, rubric) |
| Cop | `Read` (outputs, sources, rubric) |
| Lessons | `Read` (issues exported to a file by a non-AI step, LESSONS.md) |

No `Bash`, no `Write`/`Edit`, no `WebFetch`/`WebSearch`. Claude returns JSON on stdout; the orchestrator writes files. Rendering is done by the orchestrator between Art and Critic calls.

### 19.3 Subscription use

The pipeline uses Gorka's personal Max subscription via an OAuth token for automated, personal-project use. Gorka should verify that this is consistent with Anthropic's current terms for subscription usage.

---

## 20. Failure handling

| Failure | Behavior |
|---|---|
| One source fails | Log warning, continue. |
| More than half of sources fail | Stop; open `pipeline-failure` issue; no PR. |
| Claude usage limit reached / Claude error | Retry the stage once after 15 minutes; if it fails again, stop and open `pipeline-failure` issue. |
| Invalid JSON from Claude | Retry the stage once with the validation error; then stop. |
| Art never passes Critic | Best attempt goes to PR labeled `critic-fail` (not auto-published). |
| Cop holds | PR labeled `cop-hold` (not auto-published). |
| Deploy fails | Keep the merge; open `pipeline-failure` issue; the next hourly run retries the deploy. |
| A day is skipped completely | The archive shows a gap. No automatic backfill. Gorka may run `generate.yml` manually with a `date` input. |

The site never shows a placeholder or error slopper. If there is no new slopper, `/` keeps showing the latest published one.

---

## 21. Feedback and evolution

The system improves through versioned files, not through retraining:

- **`knowledge/LESSONS.md`**: short, distilled rules learned from feedback ("labels smaller than 28 px are unreadable on mobile"; "avoid two robots in one scene, it confuses the joke"). Read by every stage every day. Kept concise; old lessons are merged or removed during weekly updates.
- **`knowledge/voice.md`**: approved/rejected phrase examples grow over time (Gorka's `great`/`bad` feedback).
- **Rubrics** (`rubric-art.md`, `rubric-cop.md`): refined when failures reveal gaps.
- **Harness**: component library and style cards grow by accretion (§9.4, §9.5).
- **Recompile**: since every `scene.json` is stored, a future harness can re-render old sloppers. Not in v1; if done, it must not change published motto/phrase and should keep the original render available.

---

## 22. Versioning

- Every `day.json` records `versions: { harness, prompts, ontology, rubricArt, rubricCop, styleCard }`.
- Prompt and knowledge files include a version line at the top; bump it when meaning changes.
- The harness follows semver; `scene.json` declares the harness version it targets.

`day.json` sketch:

```json
{
  "date": "2026-09-27",
  "number": 42,
  "mode": "continuation",
  "continuesFrom": "2026-09-26",
  "motto": "The Thirsty Cloud",
  "phrase": "Day 4 of the water question. The datacenter asked for one more glass.",
  "phraseAlternatives": ["…", "…", "…"],
  "alt": "A tired robot walks toward a huge datacenter …",
  "artType": "animated",
  "style": "riso-duotone",
  "dimensions": { "planet": 3, "industry": 2, "capabilities": 0 },
  "mood": { "hype_doom": -1, "calm_frantic": 0 },
  "storylines": ["datacenter-water"],
  "sources": [
    { "title": "…", "url": "https://…", "source": "feeds", "publisher": "MIT Technology Review", "publishedAt": "2026-09-27T09:12:00Z" }
  ],
  "critic": { "passed": true, "average": 3.9, "iterations": 2 },
  "cop": { "verdict": "pass" },
  "versions": { "harness": "0.1.0", "prompts": "1", "ontology": "1", "rubricArt": "1", "rubricCop": "1" },
  "generatedAt": "2026-09-28T06:14:03Z"
}
```

There is no `published` field: a slopper is published when its folder is on `main` (§12.7). `number` is `days since LAUNCH_DATE + 1`, computed once at generation.

---

## 23. Licensing and legal pages

- **Code:** MIT (`LICENSE`).
- **Art and texts under `sloppers/`:** CC BY 4.0 (`LICENSE-ART.md`). Anyone may share and adapt with attribution ("Slopper #42, slopper.logicos.org, CC BY 4.0"). Attribution line shown on each page.
- **`/about/` page** includes:
  - what Slopper is and how it is made (AI-generated, daily, automated);
  - a **satire notice**: sloppers are humorous commentary on public trends; they are not news and not statements of fact about any person or organization;
  - license information;
  - a **takedown / contact** address;
  - a short **privacy note** (no cookies, Cloudflare Web Analytics, no personal data collected).

---

## 24. Build plan (milestones)

Build in this order. Each milestone ends with tests passing and a short demo.

- **M0 — Scaffold:** repo tree, TypeScript, config loader with precedence, zod schemas, `CLAUDE.md`, CI workflow, licenses.
- **M1 — Harness core:** layout, 3 components (`robot`, `datacenter`, `label`), 1 style card (`riso-duotone`), compile, sanitize (with malicious-SVG tests), render (still + filmstrip + og), lint, playground. Hand-written fixture scenes.
- **M2 — Harness v1:** remaining 5 components, 2 more style cards, animation beats and actions, reduced-motion support, flashing check.
- **M3 — Site:** Eleventy pages, archive, about, feed, sitemap, headers, redirects, replay button, dark mode, using fixture sloppers. First manual preview deploy to Cloudflare Pages.
- **M4 — Fetch:** all 7 sources, dedupe, digest; tests with recorded responses.
- **M5 — AI stages locally:** `claude.ts` wrapper, prompts, curate, art loop, critic, cop; `npm run day --dry-run` works end to end on Gorka's machine.
- **M6 — Automation:** `generate.yml`, `publish.yml`, `regenerate.yml`, labels, issue templates, environment, secrets. Custom domain + DNS (§13.2). `DRY_RUN=true`.
- **M7 — Calibration (1–2 weeks):** daily dry-run PRs; tune prompts, rubrics, thresholds, voice; Gorka approves the voice examples.
- **M8 — Launch:** set `LAUNCH_DATE`, `DRY_RUN=false`, `VETO_MODE=window`. Slopper #1.
- **M9 — Evolution:** `lessons.yml`, component proposals flow.

---

## 25. Open items

1. ~~**Wordmark and typefaces**~~ — resolved (approved 2026-09-26): Bricolage Grotesque (wordmark, headings, art labels), Atkinson Hyperlegible Next (body text), IBM Plex Mono (blueprint labels); all SIL OFL, self-hosted. Art labels are converted to paths at compile time.
2. ~~**Final v1 style cards**~~ — resolved (approved 2026-09-26): palettes in `harness/styles/*.yaml` (summary in `docs/HARNESS.md`).
3. ~~Takedown contact address~~ — resolved: `slopper@lab14.chat`.
4. ~~**Launch date**~~ — resolved: `LAUNCH_DATE=2026-09-30`, first publication 2026-10-01 (decision 41).

---

## 26. Decision log

| # | Decision |
|---|---|
| 1 | Art is generated as code (SVG + CSS animation), rendered to PNG. No raster image models in the daily loop. |
| 2 | Headless Claude Code in GitHub Actions with Gorka's Max 5x OAuth token; Claude Code's default model. |
| 3 | Public GitHub repo (free Actions). |
| 4 | No backend server. Static site on Cloudflare Pages (Direct Upload), custom subdomain via CNAME at freedns.afraid.org. |
| 5 | Node/TypeScript for everything (pipeline, harness, site); Eleventy for the site. |
| 6 | All dates are UTC. Generation for the previous UTC day, first try at 11:07 UTC (decisions 29, 37). |
| 7 | English only, plain international English, no idioms or wordplay. |
| 8 | Motto (2–5 word tag) and phrase (≤30-word joke) are distinct. |
| 9 | Human veto is optional and configurable via GitHub repository variables (`VETO_MODE`, `PUBLISH_HOUR_UTC`, `VETO_MIN_MINUTES`); default `window`, deadline 19:00 UTC (decision 29). |
| 10 | A "Cop" stage protects Gorka from legal risk; fails closed. |
| 11 | No real people, likenesses, brands, or logos in phrase, motto, or art. |
| 12 | Square 1080×1080 artboard; separate 1200×630 `og.png` for link previews. |
| 13 | Scenes are declarative JSON (not executable code); harness grows by accretion. |
| 14 | AI stages are read-only; only non-AI jobs write to the repo or deploy. |
| 15 | Art licensed CC BY 4.0; code MIT. Cloudflare Web Analytics (cookieless). |
| 16 | Fully runnable locally in dry-run mode. |
| 17 | OpenRouter not used in v1 (possible later with a budget cap). |
| 18 | Slopper bot GitHub App (not `GITHUB_TOKEN`, not a PAT) opens and merges slopper PRs, so CI runs on them and branch protection can be bypassed narrowly. |
| 19 | No `published` field; published = committed on `main`. Local dev badges untracked folders as drafts. |
| 20 | Slopper number = days since `LAUNCH_DATE` + 1, stored in `day.json`; gaps never renumber. |
| 21 | Only dated media files are cached `immutable`; dated HTML pages cache 1 hour, so takedowns propagate. |
| 22 | Curate, art/critic loop, and Cop run in one AI job (separate fresh-context Claude calls). |
| 23 | All documentation lives in `./docs/`; progress tracked in `docs/PROGRESS.md`. |
| 24 | Takedown / contact address: `slopper@lab14.chat`. Repo: `github.com/gllona/slopper`. |
| 25 | PNG outputs are 256-color palette PNGs, and the paper grain is a tiled, posterized texture: ~150 KB per still instead of ~2 MB (noise does not compress), so the git archive grows ~0.5 MB/day. |
| 26 | With reduced motion, day pages show `still.png` through `<picture><source media="(prefers-reduced-motion: reduce)">`: no JS needed, and it works even where the SVG's own media query is not applied inside `<img>`. |
| 27 | Classic Cloudflare Pages project `slopper` → `slopper-coh.pages.dev` (created with `--force`; see §13.1). |
| 28 | The `slopper-coh.pages.dev` copy of production is served with `X-Robots-Tag: noindex` (via `_headers`); only `slopper.logicos.org` is indexed. `/today/` redirects to `/` while the archive is empty. The feed is served as `application/atom+xml`. |
| 29 | Timing for Gorka in UTC-5 (no DST): generate at 15:00 UTC, review at ~17:00 UTC, **fixed** veto deadline 19:00 UTC (`PUBLISH_HOUR_UTC`) plus a 60-minute minimum PR age (`VETO_MIN_MINUTES`), replacing `VETO_HOURS`. `publish.yml` runs hourly at :05. |
| 3 | The robots are learning fast. The rules are still reading page one. | A | |
| 3 | The robots are learning fast. The rules are still reading page one. | A | |
| 3 | The robots are learning fast. The rules are still reading page one. | A | |
| 30 | Sources (v1): Hacker News, Hugging Face, arXiv via `rss.arxiv.org`, publisher feeds, GDELT, Techmeme. Google News RSS, Reddit, and the arXiv API are excluded by `robots.txt`; The Guardian, Al Jazeera, and Bing News by their terms (§7). |
| 31 | GDELT is best-effort: few broad queries, 12 s between requests, 90 s timeout, one retry. It rate-limits shared IPs hard (it answered 429 for hours during M4), and its failure alone never stops the pipeline. Revisit after observing it from GitHub runners (M6). |
| 32 | AI calls use `--restricted --tools Read` in a throwaway workspace (§15.5); `--bare` is excluded because it bypasses the subscription login. The mode rule, storyline heat, and the critic pass rule are computed by code; Claude's scores feed them, and mismatches trigger one retry. |
| 33 | Each day folder keeps `curate.json`, `storylines.json` (state after the day; input for the next day, then `knowledge/storylines.json` via open-pr), and `pr.md`. The Critic judges novelty from one contact sheet of recent stills (`recent.png`), not 14 separate images. |
| 34 | `open-pr` re-verifies the AI job's folder (`npm run verify:sloppers`: schemas, sanitizer re-check, allowed file names, sizes) **before** the bot token is minted, and runs `npm ci --ignore-scripts`. Claude Code is a pinned dev dependency (lockfile integrity), not a global install. |
| 35 | Publishing uses a `deployed` tag to deploy any undeployed `main` (retry on failure, code and takedown changes). `DRY_RUN` only stops slopper merges. One-time setup steps live in `docs/SETUP.md`. |
| 36 | Phone notifications are **outbound only** (no endpoint): the bot requests the owner's review (GitHub Mobile push) and sends Telegram messages (`pipeline/ops/notify.ts`; failures and publications via `curl`). Gorka acts by labeling the PR in GitHub Mobile. Telegram buttons that act directly would need an always-on endpoint (a Cloudflare Worker holding a GitHub credential); not done. |
| 37 | Schedule: three tries per day (11:07, 13:07, 15:07 UTC), idempotent per date, replacing the single 15:00 UTC run (decision 29's review time and deadline are unchanged). |
| 38 | While `DRY_RUN=true`, dry-run sloppers are kept on a `calibration` branch and read back as history by the `create` job. |
| 39 | **Clock:** a Cloudflare Worker (`infra/clock`, cron triggers 11:07 and 13:07 UTC → `generate` with `scheduled=true`; every hour at :05 → `publish`) starts the workflows through GitHub's API with a fine-grained token (Actions read/write on this repo only). No fetch handler, no route, no workers.dev URL. GitHub cron schedules remain as backups. Reason: GitHub started scheduled runs 3–7 hours late on 2026-09-27/28/29. |
| 40 | **Art sees its work:** on a retry the Art stage gets `attempt.png` (its previous final frame) and `layout.json` (rendered boxes). The compiler nudges text back into the safe area and shapes back into the artboard (reported as lint warnings) instead of losing an iteration. Reason: 2 of the first 3 dry runs failed the critic on layout, not ideas. |
| 41 | Launch: `LAUNCH_DATE=2026-09-30`, so Slopper #1 (about 2026-09-30) is **published on 2026-10-01**, the first day of Q4, at the 19:00 UTC deadline. Changed on 2026-09-30 from `2026-10-01` (Gorka preferred the publication day to coincide with the quarter). |
| 42 | **"Slop-art", not "art"** in everything visitors see (site pages, meta description and feed subtitle, default social image, README, `LICENSE-ART.md`, the `critic-fail` label). Many artists do not accept AI-made images as art; the name is also more satirical. Internal code names (`art.ts`, `artType`, the Art stage), prompts, and these docs keep "art" (Gorka's choice: public texts only). |
## Appendix A — Voice candidates (reviewed)

Reviewed by Gorka. **A** (approved) lines go into `knowledge/voice.md` as good examples. **D** (denied) lines go in as rejected examples (no reason given; treat them as "not the Slopper voice").

All candidates follow §8.3: plain English, no puns or idioms, no real names, humor from contrast and understatement.

| # | Phrase | A / D | Note |
|---|---|---|---|
| 1 | The new model is 3% smarter and 40% more confident. | A | |
| 2 | Everyone announced an AI agent today. Nobody announced what it will do. | A | |
| 3 | The robots are learning fast. The rules are still reading page one. | A | |
| 4 | A student asked the AI for help with homework. The AI asked another AI. | A | |
| 5 | Nothing important happened in AI today. Please enjoy this rare moment of silence. | A | |
| 6 | The model can now see, hear, and speak. It still cannot find the file you uploaded. | A | |
| 7 | More chips, more power, more money. Nobody told the electricity bill. | A | |
| 8 | The AI passed the exam. The teachers are writing a new exam, with a pen. | A | |
| 9 | Day 4 of the copyright fight. Only the lawyers are sure they will win. | D | |
| 10 | The machine learned to write code. The humans learned to review much more code. | D | |
| 11 | Billions of dollars went into AI today. The AI politely asked what money is for. | A | |
| 12 | A new law about AI was finished. It is already older than three new models. | A | |
| 13 | AI can now create any image you want. The internet is now full of the same six images. | A | |
| 14 | People worry that AI will take their jobs. Today it only took their meetings. | A | |
| 15 | The open model and the closed model had a race. The chip makers won. | A | |
| 16 | The chatbot said "I am not sure." Some people cried with happiness. | A | |
| 17 | Still waiting for the robot that folds the laundry. Day 900. | A | |
| 18 | The AI summarized ten thousand news articles. The summary said: "More news tomorrow." | A | |
| 19 | Everybody is building a smarter brain. Very few are building a calmer one. | A | |
| 20 | Today the datacenter used more water than the town. The town was asked to be patient. | A | |
