# Handoff: Empire website

Last updated 2026-11-13. Read this first in a new chat about the website.

## Where things are
- Live site: https://empire-zeta-ecru.vercel.app (Vercel, Hobby plan)
- Repo: `celiestal/empire-`
- Branches:
  - `claude/project-thread-wi5r18`: the site as currently deployed (latest commit `ee286e1`, auto editor on Vercel with bundled ffmpeg).
  - `claude/dreamy-brahmagupta-ytbdi5`: that branch plus the new "Done For You" service and the Paper Trading page (not deployed yet).
  - PR #1 (`claude/project-thread-scj9rn` into `claude/project-thread-wi5r18`): promo video maker under `marketing/promo/`. Open, clean, not merged.
- Stack: Next.js 16 (App Router, server actions; read `node_modules/next/dist/docs/` before coding, see `AGENTS.md`), TypeScript, Vitest, Stripe, Postgres/Supabase/in-memory store (`lib/store`).

## What's built
| Area | Who | Status |
| --- | --- | --- |
| Content Studio `/studio`: gap list, weekly planner, script template, hashtag checker, social handles | Everyone (free Basic) | Live |
| AI scripts, hooks, captions (`lib/content-ai.ts`, free fallback `lib/content-free.ts`) | Premium + owner | Live |
| Auto Editor `/editor`: cuts pauses, zooms, word captions, sound, progress bar, -14 LUFS | Premium + owner | Built and tested, waiting for owner's "deploy" |
| Auto poster to Instagram, Facebook, YouTube (`lib/poster.ts`, `lib/social/*`) | Owner | Built and tested, waiting for "deploy" |
| Daily autopilot and AI agents (CEO + 10 specialists, approval gates, kill switch, $0 budget by default) `/dashboard`, cron `/api/autopilot` at 13:00 UTC | Owner | Built and tested, waiting for "deploy" |
| Plans `/pricing`: Basic free, Premium via Stripe, `OWNER_EMAIL` gets everything free | | Built; Stripe not set up |
| **Done For You `/services`** (new): sells monthly video editing to local businesses: Starter $150 (4 videos), Growth $250 (8), Pro $450 (12). Form saves a `Lead` (spam honeypot). | Public | On `dreamy-brahmagupta` branch only |
| **Leads `/services/leads`** (new): list of requests, status new/contacted/won/lost, $ won per month vs $1,000 goal | Owner | On `dreamy-brahmagupta` branch only |
| Daily promo email: 10 X drafts + new promo videos in Google Drive, every morning to the owner's Gmail. Nothing posts automatically. | Owner | Confirmed working |

Key files for the new service: `lib/services.ts` (packages, `clientsFor`), `app/services/page.tsx`, `app/services/leads/page.tsx`, `requestService` and `updateLead` in `app/actions.ts`, `Lead` type in `lib/types.ts`, `leads` collection in `lib/store/index.ts`.

Checks on the latest branch: `npx tsc --noEmit` clean, `npx vitest run` all pass, `next build` succeeds, and both service pages were tested in a browser (form submit, lead status change).

## Next steps that need the owner
1. **Add a database.** In Vercel: Storage, add free Neon Postgres, connect it to the project (sets `DATABASE_URL`). Without it, sign-ups are closed in production and service leads are lost on restart. The `records` table is created automatically.
2. **Reply "deploy"** to put the auto poster, AI agents, auto editor, and the new Done For You and Paper Trading pages live. Claude must not deploy without this go-ahead. The deploy needs `claude/dreamy-brahmagupta-ytbdi5` merged into, or deployed instead of, the currently deployed branch.
3. **Stripe (about 20 minutes, test mode first):** create a monthly Premium price, then set `STRIPE_SECRET_KEY`, `STRIPE_PREMIUM_PRICE_ID` and `STRIPE_WEBHOOK_SECRET` in Vercel. Add a webhook to `/api/billing/webhook` for `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`. Never paste keys in chat.
4. **Merge PR #1** to keep the promo video maker.
5. **Get the first 4 Done For You clients ($1,000/month):**
   - Make 2 or 3 sample videos with the auto editor.
   - DM about 10 local businesses a day (salons, barbers, gyms, restaurants, realtors, contractors): *"Hey! I edit short videos for local businesses: captions, cuts, hooks. I made a quick sample from your page, want me to send it? First video's free."*
   - Send interested people the `/services` link, then track them on `/services/leads`.
   - Expect about 1 client per 30 to 50 messages.
6. Post the X drafts from the daily email whenever you like.

## Ideas for the next chat (not started)
- Add Done For You promo drafts to the daily email.
- Email the owner when a new lead arrives.
- Stripe checkout links for the service packages.
- Let clients upload clips straight into the auto editor.
- The mobile header nav scrolls sideways with 7+ links; it may need a menu.
