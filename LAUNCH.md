# LAUNCH.md — the $0 launch manual (explained simply)

Every step is labeled with **WHO** does it, **WHERE**, **HOW LONG**, and **COST**.
Total required cost: **$0**. (Stripe only ever takes a small cut of money you *receive*.)

---

## STEP 0 — Already done for you · COST $0
The website is built and tested (23 automated tests pass). Share buttons, brag-card
generator, Stripe wiring, SEO page, and a marketing robot are all in the code.
You do nothing here.

## STEP 1 — Turn the website ON · YOU · 1 minute · $0
- **1A.** Go to `github.com/allenwangg/allen/settings/pages` (be logged in).
- **1B.** Under **Build and deployment → Source**, pick **"GitHub Actions"** from the dropdown.
- **1C.** Tell Claude "pages on" — the deploy gets triggered and verified for you.
  (It also re-deploys itself automatically every time the code changes.)
- **1D.** Your website is now live at **https://outranked.vercel.app/**

## STEP 2 — Turn real MONEY on · YOU · ~15 minutes · $0
This is the "link my bank account" part. It happens **only on Stripe's website**.
Never type your bank numbers anywhere else — not into chat, not into code, not to
any AI or person.
- **2A.** Go to `stripe.com` → **Sign up** (email + password).
- **2B.** Click **Activate payments**. Fill in: your name, address, tax ID (SSN in
  the US), and your **bank account + routing number**. That's the bank link.
- **2C.** Wait for "activated" (usually instant, sometimes up to a day).
- **2D.** In Stripe search for **Payment Links** → **+ New** → choose
  **"Customers choose what to pay"** → product name `OUTRANKED bid` → minimum `$1`,
  suggested `$5` → under Confirmation page, redirect to
  `https://outranked.vercel.app/?paid=1` → **Create link** → **Copy** it.
- **2E.** Put the link in the code (pick one):
  - Easy: paste the link into chat and Claude commits it for you, or
  - Yourself: on GitHub open `outranked/index.html` on branch
    `claude/practical-archimedes-vjt4h8` → pencil icon → Ctrl+F for
    `STRIPE_PAYMENT_LINK` → paste your link between the quotes → **Commit changes**.
    The site updates itself in about a minute.
- **Money flow:** someone bids → money lands in your Stripe → Stripe pays your bank
  (about 2 business days later, 7–14 days for the very first payout).

## STEP 3 — Free visitor counter · YOU · 5 minutes · $0 *(optional but powers the stats posts)*
- **3A.** Go to `goatcounter.com` → **Sign up** (free) → pick a code, e.g. `outranked`.
- **3B.** Your endpoint is `https://outranked.goatcounter.com/count`. Paste it into
  `CONFIG.GOATCOUNTER` the same way as 2E (or send it to Claude).

## STEP 4 — The marketing ROBOT · YOU · 10 minutes · $0 *(posts to X every day by itself)*
- **4A.** Go to `developer.x.com` → sign in with your X account → get the **Free**
  tier (instant) → create an app.
- **4B.** On the app's **Keys and tokens** page: generate **API Key + Secret**, and
  **Access Token + Secret** (choose **Read and Write**).
- **4C.** Go to `github.com/allenwangg/allen/settings/secrets/actions` → **New
  repository secret** — add all four, named exactly:
  `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`.
- **4D.** Ask Claude to open the pull request, then press **Merge** on GitHub.
  (GitHub only runs scheduled robots from the main branch.) From then on the robot
  posts by itself, free (X free tier = 500 posts/month, we use ~2/day):
  - **00:05 UTC:** "🔥 The board just reset. The crown starts at $5."
  - **14:00 UTC:** morning stats ritual (once the verified-bids worker is set up).

## STEP 5 — Get 10 friends ready · YOU · your group chat · $0
- **5A.** Message 10–15 friends: *"I'm launching at {time}. Bid $5 for real and
  reply to my launch post with your rank."*
- **5B.** Rules: real bids with real money only. If anyone asks whether friends
  seeded the board — say yes, proudly. Never fake activity.

## STEP 6 — LAUNCH DAY · YOU · X (Twitter) · $0
- **6A.** Pick a Tuesday, Wednesday, or Thursday morning (US time).
- **6B.** Open the War Room → copy **The launch post** → post it on X.
  **No link inside the post** (links get suppressed).
- **6C.** Immediately reply to your own post with the **link reply**.
- **6D.** Friends bid and reply within the **first 30 minutes** — that window
  decides how far X spreads it.
- **6E.** For 48 hours: reply to every single comment, screenshot every crown flip
  and post it. You are the commentator of a money fight.
- 💡 The one thing worth paying for (optional): X Premium (~$8/mo) roughly
  fixes link suppression and boosts reach. Everything else stays $0.

## STEP 7 — Every day after · YOU · 10 min/day · $0
- **7A.** Robot handles the reset + stats posts.
- **7B.** Day 1: post the **24h recap** (template in the War Room). Then quote-post
  drama whenever the crown flips.
- **7C.** Day 2: **r/SideProject** story post. Day 4: **r/EntrepreneurRideAlong**
  breakdown + a **Show HN** try. Skip paid newswires — email indie newsletters
  directly instead (free, template in the War Room).

## STEP 8 — Do NOT do these
- ❌ Don't buy ads, upvotes, or followers (wasted money, often penalized).
- ❌ Don't fake bids or pretend strangers bid when friends did.
- ❌ Don't spam subreddits with bare links (instant removal).
- ❌ Don't describe the product to Stripe as an auction or raffle — it's
  **"leaderboard placement — digital advertising service."**

---

### Cost summary

| Thing | Cost |
|---|---|
| Website hosting (GitHub Pages) | $0 |
| Payments (Stripe) | $0 up front; ~2.9% + 30¢ per bid received |
| Analytics (GoatCounter) | $0 |
| Daily posting robot (GitHub Actions + X free tier) | $0 |
| Reddit / HN / newsletters | $0 |
| Optional: X Premium | ~$8/mo (the only paid thing worth considering) |
