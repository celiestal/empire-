# CLAUDE_HANDOFF.md: Empire project handoff

Written 2026-11-13 ~06:00 UTC at the end of a Claude Code session, from an audit of the actual code on branch
`claude/scalp-bot-daily-summary-fxn5vn`. Everything marked **Verified** was checked in that session by running it.
Anything else is labelled as coming from earlier notes, an assumption, or unfinished work.

---

## 1. What this project is

The repo `celiestal/empire-` holds two products that share one Next.js codebase.

1. **Empire, a website for short-form video creators** (live per earlier notes at https://empire-zeta-ecru.vercel.app):
   - plan, script and auto-edit vertical videos
   - auto-post them to Instagram, Facebook and YouTube
   - an owner-only "AI agent team" that proposes and runs business work behind approval gates
   - a public "Done For You" video-editing service that collects leads
   - Basic is free; Premium is paid through Stripe; the owner gets everything free.
2. **A fake-money crypto trading bot.** It has two parts:
   - a simple moving-average backtester page at `/paper` (owner only)
   - a separate research and forward-test system under `lib/paper/scalp/` and `scripts/paper/`. It tests several scalping and
     trend methods on real Crypto.com prices, buy and short, with strict risk limits.

### Owner's vision and standing instructions (from the conversation history)
- Website: grow Empire, deploy the built features once the owner says "deploy", and get the first ~4 Done For You clients
  (goal $1,000/month).
- Trading bot:
  - "Build a bot that trades and scalps using several methods with minimal risk."
  - Paper trade it on live prices, stress test it, keep improving it, and report daily.
  - "If it fails, find out why and fix it. If it wins, find out why and how to win in other conditions."
  - Shorting is allowed. The bot should read the market and choose the best method itself, based on what trading research teaches.
- **Real money:** possible later, never without a separate explicit decision from the owner. Preconditions agreed so far:
  - weeks of clearly positive forward paper results
  - a separate small account
  - a trade-only API key with withdrawals off
  - hard loss limits
  - a weekly profit split (e.g. 70% to holdings, 30% kept for trading)

---

## 2. Technical stack

| Layer | What | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router, server actions, `next` ^16.4.6), React 19 | `AGENTS.md`: this Next.js version has breaking changes. **Read `node_modules/next/dist/docs/` before writing Next code.** `next dev` rewrites `AGENTS.md`; commit that block, don't fight it. |
| Language | TypeScript 7 (`tsc --noEmit`), ESM (`"type": "module"`) | Path alias `@/` = repo root. |
| Tests | Vitest 5 (`npm test`) | 11 files, 59 tests. |
| Storage | One JSON-document table `records(collection, id, data jsonb, …)` | Back ends: Postgres (`DATABASE_URL` or `POSTGRES_URL`), Supabase (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`), or in-memory. |
| Auth | Own email + password (scrypt) with an HMAC-signed session cookie | `lib/auth.ts`, `lib/session.ts` |
| Payments | Stripe subscriptions + webhook | `lib/billing.ts`, `app/api/billing/webhook/route.ts` |
| AI (paid) | Anthropic SDK; model id in `lib/ai.ts` (`MODEL`), beta tool runner, server-side fallback beta, web-search tool | Only for Premium AI scripts and the CEO agents. **Not verified against the live API this session.** |
| AI (free) | Google Gemini free tier over plain `fetch` (`lib/free-ai.ts`) | Optional; templates are used when there's no key. |
| Video | ffmpeg (`ffmpeg-static` on Vercel, system ffmpeg in Docker), DejaVu Bold font bundled | `lib/video/*` |
| File storage | Vercel Blob (`@vercel/blob`), browser direct upload | `app/api/upload/route.ts` |
| Hosting | Vercel (current, Hobby plan, `vercel.json` cron) or Railway/any Docker host (`Dockerfile`, `railway.json`) | |
| Trading data | Crypto.com Exchange **public** REST API (`api.crypto.com/exchange/v1/public`), no keys | `lib/paper/market.ts`, `lib/paper/scalp/feed.ts` |
| Trading scripts | `tsx` CLI scripts; data in `.paper-data/` (gitignored, not committed) | |

---

## 3. Repository, branches, PRs

**Default branch on GitHub:** `claude/project-thread-wi5r18`. There is no `main`.

| Branch | What it is | Relationship |
|---|---|---|
| `claude/project-thread-wi5r18` | What's deployed on Vercel (commit `ee286e1`, per `docs/handoff/site.md`) | Ancestor of every branch below |
| `claude/dreamy-brahmagupta-ytbdi5` | + Done For You service, `/paper` page, website handoff notes (`5af1838`). **Not deployed.** | Ancestor of the next two |
| `claude/determined-franklin-v7q3kf` | + scalping bot, walk-forward research, live forward test, first daily summary (`f3a9dcf`). **The other Claude session's scheduled tasks commit here.** | Ancestor of the next |
| `claude/scalp-bot-daily-summary-fxn5vn` | + regime detector, trend-following method, hourly-data research, this handoff (**newest, superset of all the above**) | |
| `claude/project-thread-scj9rn` | Promo video maker `marketing/promo/` (Python `render.py`, specs, fonts, screenshots) | **PR #1** into `project-thread-wi5r18`, open, not merged, not in the other branches |

> Recommended working branch for the next session: start from `claude/scalp-bot-daily-summary-fxn5vn` (it contains everything except
> PR #1). If the scheduled tasks have since pushed new commits to `claude/determined-franklin-v7q3kf`, merge them in first
> (`git fetch origin claude/determined-franklin-v7q3kf && git merge origin/claude/determined-franklin-v7q3kf`).
> Daily summary files under `docs/handoff/daily/` may conflict; keep both versions' content.

---

## 4. Architecture and file map

```
app/                         Next.js App Router
  layout.tsx                 Header nav; owner-only links (Agents, Paper Trading) via isOwner()
  page.tsx                   Landing page
  actions.ts                 ALL server actions (454 lines): auth, billing, studio, posts, autopilot, owner settings,
                             kill switch, approvals, CEO cycle, service leads
  login/ signup/ account/    Auth pages; signup closed in production without a database (lib/env.ts accountsOpen)
  pricing/                   Basic vs Premium; Stripe checkout via startCheckout
  studio/                    Content Studio (gap list, weekly planner, settings, social accounts, autopilot toggle)
  studio/posts/[id]/         Post editor: script/caption/hashtags, AI or free script, variants, video upload, "post now"
  editor/                    Auto Editor UI (EditorForm.tsx uploads raw take to Blob, then calls /api/editor/render)
  dashboard/                 Owner: CEO agents, approvals, budget/limits, kill switch, autopilot log
  services/ services/leads/  Public Done For You page + owner lead tracker
  paper/                     Owner: moving-average backtest on the last 300 Crypto.com candles
  api/autopilot              Daily cron (vercel.json 13:00 UTC, Bearer CRON_SECRET): runAutopilot + CEO cycle if AGENTS_AUTORUN=on
  api/cycle                  CEO cycle only (Bearer CRON_SECRET, AGENTS_AUTORUN=on). Not scheduled in vercel.json.
  api/editor/render          Downloads raw take from our Blob store, runs ffmpeg, uploads result, can attach to a post
  api/upload                 Issues Vercel Blob client-upload tokens (editor uploads need Premium; post uploads need ownership)
  api/social/[platform]/connect|callback   OAuth for instagram/facebook/youtube; signed state; tokens encrypted at rest
  api/billing/webhook        Stripe signature-verified webhook → user.plan premium/free

lib/
  types.ts                   Domain model (see §6)
  store/                     Store facade + Postgres/Supabase/Memory back ends (see §6)
  auth.ts session.ts         scrypt hashing, HMAC session tokens, isOwner/hasFeature, requireUser/requireOwner
  env.ts site.ts             editorAvailable, databaseConfigured, accountsOpen; siteOrigin for OAuth redirects
  token-box.ts               AES-256-GCM encryption of social tokens with a key derived from AUTH_SECRET
  billing.ts                 Stripe checkout/portal; off unless STRIPE_SECRET_KEY + STRIPE_PREMIUM_PRICE_ID
  policy.ts scoring.ts       Agent policy gate (read/internal/gated, budget, kill switch); deterministic opportunity score
  ai.ts free-ai.ts           Anthropic client + model id; Gemini JSON helper
  agents/roles.ts            CEO + 10 specialist roles, tools allowed per role, GUARDRAILS prompt text
  agents/tools.ts            Agent tools (list_state, save/search_knowledge, record/select_opportunity, create/update_project,
                             create_agent, delegate, request_approval, add_content_idea), each passed through policy gate
  agents/runtime.ts          runAgent (beta toolRunner), ensureWorkforce, runCeoCycle
  agents/free-writers.ts     Free writer sub-agents (3 angles, picks best) and news→ideas, Gemini or templates
  content.ts content-ai.ts content-free.ts   Script template, hashtag rules/checker, AI (Anthropic) and free script writers
  planner.ts                 Fills the coming week's posting days from top ideas
  news.ts                    RSS news scouts (Google News, TechCrunch, Entrepreneur)
  autopilot.ts               Daily pipeline: news → ideas → plan week → write scripts → post due videos
  poster.ts social/*         Publishes to connected IG/FB/YT accounts; TikTok/X/LinkedIn deliberately unsupported (NOT_SUPPORTED)
  services.ts                Done For You packages ($150/$250/$450) and clientsFor goal math
  video/plan.ts ffmpeg.ts render.ts techniques.ts   Edit plan (pause cuts, zooms, captions, SFX, music duck, -14 LUFS) → ffmpeg graph
  paper/strategy.ts market.ts                       /paper page: SMA crossover backtest + candle fetch
  paper/scalp/                                      Trading research system (see §5)

scripts/
  auto-edit.ts               CLI for the auto editor (needs ffmpeg)
  paper/download.ts          Download candles: `tsx scripts/paper/download.ts [days] [markets] [timeframe]`
  paper/research.ts          Walk-forward research + stress tests + by-regime breakdown (env-driven, see §5)
  paper/live.ts              Forward paper test: `freeze` | `loop` | (no arg = one pass + report)

supabase/migrations/0001_init.sql   records table + RLS on (service role only)
docs/handoff/                site.md, trading-bot.md (old /paper page), scalp-bot.md (bot research log), daily/<date>.md
tests/                       auth, autopilot, content(-free), paper, paper-scalp, policy, postgres (skipped w/o PG_TEST_URL), regime, tools, video
Dockerfile railway.json vercel.json next.config.ts vitest.config.ts tsconfig.json .env.example
```

### How the website pieces interact
- Pages call **server actions** in `app/actions.ts`. Each action checks `requireUser`/`requireOwner`/`hasFeature`, then reads and writes the store through `getStore()`.
- **Premium gating** goes through `hasFeature(user, …)`: owner OR `plan === "premium"`. Stripe's webhook flips `plan`.
- **Autopilot** (`lib/autopilot.ts`) runs from the cron route or the "run now" action. It uses news, free-writers, planner and poster.
- **CEO agents** (`lib/agents/runtime.ts`) only run with an Anthropic key, and on a schedule only if `AGENTS_AUTORUN=on`:
  - Every tool call passes through `lib/policy.ts`.
  - Gated kinds (spend, outreach, deploy, contract, publish) only create an `Approval`.
  - Approving one records the decision, plus a ledger entry for spend. **Nothing is executed automatically.**
- **Auto editor:**
  1. The browser uploads to Blob.
  2. `/api/editor/render` fetches only `*.blob.vercel-storage.com` URLs and runs ffmpeg in `/tmp`.
  3. It uploads the result to Blob and optionally sets `post.videoUrl`.
- **Social posting:** the OAuth connect/callback stores an encrypted token. `publishPost` posts to each platform separately and retries only the ones that failed.

---

## 5. The trading bot in detail

### 5a. `/paper` page (website, owner only)
- `lib/paper/strategy.ts`: SMA crossover, all-in/all-out, long only, 0.1% fee, compared with buy-and-hold.
- `lib/paper/market.ts`: the last 300 candles, timeframes 15m/1h/4h/1D, markets BTC/ETH/SOL/XRP/DOGE vs USD.
- Not live (on the undeployed branch). Per earlier notes it was only checked with mocked prices. The Crypto.com feed itself has since been verified from the cloud sandbox via `scripts/paper/*`.

### 5b. Scalping and trend research system (`lib/paper/scalp/`, `scripts/paper/`)
| File | Purpose |
|---|---|
| `indicators.ts` | ema, sma, stdev, rsi, atr, priorHigh, rollingVwap, `resample(c, minutes, baseMinutes=1)` |
| `strategies.ts` | 5 methods. Each returns per-bar `EntrySignal {side, stopDist, targetDist, maxBars}` from closed candles only: `meanrev` (Bollinger+RSI dip-buy), `breakout` (range high + volume), `pullback` (EMA trend pullback), `vwap` (VWAP snap-back), `tsmom` (time-series momentum / trend following, added 2026-11-13). `shortSignals` makes the short version by running the rules on an inverted (1/price) chart. `applyRegime`/`applyRegimeShort` is an EMA trend filter (`regimeHours`). `mergeSides` merges long and short signals and skips a bar if both fire. |
| `engine.ts` | Pessimistic simulator: next-bar-open market entries + slippage + fee, stop fills with slippage or at the gap, limit targets, stop checked first when one candle hits both. Risk: 0.5% risk/trade, ≤100% equity (no leverage), min-edge filter (target ≥ 2× round-trip cost), min-stop filter (stop ≥ 4× cost), 2% daily loss stop, 30-bar cool-down after 3 losses, 10% kill switch. Defaults: fee 0.1%/side, slippage 0.02%. Also `monteCarloDrawdown`. |
| `regime.ts` | Regime detector (added 2026-11-13). Uses Kaufman efficiency ratio on hourly steps → `up`/`down`/`range`/`chop`/`unknown`. `applyRegimeSwitch` lets trend methods trade only with the trend and reversion methods only in a range. `METHOD_KIND` maps each method to trend or reversion. `REGIME_GRID` holds the search settings. |
| `feed.ts` | Crypto.com public candles (paged 300 at a time) + live bid/ask spread |
| `live-config.json` | **Frozen settings of the running forward test. Do not edit** (see warnings). 25 sleeves × $400 = $10,000. Every sleeve uses `mode: "both"`, on 5 coins. Methods: 1m vwap, 5m vwap, 15m pullback, 60m meanrev, 60m breakout. Clock started `2026-11-13T05:17:00Z`. |
| `scripts/paper/download.ts` | `tsx scripts/paper/download.ts 30` (1m, 30 days) or `tsx scripts/paper/download.ts 730 "" 1h` (2 years hourly) → `.paper-data/<MKT>_<tf>.json` |
| `scripts/paper/research.ts` | Walk-forward: tune on `TRAIN_DAYS` using all 5 coins together, trade the next `TEST_DAYS`, step forward; only out-of-sample results count. Stress tests: fee 0.25%/0.05%, slippage 3×, no cost filters, top 10% trades removed, Monte Carlo drawdown p95. Also per-regime P&L breakdown and time-in-regime. Env: `MARKETS, TFS, MODES, REGIMES, STRATS, SWITCH=1, RG=h,erT,erR, BASE=60, TRAIN_DAYS, TEST_DAYS, MIN_TRAIN_TRADES, OUT`. Default output `.paper-data/research.json` (which `live.ts freeze` reads). |
| `scripts/paper/live.ts` | `freeze` locks the PICKS from research.json into live-config.json and starts the clock. `loop` pulls new 1m candles each minute and writes `.paper-data/live/status.json`. No argument: replays every closed candle since the start through the same simulator and prints a report. Deterministic, so restarts don't change results. **Only supports 1m-based sleeves with a 10-day warm-up.** |

Run in the cloud sandbox with `NODE_USE_ENV_PROXY=1` (the environment `empire-` allows `api.crypto.com` only).

### 5c. Research results so far (all out-of-sample, fake money)
1. **30 days of 1m data to 2026-11-13** (coins -15% to -24%):
   - No method had a reliable edge; the best were break-even (PF 0.92–1.05).
   - 1m scalping can't beat 0.1% fees (~0.24% round trip, bigger than a typical 1m move).
   - The cost filters were the biggest fix: losses went from -10–20% to 0–2% per coin.
2. **Regime detector** (30 days, 5/15/60m):
   - Time in regime: range ~40%, chop ~30%, down ~20%, up only 3–11%.
   - Most losses were trades opened in down-trends, shorts included (jerky falls, bounces hit the stops).
   - Letting the tuner switch the detector on or off gave the same or slightly worse results.
   - Forced on, it helped some methods (15m VWAP -1.12% → -0.02%, 60m pullback -1.99% → -0.01%) and hurt others (15m pullback -0.34% → -1.37%, 60m breakout -0.02% → -0.51%).
   - **Not adopted.** The trend half is untested because there were almost no up-trends.
3. **2 years of hourly data** (90-day tune / 30-day trade, 21 windows, Feb 2025–Nov 2026, coins -30% to -76%):
   - Every 1h method lost (-1.7% to -30%).
   - **4h breakout long: +3.1%/coin** (PF 1.20, 10/21 windows up, all its profit from up-trends).
   - 4h breakout long+short: +2.3%. 4h `tsmom` long+short: +0.8%.
   - 4h reversion methods: -2% to -7%. Daily bars: too few trades to judge.
   - The edge is **thin and fragile**: breakout goes negative at 0.25% fees or without its top 10% of trades.
4. **External research the owner asked for:**
   - Time-series momentum / trend following on longer bars has the most support in crypto, and the long side is stronger than the short side.
   - Time-of-day effects don't persist.
   - ML/AI intraday models usually fail out of sample.
   - Walk-forward with costs is the right safeguard.
   - Full source list in the session summary and `docs/handoff/scalp-bot.md`.

### 5d. Live forward test status
- Started 2026-11-13 05:17 UTC. At 05:28 UTC: equity $10,000, 0 trades (expected so early). **Verified.**
- The live `loop` process runs in **another Claude session's container**, not this one. Whether it is still running is unknown here; the scheduled check-ins restart it.
- The test is a replay, so a fresh `NODE_USE_ENV_PROXY=1 npx tsx scripts/paper/live.ts` anywhere reproduces the results.

---

## 6. Data model (`lib/types.ts`, stored in `records`)
Every record is a JSON document keyed by `(collection, id)`. Settings are stored as a singleton (`collection='_singleton', id='settings'`).

Collections:
- Agent platform: `agents`, `opportunities`, `projects`, `tasks`, `approvals`, `knowledge`, `ledger`, `audit`
- Content and social: `socialAccounts`, `contentIdeas`, `contentPosts`, `contentProfiles` (id = userId), `news`, `autopilotRuns`
- Accounts and service: `users`, `leads`

Relationships are by id fields:
- `userId` on content records
- `projectId`, `agentId`, `opportunityId`, `parentId` on agent records
- `ideaId`, `approvalId` on posts

There are no foreign keys or migrations beyond the single table. The Postgres back end creates the table automatically.

Key types:
- `User`: email, scrypt hash, plan free/premium, stripeCustomerId
- `ContentPost`: script, caption, hashtags, platforms, scheduledFor, status, videoUrl, autoPost, scriptVariants, postResults
- `Approval`: kind, amountCents, status
- `Settings`: killSwitch, monthlyBudgetCents=0, perActionLimitCents=0, ownerGoals
- `Lead`

---

## 7. Configuration (names only, never put values in the repo or in chat)
From `.env.example`:

| Group | Variables |
|---|---|
| Required in production | `AUTH_SECRET` (32+ chars, also derives the token-encryption key), `OWNER_EMAIL` |
| Database (one) | `DATABASE_URL` / `POSTGRES_URL`, or `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| AI | `ANTHROPIC_API_KEY` (paid, Premium scripts + agents), `GEMINI_API_KEY`, `GEMINI_MODEL` (free) |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PREMIUM_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_PREMIUM_PRICE_LABEL` |
| Agents and cron | `CRON_SECRET`, `AGENTS_AUTORUN` (off by default) |
| Social | `INSTAGRAM_APP_ID/SECRET`, `FACEBOOK_APP_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `PUBLIC_URL` |
| Storage and editor | `BLOB_READ_WRITE_TOKEN`, `EDITOR_ENABLED`, `EDITOR_FONT_FILE` |
| Tests | `PG_TEST_URL` (optional; runs the Postgres store test) |

Changing `AUTH_SECRET` logs everyone out **and makes stored social tokens undecryptable**.

Local run: `npm install`, then `cp .env.example .env.local` (set AUTH_SECRET and OWNER_EMAIL), then `npm run dev`. With no database, data lives in memory.

---

## 8. External automations (outside the repo)
Scheduled tasks on the owner's account (managed with the claude-code-remote trigger tools):

| Name | When | Fires into | What |
|---|---|---|---|
| Scalping bot check-ins | 11:20, 17:20, 23:20 UTC on 2026-11-13 (one-shot) | session `session_0117265CckyVPQ1fK7weMWEg` | Restart `live.ts loop` if down, one-line status |
| Scalping bot 24h report | 2026-11-14 05:30 UTC (one-shot) | same session | Full report, diagnose why, improve via walk-forward, maybe re-freeze, push to `claude/determined-franklin-v7q3kf` |
| Daily handoff summary | daily 06:13 UTC | same session | Writes `docs/handoff/daily/<date>.md`, pushes to `claude/determined-franklin-v7q3kf` |
| Daily Empire promo pack | daily 07:41 New York | new session each time | Renders promo videos (`marketing/promo` from PR #1 branch), uploads to Google Drive, emails 10 X drafts to the owner. Never posts publicly. |
| Hourly outreach email / Check outreach replies | daytime hourly / every 3h | session `session_01TabUaVsojfXYWXvgESGJxr` | Cold-email outreach CRM for local businesses in a **separate Supabase project** (not this repo's store), via Gmail |

That session was sent two messages with this session's findings (regime detector, hourly research).

---

## 9. Status

### Verified this session (2026-11-13)
- `npx vitest run`: **58 passed, 1 skipped** (Postgres test, needs `PG_TEST_URL`).
- `npx tsc --noEmit`: clean.
- `npx next build`: succeeds, 20 routes.
- Crypto.com public API reachable from the sandbox. 30 days of 1m data and 2 years of 1h data downloaded for 5 coins.
- `live.ts` one-pass replay works. Research scripts run (1m with `SWITCH=1` needs `TFS=5,15,60`, see bugs).
- Regime detector unit tests (4) pass.

### Built and tested earlier (per `docs/handoff/site.md`, not re-verified in a browser this session)
- **Live:** Content Studio, AI scripts.
- **Built, not deployed:** Auto Editor, auto poster (IG/FB/YT), autopilot, CEO agents, Done For You + leads, `/paper`.
- Stripe code is written but **not set up**.

### Partially implemented
- Agent "approved actions" are recorded only. No outbound execution (emails, purchases, deploys).
- Captions are timed from script text, not real speech-to-text.
- TikTok, X and LinkedIn posting are intentionally unsupported (platform approval needed).
- The trading bot has no edge proven out of sample. The regime detector and `tsmom` exist but aren't in the live test.
- `live.ts` can't run 4h sleeves yet: it is 1m-only with a 10-day warm-up, and `tsmom` 4h needs up to 28 days.

### Not started
- Deploying the newer branches (needs the owner's "deploy" and a database).
- Real-money trading (forbidden without an owner decision).
- Email notification for new leads, Stripe links for service packages, mobile nav menu (ideas in site.md).

### Known bugs, limits and tech debt
1. **Security, owner takeover before first sign-up:** owner rights = "signed-up email equals `OWNER_EMAIL`", and there is no email verification. Once a database is connected in production, sign-ups open. If anyone registers with the owner's email first, they get owner powers. **The owner must sign up immediately after adding the database, or add verification first.**
2. No rate limiting on log-in, sign-up or the public lead form (only a honeypot on leads).
3. `Store.list` loads up to 1000 rows per collection and filters in memory. `userByEmail` scans users, which breaks past 1000 users. `audit` and `news` grow without limit.
4. `PostgresStore` uses `ssl: { rejectUnauthorized: false }` for remote hosts (encrypted but unauthenticated TLS).
5. `/api/cycle` isn't scheduled. The single cron `/api/autopilot` also runs the CEO cycle if `AGENTS_AUTORUN=on`. The README says the "daily agent cycle" is scheduled, which only applies through `/api/autopilot`.
6. `research.ts` with `SWITCH=1` runs out of memory on 1m (huge grid × 43k bars). Use `TFS=5,15,60` or a bigger heap.
7. The research grids are fairly large compared with the data (multiple-testing risk). There's no deflated Sharpe or PBO yet.
8. Trading: the forward test sizes at 0.5% risk per trade, so returns are small in absolute terms. That's by design.
9. `AGENTS.md` is regenerated by `next dev`. Commit it rather than reverting it.
10. The Anthropic model id, beta names and web-search tool version in `lib/ai.ts` / `lib/agents/runtime.ts` haven't been tested against the live API in a while.

### Decisions and why
- **Single JSON `records` table:** one schema works across Postgres, Supabase and memory, with no migrations to keep in sync.
- **Approval gates and $0 default budget:** agents must never spend, contact or publish without the owner.
- **The free path (Gemini + templates + RSS):** the owner wanted everything to run without paid AI.
- **Fake money only:** the owner saw hyped "AI bot" claims, and real money needs a separate decision.
- **Pessimistic simulator** (stop first, next-bar fills, fees and slippage): avoids flattering backtests.
- **Walk-forward, judged out of sample only, tuned on all coins together:** limits overfitting.
- **Frozen live config, replayed deterministically:** fair forward testing that survives container restarts.
- **Regime detector not adopted:** no out-of-sample improvement.
- **The 1m live test is left running despite weak research:** it measures real-time behaviour and spreads, and the owner approved it.

### Tried and abandoned
- 1m scalping as the main approach: fees dominate.
- A regime-switch layer: no out-of-sample gain on 30 days. Revisit after a real up-trend.
- Daily-bar trend following: too few trades in 2 years.

---

## 10. Roadmap

### Critical (before further development)
1. **Reconcile branches.**
   - What: merge any new commits from `claude/determined-franklin-v7q3kf` (the scheduled report and summaries) into the working branch.
   - Why: two sessions write to two branches; without this, work gets duplicated or conflicts.
   - Files: `docs/handoff/*`, `lib/paper/scalp/*`, possibly `live-config.json`.
   - Verify: `git log` shows both histories, and `npm test` and `npx tsc --noEmit` pass.
2. **Close the owner-takeover gap before any deploy with a database.**
   - What: require a one-time owner claim code (e.g. an `OWNER_CLAIM_CODE` env var checked on sign-up when the email equals `OWNER_EMAIL`) or email verification.
   - Why: see bug 1.
   - Files: `app/actions.ts` (signUp), `lib/auth.ts`, `.env.example`, `tests/auth.test.ts`.
   - Verify: a unit test where signing up as the owner without the code is refused. Ask the owner before deploying.
3. **Read the 2026-11-14 05:30 report** from the other session before changing any trading code. It may re-freeze the live test.

### High priority
4. **Forward paper test for the 4h set.**
   - What: run 4h breakout long, 4h breakout long+short and 4h `tsmom` long+short next to the 1m test, in a separate config file and status directory.
   - Why: the only methods positive over 2 years, and they need forward evidence.
   - Files: `scripts/paper/live.ts` (generalize: per-sleeve base timeframe, hourly feed, warm-up ≥ 30 days, config path argument), new `lib/paper/scalp/live-4h-config.json`.
   - Prerequisite: the owner said yes. The last message asked "start it?" and got no answer before this handoff. **Confirm first.**
   - Verify: a one-pass replay prints a report, a restart doesn't change results, and unit tests cover the config loader.
5. **Harden the research against overfitting.**
   - What: smaller grids, deflated Sharpe / probability of backtest overfitting, and a final untouched holdout period.
   - Why: thin edges like +3% over 21 months can come from multiple testing.
   - Files: `scripts/paper/research.ts`.
   - Verify: the report includes the PBO and holdout results.
6. **Owner actions for the website** (owner's decision):
   - add the Neon Postgres database in Vercel, then sign up as the owner right away
   - reply "deploy"
   - set up Stripe in test mode
   - merge PR #1

### Medium
7. Rate limiting for log-in, sign-up and leads (`app/actions.ts`; a store-backed counter per IP/email). Verify with tests.
8. Store scaling: indexed lookups (e.g. a `users_by_email` collection or a JSON index query) instead of list-and-filter. Files: `lib/store/*`. Verify with the postgres test (`PG_TEST_URL`).
9. Email the owner on a new lead; Stripe payment links for the service packages (`app/actions.ts requestService`, `lib/services.ts`).
10. Trading: a volatility-targeted position size and trailing exits for `tsmom` (the engine only has stop/target/time today). Validate walk-forward on the 2-year hourly data.

### Low
11. Mobile nav menu (header overflows with 7+ links).
12. Speech-to-text caption timing for the auto editor.
13. Execute approved agent actions through real integrations, each still behind an approval.
14. Bring the `/paper` page's research view onto the site (show `research.json` / live status).

**Recommended immediate next task:** #1 (merge the branches), then #3 (read the 05:30 report). Then ask the owner about #4 and propose the `live.ts` generalization plan before writing code.

---

## 11. Testing instructions
```bash
npm ci
npm test                         # vitest: expect 58 passed, 1 skipped
npx tsc --noEmit                 # clean
npx next build                   # 20 routes
PG_TEST_URL=postgres://… npm test   # also runs the Postgres store test

# Trading research (cloud sandbox needs the proxy flag)
NODE_USE_ENV_PROXY=1 npx tsx scripts/paper/download.ts 30            # 1m, 30 days
NODE_USE_ENV_PROXY=1 npx tsx scripts/paper/download.ts 730 "" 1h     # 1h, 2 years
npx tsx scripts/paper/research.ts                                     # 1m-based, 1/5/15/60m
SWITCH=1 TFS=5,15,60 npx tsx scripts/paper/research.ts                # with the regime detector
BASE=60 TFS=60,240 TRAIN_DAYS=90 TEST_DAYS=30 OUT=.paper-data/research-1h.json npx tsx scripts/paper/research.ts
NODE_USE_ENV_PROXY=1 npx tsx scripts/paper/live.ts                    # replay + report of the forward test
```

---

## 12. Warnings: things NOT to change by accident
- **Never connect real money, exchange keys or order placement** without a new, explicit decision from the owner.
- **Don't edit `lib/paper/scalp/live-config.json`** or run `live.ts freeze` unless you are deliberately starting a new forward test. Keep the old results, and tell the owner.
- **Don't deploy** (Vercel, Railway) or merge to the default branch without the owner saying "deploy". **Don't merge PR #1** without the owner.
- Keep the agent safety rails: policy gate, approvals for spend/outreach/deploy/contract/publish, $0 default budgets, kill switch, `AGENTS_AUTORUN` off by default, deterministic opportunity scoring.
- Keep the simulator pessimistic (stop first, next-bar fills, fees, slippage) and judge changes **only on out-of-sample** results.
- Don't change `AUTH_SECRET` handling or token encryption without a migration plan (stored social tokens depend on it).
- Never write secrets, keys or the owner's personal details into the repo, commits or chat.
- Don't edit or delete the scheduled tasks, or the outreach CRM's Supabase project, unless the owner asks.
- Remember the Next.js 16 caveat in `AGENTS.md`: read `node_modules/next/dist/docs/` before writing Next code.
- `.paper-data/` is gitignored on purpose (large). Re-download it rather than committing it.

---

## INSTRUCTIONS FOR THE NEXT CLAUDE CODE SESSION
1. **Read this file (`CLAUDE_HANDOFF.md`) completely before making any changes.** Then read `docs/handoff/scalp-bot.md`, `docs/handoff/site.md` and the newest file in `docs/handoff/daily/` (check `claude/determined-franklin-v7q3kf` too, since scheduled runs push there).
2. **Inspect the actual codebase independently** to verify this handoff: `git log --oneline`, the file map in §4, and run `npm test`, `npx tsc --noEmit` and `npx next build`.
3. **Understand the architecture and existing functionality**: server actions → store; policy-gated agents; the trading research pipeline (download → research → live).
4. **Identify and list any discrepancies** between this document and the code or branches, and tell the owner about the important ones.
5. **Never assume an unfinished feature is implemented.** §9 says what's verified, what's partial and what's not started.
6. **Don't rewrite, replace or restructure working code without good reason.**
7. **Preserve existing functionality and the established design decisions** (§9 decisions, §12 warnings) unless there is a strong technical reason, and explain it first.
8. **Identify the highest-priority next task** (default: §10 Critical #1 merge branches → #3 read the 05:30 report → ask the owner about the 4h forward test).
9. **Explain the proposed implementation approach to the owner before making significant changes**, especially anything touching live trading config, deploys or security.
10. **Continue systematically:** small commits on a `claude/...` branch, tests and typecheck after each change, walk-forward validation for any trading change, and progress written to `docs/handoff/` (update this file when something major changes).
