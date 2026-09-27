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
