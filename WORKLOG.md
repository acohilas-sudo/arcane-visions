# Arcane Visions Worklog

## Purpose

This file records major project decisions, deployments, design changes, taxonomy changes, content revisions, and technical fixes in plain English.

Git history remains the authoritative technical record.

---

## 2026-05-30

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
