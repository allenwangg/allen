# Getting this in front of people

The site is static — HTML, CSS, and ES modules with no build step, no bundler, and no
server. That makes deployment genuinely trivial, and it is the step between "code in a
repo" and "a thing a contractor can use."

## GitHub Pages (free, ~2 minutes)

1. Push to `master` (or merge the feature branch into it).
2. Repo → **Settings** → **Pages**.
3. Source: **Deploy from a branch**. Branch: `master`, folder: `/ (root)`. Save.
4. Wait a minute. The site appears at:

   - landing page → `https://<user>.github.io/allen/`
   - the app → `https://<user>.github.io/allen/quoteforge/`

Nothing else is required. There is no build to configure and no environment to set.

**Why the subpath matters.** A GitHub *project* site is served from `/<repo>/`, not from
the domain root. Every path in this repo is relative for that reason, and the browser
suite serves the whole site under `/allen/` and asserts nothing 404s — see the
"subpath deploy" section of `quoteforge/test/browser.mjs`. If you later move it to a
user site or a custom domain at the root, it keeps working; the reverse is what breaks.

## Custom domain

Point a CNAME at `<user>.github.io`, then add a file called `CNAME` at the repo root
containing just the domain, e.g. `quoteforge.com`. GitHub picks it up automatically and
issues a certificate. At the root of a domain the subpath question disappears.

## Anywhere else

Because there is no build, any static host works with a drag-and-drop of the repo:
Netlify, Cloudflare Pages, Vercel, S3 + CloudFront, or a folder on any web server.
There is no Node runtime in production — Node is used only to run the tests.

## Before you send it to anyone

Two things are placeholders and will look unfinished to a contractor:

1. **The company profile.** Settings → Your company. Until it is filled in, every
   proposal is headed "Your Company LLC". This is the first thing to change.
2. **The price book.** The costs are national averages. They are close enough to
   demonstrate the tool and wrong enough to lose money on a real bid. Settings and the
   price book picker both let you set your own.

## What deployment does not solve

Publishing the site does not create demand for it. `REVENUE.md` covers that honestly:
the revenue problem here is a distribution problem, and a live URL is a precondition
for solving it rather than a solution. Deploy it because you cannot run the five
pricing audits described there without a link to point at — not because a live URL is
itself progress.
