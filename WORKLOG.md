# Arcane Visions Worklog

## Purpose

This file records major project decisions, deployments, design changes, taxonomy changes, content revisions, and technical fixes in plain English.

Git history remains the authoritative technical record.

---

## 2026-05-30

### Alchemical Quadriptych — Complete-Set Stripe Link Wired — 2026-05-30

- Wired the Quadriptych's **complete set ($600)** purchase via the already-live `purchase_links` architecture — frontmatter-only change, **no code touched**.
- Added `purchase_links` → "Purchase the Complete Set — $600" (`buy.stripe.com/00w9AVbdN9hg2Mg6pk4sE09`). The page now renders that purchase button; the retail "Available Now" note is suppressed (designed purchasable behavior, same as the Lamen).
- Single file changed: `content/catalogue/alchemical-quadriptych.md`. Verified only the Quadriptych page differs from prior HEAD; all 12 other product pages + home + the-work byte-identical; HOGD Lamen Stripe button intact.
- Untouched: body copy, highlights/specs, pricing, dimensions, symbolism, details/ideal-for, layout, styling, JSON-LD.
- **Pending:** single-panel ($175) Stripe link not yet created — to be added in a follow-up commit (will become a second item in the same `purchase_links` list → a second button).

### Alchemical Quadriptych — Highlights (specs) Block Corrected — 2026-05-30

- Replaced the product-detail highlights list — the `specs` frontmatter field, rendered between the price and the "Available Now" note — which still held leftover AI-generated summary bullets ("…rendered in four registers", "Painted on prepared panel · finished as a hung quadriptych", "Restrained gold and dark ground", "Reads as a single field…", "…available by acquisition", "Handcrafted in Virginia").
- New highlights (supplied text, used exactly): four original watercolors of the Magnum Opus stages · Nigredo, Albedo, Citrinitas, and Rubedo · approximately 12″ × 16″ framed · one-of-a-kind originals · available individually or as a complete set · signed Certificate of Authenticity included.
- **Source confirmed:** the `specs` field in `content/catalogue/alchemical-quadriptych.md` (not a separate highlights field, not body copy, not the template). Single file changed.
- Untouched: body copy, pricing, dimensions, symbolism/Details/Ideal-For sections, layout, styling, Stripe/purchase behavior, JSON-LD. No other product affected.

### Stripe Payment Link Purchasing (purchase_links) — 2026-05-30

- Restored real purchase functionality using **Stripe Payment Links** (static buy.stripe.com URLs). No SDK, Checkout Sessions, server code, webhooks, env vars, or new dependencies — matches the no-backend static-site architecture.
- Added a minimal, mode-agnostic `purchase_links` mechanism to the **deployed** build (did NOT deploy the larger uncommitted rework). A product with a non-empty `purchase_links` list (each `label` + `url`) renders one purchase button per link **instead of** the inquiry CTA, and suppresses that product's inquiry/commission next-step note and the auto "Timeline: confirmed at commission inquiry" spec line.
- Trigger is solely the presence of `purchase_links` — **no new purchase modes introduced**. Every product without `purchase_links` is byte-for-byte unchanged (verified: 12 of 13 product pages identical with scripts stripped; home/the-work differ only by the Lamen card label).
- **Wired: HOGD Adept Lamen → "Purchase — $1,500"** Stripe Payment Link (`buy.stripe.com/eVq28t5Tt0KK4Uo9Bw4sE08`). Lamen now shows the purchase button, no inquiry CTA/messaging/timeline; body + specs unchanged.
- Files: `build.js` (loader + detail render + card label + client data export), `index.html` (SPA `showProduct` + card-label mirror), `admin/config.yml` (Purchase Links CMS field), `content/catalogue/hogd-adept-lamen.md` (`purchase_links`).
- **JSON-LD untouched** (verified byte-identical to prior HEAD; fixed-price Offer still $1,500). No copy/design/layout/unrelated-metadata changes. Inventory reconciliation is manual per approved policy.
- **Pending (awaiting URLs):** Alchemical Quadriptych — $600 complete set + $175 single panel Payment Links not yet provided, so it remains on its current CTA until those URLs arrive.

### HOGD Adept Lamen — Body Replaced + Specs Reconciled to Stained Glass — 2026-05-30

- Replaced the Adept Lamen product description (body) verbatim with supplied copy describing a **leaded stained-glass** Adept Lamen — 18″ × 14″, King Scale colors, integrated warm LED, deep matte black shadow box, limited edition of 5 (this piece 2/5), $1,500 including secure shipping, 4 of 5 remaining. No rewrite/condense/optimize/embellish; supplied text used exactly.
- Reconciled the frontmatter `specs` block, which still described a **hand-painted breast-plate / made-to-specification commission** object — an internal contradiction with the new body. New specs drawn directly from the body's Details: edition + availability, dimensions, materials, shadow-box presentation, Certificate of Authenticity (numbered 2/5), and a fulfillment line.
- Removed commission/breastplate language: "breast-plate", "Hand-painted to the Order's color attributions", "Materials confirmed at commission · Made to specification", "Handcrafted in Virginia". The new fulfillment spec line ("…delivery timeline confirmed at order") also suppresses build.js's auto-injected "Timeline: confirmed at commission inquiry" line **without** a template change.
- Body copy preserved exactly. Single file changed: `content/catalogue/hogd-adept-lamen.md`. No other catalogue page affected (specs are per-product).
- **Remaining discrepancy (documented, intentionally not fixed here):** `purchase_mode` left as `inquiry`, so the acquisition note still reads "Inquiry Details — built to a particular order, grade…" and the CTA is "Send an Inquiry". This is the same fixed-price-vs-Stripe issue as the Quadriptych; converting it to a real purchase flow is part of the separate, still-blocked Stripe Payment Link task (no URLs yet).

### Alchemical Quadriptych — Fixed-Price Retail (not Inquiry) — 2026-05-30

- Resolved a pricing-model mismatch: the restored body copy stated fixed public prices ($175/panel, $600/set, available now), but the page chrome rendered an inquiry acquisition state ("Price on Inquiry", "Inquiry Details", "Send an Inquiry", a commission-timeline spec line) driven by `purchase_mode: inquiry` + blank `price`
- Frontmatter: `price` → "$175 per panel · $600 complete set"; `purchase_mode` → `retail`
- Template (both `build.js` server rendering and the in-page SPA JS in `index.html`, kept in sync): added an isolated `retail` acquisition tier — "Available Now" note, "Acquire This Work" CTA, "View / Purchase" card label, and no commission-timeline line. JSON-LD now ships a fixed-price Offer (175.00) instead of price-on-inquiry
- The `retail` branches are gated to `purchase_mode === 'retail'`, which no other product uses — so no other catalogue page changed (verified across all 12 other product pages: zero retail leakage, original notes intact)
- Restored body copy is byte-unchanged
- Follow-up (flagged, not done): there is still no payment processor — "Acquire This Work" opens the contact/inquiry modal (site-wide, Stripe integration is marked forthcoming). A Stripe Payment Link per price point would enable true one-click checkout

### Alchemical Quadriptych — Restored Historical Copy — 2026-05-30

- Restored the original/historical Alchemical Quadriptych product description ("The Four Stages of the Magnum Opus") verbatim, replacing the later rewritten body copy
- This was a restoration, not a rewrite: no paraphrase, no modernization, no SEO/marketing edits, no new symbolism — wording and formatting preserved exactly as supplied
- The only intentional deviation from the historical version: removal of the sentence referencing Debbi's animation / visual storytelling background
- Single source touched: `content/catalogue/alchemical-quadriptych.md` (body only; frontmatter left intact)
- Flagged for follow-up (not changed): frontmatter still has `price: ""` + `purchase_mode: inquiry`, so the page chrome shows "Price on Inquiry" while the restored body states explicit prices ($175 / $600) and "Available now" — a display tension to reconcile if desired; and the site-wide artist Person JSON-LD still lists Debbi's storyboard/animation career (separate from this product's copy)

### About Page — Removed Tradition Badge Grid — 2026-05-30

- Removed the tradition badge/grid section (Golden Dawn, Rosicrucianism, Martinism, Rectified Scottish Rite, Élus Coëns) and the "commissioned by collectors and patrons … internationally" statement below it
- Reason: the badge grid implied Arcane Visions creates artwork for, serves, or is formally associated with those specific orders/initiatic bodies — which is not the positioning. Arcane Visions creates original esoteric and occult artworks within the broader Western Mystery Tradition; Theurgic Arts is the sister practice that produces regalia/furnishings/ceremonial materials for specific orders
- Replaced both with two plain statements: "Our work is created in the Western Mystery Tradition." and "We create original esoteric and occult artworks for the discerning seeker and collector." (no replacement list, no replacement badge grid — deliberate simplification)
- Single source touched: `content/about.md`
- Note: residual non-scope mentions remain and were intentionally left — Drew's personal bio (his Freemasonry / Rectified Scottish Rite history), the JSON-LD topical-expertise keywords in the template, and a now-dead `.tradition-tag` CSS rule

### About Page Brand Alignment — 2026-05-30

- Realigned the About page copy to the approved positioning: **esoteric/occult art atelier**, not a ritual-supply, regalia, or lodge/order-outfitter business
- Replaced the heading "Sacred Art for the Initiated" → **"Esoteric Art for the Western Mystery Tradition"** (the old heading narrowed the audience to initiates and leaned devotional-object)
- Reframed the opening statement, founding paragraph, "who we serve," trust signal, commissions, and cadence lines away from ritual-object/regalia/lodge-supplier language toward original esoteric art, portraiture, bas-reliefs, and bespoke commissions for collectors, patrons, and the discerning seeker
- Reworded Debbi's bio: removed "functional magical implements" and "vestments and regalia built to exact ceremonial specification"; now describes original esoteric and occult art, devotional paintings, portraiture, and bespoke works
- Reworded Drew's bio business clause (works with collectors and patrons, not Grand Lodge/order officers "to exact ceremonial specification"); **preserved** his personal Freemasonry initiation history and Rectified Scottish Rite involvement
- **Kept** the Theurgic Arts distinction intact — it deliberately differentiates Theurgic Arts (regalia, floor work, altar furnishings, working-floor materials) from Arcane Visions (original esoteric and occult artworks, portraiture, bas-reliefs, bespoke commissions)
- Single source touched: `content/about.md` (drives both the rendered `/about` page and the crawlable `data/site-content.json`)
- Verified: new copy renders; banned ritual-supply phrases removed from page + site-content.json; no regressions in titles, JSON-LD, llms.txt, homepage, commissions, or The Work
- Committed locally; not pushed/deployed pending review

---

## 2026-05-29

### Battle Jacket Offerings Restructured — 2026-05-29

- Corrected the pricing/positioning of the two battle jackets to reflect reality
- Created **Pelican Battle Jacket** as the finished one-of-one available for acquisition ($2,200, featured), using the actual available jacket's photos
- Repositioned **Bespoke Rosicrucian Battle Jacket** (Dum Spiro Spero) as a bespoke commission offering (Commissions from $2,200), and unfeatured it
- Retired the old generic commission template (`custom-hand-painted-rosicrucian-battle-jacket`); its role is now filled by the Bespoke Rosicrucian commission entry
- Moved the Pelican jacket photos into the new listing's image folder
- Added a 301 redirect from the retired template's URL to the new Pelican Battle Jacket page
- Note: "Pelican Battle Jacket" is a separate work from the existing "The Pelican in Her Piety" bas-relief
- Verified successful build

### Production Deployment Verification — 2026-05-29

* Verified Cloudflare Pages production deployment sourced from Git commit `4cd561b`
* Confirmed Bespoke Rosicrucian Battle Jacket entry is live
* Confirmed all 7 jacket images return HTTP 200 and render in correct order
* Confirmed listing appears under Wearable Works
* Confirmed featured placement appears on the home page
* Confirmed About page displays "Sacred Art for the Initiated"
* Confirmed old "Sacred work for operative practice" heading is absent
* Confirmed production deployment originated from committed Git state rather than local working-tree changes
* Confirmed no uncommitted modifications reached production

### Bespoke Rosicrucian Battle Jacket — 2026-05-29

- Created new one-of-one Wearable Works catalogue entry
- Added and organized final image gallery
- Written catalogue card copy
- Written full product-page copy
- Set featured: true for home/featured presentation
- Verified successful build
- Verified entry renders correctly
- Verified category placement under Wearable Works
- Verified image ordering
- Verified featured flag behavior

### About Page

* Removed problematic About hero image block
* Switched About presentation to Pelican in Her Piety
* Changed tagline from:

  * "Sacred work for operative practice"
  * to "Sacred Art for the Initiated"

### Mobile UX

* Fixed hamburger navigation behavior

### Taxonomy

* Removed Regalia category
* Removed Symbolic Art category
* Removed Bespoke Fashion category
* Removed Heraldry category
* Reorganized catalogue by medium

### Catalogue

* Moved HOGD Adept Lamen to Stained Glass
* Moved Paschal Lamb to Stained Glass

### Deployment

* Deployed committed HEAD from clean worktree
* Preserved contaminated working tree without deploying uncommitted files

---

## Maintenance Rule

Before any future commit or deployment, update WORKLOG.md with a concise summary of:

- What changed
- Why it changed
- Any important decisions made

The worklog should remain readable by a non-developer.
