# LAUNCH.md — the $0 launch manual

Total required cost: **$0**. Stripe only ever takes a cut of money you *receive*.

---

## STEP 1 — Put the site online · ONE CLICK · ~2 min · $0

Click this link. It creates a **private** repo in your GitHub account and deploys the
site — in a single flow, no setup:

**https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fallenwangg%2Fallen%2Ftree%2Foutranked-template&project-name=outranked&repository-name=outranked**

What you'll see:

- **1A.** "Continue with GitHub" → **Authorize** (first time only — this creates your
  free Vercel account).
- **1B.** ⚠️ **Top-left scope selector must show YOUR personal account**, not any team.
  Personal scope = only you can see the project. This is the step that keeps everyone
  else out.
- **1C.** Repository name is prefilled `outranked`. **Tick "Create private Git
  Repository."**
- **1D.** Click **Deploy**. Wait ~40 seconds.
- **1E.** Copy the URL it gives you (e.g. `outranked-xyz.vercel.app`) and **paste it
  into chat** — the share buttons and link-preview cards need to know the real address.

The site is now live in **demo mode**: a clearly-labeled play-money board, so you can
show people the product before any payment exists.

**To keep it visible only to you** (until launch day): Project → **Settings** →
**Deployment Protection** → **Vercel Authentication** → **All Deployments** → Save.
Turn this OFF on launch day so bidders can reach it.

## STEP 2 — Turn on real money · YOU · ~15 min · $0

Everything here happens **on Stripe's own website**. Never type bank details anywhere
else — not into chat, not into code, not to any AI.

- **2A.** [stripe.com](https://stripe.com) → **Sign up**.
- **2B.** **Activate payments**: name, address, tax ID (SSN in the US), and your
  **bank account + routing number**. That is the bank link.
- **2C.** When asked what you sell, say:
  **"leaderboard placement — digital advertising service."**
- **2D.** Search **Payment Links** → **+ New** → **"Customers choose what to pay"** →
  product `OUTRANKED bid`, minimum $1, suggested $5 → after payment redirect to
  `https://<your-vercel-url>/?paid=1` → **Create** → **Copy**.
- **2E.** **Paste that link into chat.** It gets committed for you and the site
  redeploys itself in about a minute.

## STEP 3 — Connect the board to the ledger · YOU · 2 min · $0

This one variable turns the demo board into a real one. The site reads your Stripe
payments directly and rebuilds the leaderboard from them — there is no database.

- **3A.** Stripe → **Developers** → **API keys** → **Create restricted key** → give it
  **Checkout Sessions: read** and nothing else → copy it.
  *(A restricted key can only ever list your sessions. Safer than the secret key.)*
- **3B.** Vercel → your project → **Settings** → **Environment Variables** → add:
  - Name: `STRIPE_SECRET_KEY`
  - Value: the key you just copied
  - Save.
- **3C.** Vercel → **Deployments** → the top one → **⋯** → **Redeploy**.

The instant that lands, the demo board wipes itself and the site shows only real, paid
listings. Nothing can appear on the board without money having moved.

## STEP 4 — Free visitor counter · 5 min · $0 · *optional*

[goatcounter.com](https://goatcounter.com) → Sign up → pick a code (e.g. `outranked`) →
send me `https://<code>.goatcounter.com/count` and I wire it in. This powers the
visitor numbers in your daily posts.

## STEP 5 — The marketing robot · 10 min · $0 · *optional*

Posts to X twice a day by itself, forever, free.

- **5A.** [developer.x.com](https://developer.x.com) → sign in → get the **Free** tier
  → create an app.
- **5B.** **Keys and tokens** → generate **API Key + Secret** and **Access Token +
  Secret** (choose **Read and Write**).
- **5C.** In your new `outranked` repo → **Settings → Secrets and variables → Actions**
  → **New repository secret**, four times, named exactly:
  `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`.

That's it — the schedule already lives on the repo's `main` branch:
- **00:05 UTC** — "🔥 The board just reset. The crown starts at $5."
- **14:00 UTC** — the morning stats ritual, with real numbers from your ledger.

## STEP 6 — Ten friends · your group chat · $0

Message 10–15 people: *"I launch at {time}. Bid $5 for real and reply to my launch post
with your rank."* Empty boards are why ~190 outbid.lol copycats made nothing.

**Real bids, real money.** If anyone asks whether friends started the board, say yes,
proudly. Faking activity is an FTC problem and the internet always finds out.

## STEP 7 — Launch day · X · $0

1. Pick a **Tuesday–Thursday morning** (US time).
2. Turn **Deployment Protection OFF** (Step 1) so the world can reach the site.
3. Post the launch post from the War Room — **no link in the post body** (X buries
   posts with links). Put the link in your **first reply**.
4. Friends bid and reply inside the **first 30 minutes** — that window decides how far
   X spreads it.
5. For 48 hours: reply to every comment, screenshot every crown flip, post the drama.

💡 The only thing worth paying for, ever: X Premium (~$8/mo) softens link suppression.
Optional — the link-in-reply trick is the $0 version.

## STEP 8 — Every day after · 10 min/day · $0

- The robot posts the reset and the stats. You supply the human drama.
- **Day 1:** the 24-hour recap post. **Day 2:** r/SideProject story post.
  **Day 4:** r/EntrepreneurRideAlong breakdown + a Show HN attempt.
- Skip paid newswires — email indie newsletters directly, free.

## STEP 9 — Never do these

- ❌ Buy ads, upvotes, or followers.
- ❌ Fake bids, or imply strangers bid when friends did.
- ❌ Spam subreddits with bare links.
- ❌ Describe the product to Stripe as an auction, raffle, or gambling.

---

### Cost summary

| Thing | Cost |
|---|---|
| Hosting (Vercel Hobby) | $0 |
| Backend / database | $0 — there isn't one; the board reads Stripe |
| Payments (Stripe) | $0 up front · ~2.9% + 30¢ per bid received |
| Analytics (GoatCounter) | $0 |
| Daily posting robot (GitHub Actions + X free tier) | $0 |
| Reddit / Show HN / newsletters | $0 |
| Optional: X Premium | ~$8/mo — the only paid item worth considering |
