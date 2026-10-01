# Slopper

**One small piece of AI-made slop-art per day about the state of AI.** Like a daily doodle, but the topic is
AI (models, jobs, schools, energy, law, culture…) and the one drawing it is also AI.

Live at **https://slopper.logicos.org** since 2026-10-01. First one: [Slopper #1, "Self-Policing Season"](https://slopper.logicos.org/2026/10/01/).

Each *slopper* is a square SVG image or short animation, a 2–5 word **motto**, a one-line **phrase**
(the joke), and the list of **sources** it is based on. Everything is generated daily by a pipeline that
fetches public news, asks Claude to curate, write, and draw (as code), checks quality with an AI Critic,
checks legal risk with an AI "Cop", and opens a pull request for a human veto before publishing a static site.

Read the full design in [`docs/DESIGN.md`](docs/DESIGN.md), the one-time automation setup in [`docs/SETUP.md`](docs/SETUP.md), the scene vocabulary in [`docs/HARNESS.md`](docs/HARNESS.md), and build progress in [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Run locally

```bash
nvm use                         # Node 24
npm ci
npx playwright install chromium
npm run check                   # typecheck + tests

# Render one scene (compile → sanitize → render → lint) into .out/<name>/
npm run harness:render -- harness/fixtures/thirsty-datacenter.json

# Render every fixture and build .out/contact-sheet.png
npm run harness:fixtures

# Live playground: opens your browser and re-renders on every save
# (--port N, --host 0.0.0.0 to reach it from outside a container, --no-open)
npm run harness:watch -- harness/fixtures/thirsty-datacenter.json
```

## The site

```bash
npm run preview:fixtures && npm run preview:dev   # sample sloppers at http://localhost:8080
npm run build                                     # production build (published sloppers only) → dist/
```

Preview: https://preview.slopper-coh.pages.dev

## License

- Code: [MIT](LICENSE)
- Slop-art and texts under `sloppers/`: [CC BY 4.0](LICENSE-ART.md) — credit "Slopper #N, slopper.logicos.org"
