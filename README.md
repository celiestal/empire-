# Empire

A website for planning, writing and editing short-form videos, plus an AI agent team that runs the owner's online business with approval gates.

## What's in it

| Area | Who | What it does |
| --- | --- | --- |
| **Content Studio** (`/studio`) | Everyone (free) | Content gap list, weekly planner (plan Sunday, film Monday, post Mon/Wed/Fri by default), script template, hashtag rules (3 to 5 tags about the video, brand + niche tags kept consistent, no #fyp/#viral/#explore), saved social handles. |
| **AI scripts** | Premium + owner | Three hook options, a hook-setup-value-close script sized to the target length, a caption that asks a question, and video-specific hashtags. |
| **Auto Editor** (`/editor`) | Premium + owner | Upload a raw take, get a 1080x1920 edit: pauses cut, punch-in zooms, opening zoom, word-by-word captions with highlighted words, on-screen hook, whoosh/hit sound effects, optional ducked music, progress bar, -14 LUFS loudness. See `lib/video/techniques.ts` for the research behind each step. |
| **Agents** (`/dashboard`) | Owner only | CEO Agent plus 10 specialist agents (research, business development, product, marketing, sales, finance, operations, legal, customer relations, innovation). The CEO can hire new custom agents and delegate. |
| **Plans** (`/pricing`) | | Basic is free. Premium is paid through Stripe. The `OWNER_EMAIL` account gets everything free. |

## Safety rails for the agents

- Agents may research, plan, record and write on their own.
- Anything that **spends money, contacts people, publishes, deploys or signs** becomes an approval request on the dashboard. Nothing happens until the owner approves.
- Monthly budget and per-purchase limit (both $0 by default, so no spending is possible until the owner sets them).
- Kill switch: one click stops every agent write.
- Scheduled runs only happen when `AGENTS_AUTORUN=on`.
- Opportunity scores are computed by code (first-year return / risk), not by the model.

## Run it locally

```bash
npm install
cp .env.example .env.local   # fill in at least AUTH_SECRET and OWNER_EMAIL
npm run dev
```

Without Supabase settings the site keeps data in memory (resets on restart).

Auto-edit from the command line (needs ffmpeg):

```bash
npx tsx scripts/auto-edit.ts raw.mp4 out.mp4 --hook "You're pricing this wrong" --script script.txt --emphasis "wrong,value"
```

## Deploy on Railway (recommended)

1. New Project, then Deploy from GitHub repo, pick this repo. `railway.json` tells Railway to build the `Dockerfile` (which installs ffmpeg for the auto editor).
2. In the same project, add a **Postgres** database.
3. On the web service's Variables tab set:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `AUTH_SECRET` = `${{secret(64)}}`
   - `OWNER_EMAIL` = your email
   - `ANTHROPIC_API_KEY` = your key (for AI scripts and agents)
4. Settings, Networking, Generate Domain.

The `records` table is created automatically on first request.

Other hosts: any Docker host works the same way. On Vercel everything except the auto editor works (no ffmpeg there), and `vercel.json` schedules the daily agent cycle. With Supabase instead of Postgres, run `supabase/migrations/0001_init.sql` and set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Payments

In Stripe, create a monthly Premium price, set `STRIPE_PREMIUM_PRICE_ID`, and add a webhook to `/api/billing/webhook` for `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`.

## Checks

```bash
npm test          # unit tests
npm run typecheck
npm run build
```

## Not done yet

- Posting straight to Instagram, TikTok, YouTube etc. needs each platform's developer app approval. Until then the studio gives you the caption and hashtags to paste.
- Captions are timed from your script text. Word-accurate timing needs a speech-to-text service.
- Approved agent actions (emails, purchases, deploys) are recorded but carried out by the owner; no outbound integrations are wired up yet.
