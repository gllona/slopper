# One-time setup for automation (M6)

Everything here is done once, by Gorka, in the GitHub and Cloudflare web UIs. It takes about 20 minutes.
Order matters only where noted. Nothing here is committed to the repo: secrets live in GitHub.

Checklist:

- [ ] 1. GitHub App "slopper-bot" created and installed on `gllona/slopper`
- [ ] 2. Claude token secret
- [ ] 3. Cloudflare API token + `production` environment
- [ ] 4. Repository variables
- [ ] 5. Ruleset for `main`
- [ ] 6. Actions settings
- [ ] 7. Labels (run the `setup-labels` workflow)
- [ ] 8. First dry run
- [ ] 9. Phone notifications (GitHub Mobile + Telegram)
- [ ] 10. The clock (Cloudflare Worker that starts the workflows on time)
- [ ] 11. Instagram (@sloppertoday), posted by the clock

---

## 1. The bot: a GitHub App (DESIGN §16.7)

Why: PRs opened with the default `GITHUB_TOKEN` do not trigger CI, and a personal token is too broad.

1. Open https://github.com/settings/apps/new
2. **GitHub App name:** `slopper-bot` (or any free name: `ai-slopper-bot`). **Homepage URL:** `https://slopper.logicos.org`.
3. **Webhook:** uncheck **Active** (no webhook needed).
4. **Repository permissions:**
   - Contents: **Read and write**
   - Pull requests: **Read and write**
   - Issues: **Read and write**
   - Metadata: Read-only (automatic)
   - Everything else: No access.
5. **Where can this GitHub App be installed?** Only on this account.
6. **Create GitHub App.** On the next page, note the **App ID** (a number): `5093067`.
7. **Private keys** → **Generate a private key**. A `.pem` file downloads. Keep it safe; you will paste it in
   step 7 below and then you can delete the file.
8. Left menu → **Install App** → install on your account → **Only select repositories** → `gllona/slopper`.
9. In the repo: **Settings → Secrets and variables → Actions**:
   - **Secrets** tab → **New repository secret** → name `BOT_APP_PRIVATE_KEY`, value: the whole content of the
     `.pem` file (including the `-----BEGIN … KEY-----` lines).
   - **Variables** tab → **New repository variable** → name `BOT_APP_ID`, value: the App ID.

## 2. Claude token (DESIGN §15.3)

On your machine (logged in to Claude Code with your Max account):

```bash
claude setup-token
```

Copy the token it prints. In the repo: **Settings → Secrets and variables → Actions → Secrets → New repository
secret** → name `CLAUDE_CODE_OAUTH_TOKEN`, value: the token.

The token expires: put a reminder in your calendar a few days before the date it shows.

## 3. Cloudflare API token and the `production` environment

1. https://dash.cloudflare.com/profile/api-tokens → **Create Token** → **Create Custom Token**.
   - Name: `slopper-pages-deploy`
   - Permissions: **Account → Cloudflare Pages → Edit** (only this one)
   - Account Resources: **Include → Gllona@gmail.com's Account**
   - Continue → Create → copy the token.
2. In the repo: **Settings → Environments → New environment** → `production`.
   - **Deployment branches and tags** → **Selected branches and tags** → add rule `main`.
   - **Environment secrets** → **Add secret** → `CLOUDFLARE_API_TOKEN`, value: the token.

## 4. Repository variables

**Settings → Secrets and variables → Actions → Variables** (not secrets; they are not sensitive):

| Name | Value | Notes |
|---|---|---|
| `BOT_APP_ID` | (from step 1) | |
| `CLOUDFLARE_ACCOUNT_ID` | your account ID | `npx wrangler whoami` shows it: `4a00d9e9b5679255488b2f4b5a3da8fb` |
| `DRY_RUN` | `true` | Until launch (M8). PRs are labeled `dry-run` and never published |
| `VETO_MODE` | `window` | `off` / `window` / `approve` |
| `PUBLISH_HOUR_UTC` | `19` | 14:00 in UTC-5: your veto deadline |
| `VETO_MIN_MINUTES` | `60` | minimum PR age before publishing |
| `SITE_URL` | `https://slopper.logicos.org` | |
| `LAUNCH_DATE` | *(leave unset until M8)* | date of Slopper #1 |

## 5. Ruleset for `main`

**Settings → Rules → Rulesets → New ruleset → New branch ruleset**:

- Name: `main`. Enforcement: **Active**.
- **Bypass list** → **Add bypass** → your `slopper-bot` app (so the publisher can merge after the checks pass).
- Target branches → **Include default branch**.
- Rules:
  - **Restrict deletions**, **Block force pushes**
  - **Require a pull request before merging** (0 required approvals is fine: you merge your own PRs)
  - **Require status checks to pass** → add check **`ci`**
- Create.

## 6. Actions settings

**Settings → Actions → General**:

- **Workflow permissions:** **Read repository contents and packages permissions** (the default read-only token).
- **Fork pull request workflows from outside collaborators:** **Require approval for all external contributors**.

## 7. Labels

**Actions → setup-labels → Run workflow** (on `main`). It creates the labels from DESIGN §17.5. It is safe to
run again.

## 8. First dry run

1. **Actions → generate → Run workflow**, leave the date empty (yesterday) or type one. It takes ~5–10 minutes.
2. A PR `Slopper — <date> — <motto>` appears with the labels `slopper`, `fresh`/`continuation`, `dry-run`,
   and CI runs on it.
3. **Actions → publish → Run workflow**: with `DRY_RUN=true` it only reports what it would merge, and deploys
   `main` if it changed since the last deploy.
4. Close the dry-run PR (with **Delete branch**) when you have looked at it; try the `regenerate` label once.

If something fails, the workflow opens an issue labeled `pipeline-failure` with a link to the logs.

## 9. Phone notifications

The bot requests **your review** on every daily PR and sends a **Telegram** message with the still image, the
motto and phrase, the critic and Cop results, your deadline, and buttons to open the PR. To approve or veto,
open the PR in **GitHub Mobile** and add the `approved` or `veto` label. Nothing listens for Telegram messages:
the workflows only send.

1. **GitHub Mobile:** install it, sign in, then **Profile → Settings → Notifications**: enable push notifications
   and turn on **Reviews requested** (and **Participating**).
2. **Telegram bot:** in Telegram, talk to **@BotFather** → `/newbot` → pick a name → copy the **token**.
   Then open your new bot and send it any message (so it is allowed to write to you).
3. **Your chat id:** on your machine (never paste the token in chats or issues):
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" | grep -o '"chat":{"id":[-0-9]*' | head -1
   ```
   The number after `"id":` is your chat id.
4. In the repo, **Settings → Secrets and variables → Actions**:
   - Secret `TELEGRAM_BOT_TOKEN` = the token.
   - Variable `TELEGRAM_CHAT_ID` = your chat id.
   - Variable `REVIEWER_UTC_OFFSET` = `-5` (only used to show the deadline in your local time).

Without these, the workflows skip the Telegram step and keep working.

## 10. The clock: `slopper-clock` (Cloudflare Worker)

GitHub's own cron started our runs up to 7 hours late. This tiny Worker starts `generate` at 11:07 UTC
(06:07 for you, backup at 13:07) and `publish` every hour at :05, on the minute. It has **no web address**: it only
calls GitHub's API. GitHub's own schedules stay as extra backups; duplicate runs skip themselves.

1. **GitHub token** — https://github.com/settings/personal-access-tokens/new (fine-grained):
   - Name: `slopper-clock` · Expiration: Gorka chose **No expiration** (2026-09-30): the token can only start/cancel
     workflow runs in this repo; if it leaks, revoke it here and store a new one (step 2).
   - Repository access: **Only select repositories** → `gllona/slopper`
   - Permissions → Repository → **Actions: Read and write** (nothing else)
   - Generate → copy the token (`github_pat_…`).
2. **Store it in the Worker** — in the project folder (claude-box, where wrangler is logged in), paste the token
   when asked (it is not echoed):
   ```bash
   npx wrangler secret put GITHUB_TOKEN --config infra/clock/wrangler.toml
   ```
   The first time, wrangler may offer to create the Worker `slopper-clock`: answer yes.
3. **Deploy** (Claude Code can do this step; re-run after changing `infra/clock/`):
   ```bash
   npx wrangler deploy --config infra/clock/wrangler.toml
   ```
4. **Check**: Cloudflare dashboard → Workers & Pages → `slopper-clock` → Settings → Trigger events lists the
   3 cron triggers; Logs show a line per trigger ("dispatched generate.yml").

## 11. Instagram: `@sloppertoday` (zero cost, done 2026-10-01)

The `slopper-clock` Worker posts each published slopper (square `still.jpg` + caption) within 15 minutes of
the site publish. Your daily approval covers it. Uses the free "Instagram API with Instagram Login"; the Meta app
stays in **Development mode** with the account as **Instagram Tester**, so no App Review is needed.

1. Instagram app → **Add account → Create new account** (`sloppertoday`), profile picture from
   `.out/avatars/2-robot-riso.jpg`, bio and link `https://slopper.logicos.org`.
   **Settings → Account type and tools → Switch to professional account → Creator** (no Facebook Page).
2. https://developers.facebook.com → log in with Facebook (Meta allows one personal account per person: use
   your own) → **My Apps → Create app** "Slopper", use case **Manage messaging & content on Instagram**, no
   business portfolio. App id: `1799884511141809`.
3. **Instagram → API setup with Instagram login** →
   https://developers.facebook.com/apps/1799884511141809/use_cases/customize/API-Setup/?product_route=instagram-business&use_case_enum=INSTAGRAM_BUSINESS&selected_tab=API-Setup
   → **Generate access tokens → Add account** → role **Instagram Tester** (the last one, not "Tester") →
   `sloppertoday`.
4. Accept the invite **on the web, logged in as sloppertoday** (the phone app does not show it):
   https://www.instagram.com/accounts/manage_access/ → **Tester invites** → Accept.
5. Back on API setup: note the **Instagram user ID** (`17841424224659685`, in `infra/clock/wrangler.toml`),
   **Generate token**, approve the permissions as sloppertoday, then in claude-box:
   ```bash
   npx wrangler secret put IG_ACCESS_TOKEN --config infra/clock/wrangler.toml
   npx wrangler secret put TELEGRAM_BOT_TOKEN --config infra/clock/wrangler.toml
   ```
   (`TELEGRAM_CHAT_ID` is also a Worker secret, so it stays out of the public repo.)
6. **Never click "Go live" / "Publish" on the Meta app.**

The token lasts 60 days; the Worker refreshes it weekly and keeps the new one in its KV store, so there is no
manual renewal. If Instagram ever rejects it (password change, removed tester), Telegram says so: generate a new
token (step 5) and run the first `wrangler secret put` again; then delete the KV key `ig:token`
(`npx wrangler kv key delete ig:token --namespace-id 3ebc720c110448b5ac1b590389c7bf7f --remote`).
