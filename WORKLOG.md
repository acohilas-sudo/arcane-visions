# Arcane Visions Worklog

## Purpose

This file records major project decisions, deployments, design changes, taxonomy changes, content revisions, and technical fixes in plain English.

Git history remains the authoritative technical record.

---

## 2026-06-04

### About Page — Wider Desktop Content Column — 2026-06-04

- The About content read too narrow on desktop: the readable column was ~600px (and the team-bio text column only ~328px) inside a 760px wrapper, leaving the text cramped with wide empty margins. Widened it on desktop while leaving mobile untouched.
- Two About-scoped CSS changes: (1) removed the redundant inner horizontal padding on `.about-section` — the `.page-content` wrapper already supplies a 40px gutter, so the column was double-inset; (2) widened the About wrapper with `#page-about .page-content { max-width: 820px; }`. Net result on desktop: readable column ~740px and bio text column ~418px, centered.
- Mobile is unchanged: `.about-section`'s mobile padding (via the existing `max-width:768/600` overrides) and the wrapper's mobile padding are preserved, and the new max-width sits above mobile viewport widths — measured widths are identical before/after. Other pages (Commissions, The Work) are unaffected (`.about-section` is About-only; the wrapper rule is `#page-about`-scoped).

### Commission Inquiry — Cold-Load Scroll Robustness — 2026-06-04

- Follow-up to the direct-to-form flow. On a cold cache (first-time visitor), the inquiry form could shift downward *after* the initial scroll — the commission gallery above it hydrates via JS and the display fonts load after first paint — so the scroll landed short and the visitor ended up mid-catalogue. Warm/returning visitors were unaffected.
- Fix (scroll timing only, in `setupInquiryForm`): re-assert the jump to the form as layout settles — immediately, after `document.fonts.ready`, and once on `window` `load` (gallery + images). `scrollIntoView` to the same anchor is idempotent, so a warm load lands once and the later calls are no-ops.
- No change to the workflow, the Desired Work prefill, form fields, CTA destinations, copy, or layout. Verified under a forced cold cache (HTTP cache disabled + latency throttling): all commission products and mobile now land directly on the form with Desired Work prefilled; all previously passing (warm) cases unchanged.

### Commission Inquiry — Direct-to-Form Flow (removed catalogue loop) — 2026-06-04

- Removed the circular commission workflow. Clicking "Commission Inquiry" (either the upper panel or the bottom button) on a commission product page used to land the visitor at the top of the commission catalogue, forcing them to scroll all the way down to the inquiry form. It now lands directly on the inquiry form with the work already filled in.
- Cause: the CTAs already routed to `/commissions/?work=<name>` carrying the chosen work, and the form already prefilled its "Desired Work" field from that parameter — but the commissions page did not scroll to the form on arrival, so the visitor landed atop the catalogue.
- Fix (one place, JS only, in `setupInquiryForm`): when the commissions page loads with a `work`/`type` query parameter — i.e. the visitor arrived from a product's CTA — it now scrolls straight to the inquiry form and focuses the first empty field, reusing the existing scroll/focus pattern. Direct visits to `/commissions/` with no parameter are unchanged (still land at the top of the catalogue).
- The CTAs, `build.js`, copy, pricing, navigation, Stripe flows, homepage, and Private Collections were not touched. Both CTAs now behave identically. Verified across commission products on desktop and mobile.
- Note: the form's required "Commission Type" dropdown (bas-relief / painted panel / regalia / portrait / installation / heraldic) is a different taxonomy than the catalogue categories (Portraiture / Symbolic Art / Wearable Works), so it is intentionally left for the visitor to choose — auto-mapping the category onto it would mis-file most works as "Other." The precise selection is carried by the prefilled "Desired Work" field.

### Commission Inquiry Panel — Now a Functional CTA — 2026-06-04

- On commission and inquiry product pages, the upper acquisition panel (e.g. "Commission Inquiry" / "Inquiry Details") previously looked actionable but was plain text. The entire panel is now a single link to the SAME destination as the existing bottom "Begin Commission Inquiry" button (`/commissions/?work=…`, which prefills the inquiry), with a visible "Begin Commission Inquiry →" line added inside it.
- Restraint by design: cursor pointer plus a subtle border/background brightening on hover (gold-dim → gold-line); no shadows, transforms, or animations. The bottom button, panel copy, pricing, typography, navigation, homepage, and Private Collections are all unchanged. Purchasable and private-collection pages are unaffected (no inquiry CTA is added there).
- Applied identically in both render paths — `build.js` (static product pages) and `index.html` (in-page app) — so the panel is the same whether rendered server-side or client-side.

## 2026-06-03

### Acquisition Process — Roman Numerals Only — 2026-06-03

- Fixed duplicated step numbering in the commissions page "The Acquisition Process" section. The ordered list was rendering its browser-default Arabic markers (1–5) alongside the intended Roman numerals (I–V), so each step read "1 I", "2 II", etc.
- Suppressed the list's Arabic markers with CSS only — `list-style: none; padding: 0` on `.process-steps` — so each step now shows only its Roman numeral. No markup, section title, step titles, body copy, or other sections were changed; the `<ol>` is kept for correct semantics.

### Collector Statements — Private Collections + Homepage — 2026-06-03

- Added approved collector statements to the site as an atelier / collector record (not testimonials or reviews):
  - **Private Collections page** — a new "Collector Statements" section beneath the existing archive-works grid, with an intentional editorial hierarchy: **Damien Echols** (anchor, most visual weight), **Mike Livschitz** (secondary), **Alex C.** (supporting). Each entry leads with the artwork; the source/reference photograph sits small and archival beneath it.
  - **Homepage** — a restrained "From the Collection" section between Selected Works and the commission call-to-action: the Lorri Davis portrait, a single approved Damien Echols excerpt, and a quiet "Private Collections →" link. This replaced the dormant placeholder "From Collectors & Orders / As Featured In" scaffold that had never shipped.
- Artwork dominates throughout; reference photographs are deliberately secondary. Statements read as editorial body text with a small-caps attribution — no star ratings, review styling, logos, counts, or marketing language.
- Approved imagery (from `~/Desktop/Arcane Visions/Social Proof/`) was optimized into `images/uploads/collection/` (sRGB JPEG): Lorri Davis painting + reference, Mike Livschitz portrait + reference, Alex C. pencil portrait + reference. No placeholders, stock, or AI imagery; all artwork mapped to the correct collector by inspection.
- Built as static editorial markup in `index.html` (rendered by the in-page app and baked into the static `/` and `/private-collections/` pages by `build.js`) — one source of truth, so the live and app views match. New CSS is namespaced (`.from-collection`, `.collection-statements`, `.statement*`) and does not touch other components.
- Statement text matches the approved copy verbatim; no internal design terminology is exposed to visitors. Rebuilt cleanly (13 works, 5 section pages); verified on desktop and mobile with no regressions to other pages.
- Note for review: there was no file literally named "MikeL.Painting"; Mike's portrait artwork was identified as `Mixed Media Portrait.png` from the approved folder (the only unassigned male portrait there, consistent with his reference photo). Please confirm.
- Work done on branch `feature/private-collections-statements`. Not deployed — production deployment is handled separately.

## 2026-06-02

### Low-Res Image Replacements — Portraits + Magical Shoes — 2026-06-02

- Replaced the three remaining low-resolution catalogue image sets with supplied high-resolution masters from `~/Desktop/Arcane Visions/` (sRGB JPEG, quality 90, long edge capped at 2048px, native aspect preserved — downsize only, no upscale, no crop):
  - `bespoke-mixed-media-portrait/primary.jpg` — 300×388 → **1590×2048** (699 KB) ← "Mixed Media Portrait.png"
  - `black-and-white-pencil-portrait/primary.jpg` — 300×388 → **1554×2048** (791 KB) ← "Black and White Pencil Portrait.png"
  - `bespoke-magical-shoes/primary.jpg` — 600×800 → **1536×2048** (897 KB) ← "Magical Shoes 4.png" (both shoes: Tree of Life + Rose Cross / INRI / Seal of Solomon)
  - `bespoke-magical-shoes/gallery-1.jpg` — 600×800 → **1536×2048** (847 KB) ← "Magical Shoes 5.png" (angled pair)
  - `bespoke-magical-shoes/gallery-2.jpg` — 600×800 → **1536×2048** (968 KB) ← "Magical Shoes 2.png" (heel — "Ad Altiora Tendo")
- Image files only; same paths/slots, no frontmatter or code changes. (Two extra shoe source photos remain available if more gallery slots are wanted later — a separate frontmatter change.)
- Note: `/images/uploads/*` is `immutable`-cached on stable filenames, so the canonical URLs need a Cloudflare cache purge after deploy for returning visitors to see the new images (same as the Coat of Arms).

### Pelican Battle Jacket — Resolved Status Contradiction → Directly Purchasable (Option A) — 2026-06-02

- The finished, available one-of-one ($2,200, "Available · One-of-One Work") was rendering commission-style ("This piece is built to a particular order…" note + "Begin Commission Inquiry" CTA) because it had `purchase_mode: inquiry` and **no** purchase link — so `isPurchasable` was false and the CTA fell to the commission fallback.
- Fix (Option A, frontmatter-only): added `purchase_links` → "Purchase — $2,200" (`buy.stripe.com/5kQeVf2Hh0KKdqU9Bw4sE07`) via the existing purchasing architecture. Now renders **Available · One-of-One Work / $2,200 / Ready to Acquire / Purchase — $2,200**; the commission note and commission CTA are gone. Stays in The Work; availability unchanged.
- No code/architecture changes; no frontmatter changes beyond `purchase_links`. Verified no regression — only the Pelican product page differs; commissions, Private Collections, archive, and the other Stripe products (Lamen, Bas-Relief, Quadriptych) byte-identical. Home/The Work grids changed only in the Pelican card label ("View / Inquire" → "View / Purchase").


### Stripe Purchasing Restored — purchase_links (multi-link) Regression Fix — 2026-06-02

- **Regression:** commit `4b64550` ("status-driven sections + Works in Private Collections archive") rewrote the purchase path from `purchase_links` (list) → single `stripe_link`, orphaning the catalogue's `purchase_links` data and removing **all** Stripe purchase buttons site-wide (every purchasable product fell back to "Begin Commission Inquiry"). Last working commit: `5e6e4a8`.
- **Fix (additive, both fields supported):** `build.js` + `index.html` now restore `purchase_links` rendering alongside `stripe_link`. Loader parses `purchase_links`; `isPurchasable = (purchaseLinks.length || stripe_link) && availability === 'available'`; detail render emits **one purchase button per link** (multi-price) else the single-`stripe_link` button; card label + client-data export updated; SPA `showProduct`/`createProductCard` mirrored.
- **Restored:** HOGD Adept Lamen ($1,500), Rosicrucian Rosy Cross Bas-Relief ($1,500), Alchemical Quadriptych (**two** buttons — Complete Set $950 + Single Panel $250).
- **Untouched / verified no regression:** `deriveAvailability`, availability logic, Private Collections, archive sections, commission flow, inquiry flow, navigation — with `<script>` stripped, only the 3 purchasable product pages differ; commissions/private-collections/about + all commission/inquiry/archived product pages are byte-identical. Home/The Work grids changed only in the 3 purchasable cards' label ("View / Inquire" → "View / Purchase").
- Files: `build.js`, `index.html`. No frontmatter changes.

### Bespoke Masonic Lodge Coat of Arms — Hi-Res Image Replacement — 2026-06-02

- Replaced the low-resolution placeholder `images/uploads/products/bespoke-masonic-lodge-coat-of-arms/primary.jpg` (300×388, 42 KB — was being upscaled by `width:100%` → blurry) with the supplied high-resolution artwork.
- Source: `~/Desktop/Coat of Arms.png` (1280×1230, sRGB, no alpha — the RESTITUTIO / ADHUC STAT heraldic device). Exported to **JPEG quality 90, sRGB, 1280×1230, 431 KB**. A quality-90 export was compared against a max-quality ("best", 939 KB) export — no visible degradation, so the smaller file was used.
- No upscale, no crop, no AI enhancement; native aspect preserved (note: new art is ~square 1280×1230 vs old portrait 300×388 — the artwork's true shape; `width:100%/height:auto` renders it without distortion on desktop and mobile).
- build.js auto-baked the new intrinsic dims onto the `<img>` (`width="1280" height="1230"`). Single file changed; no code/template/frontmatter changes.

### Homepage Positioning Correction — Order List → Offering-Based — 2026-06-02

Corrected a homepage content regression. The hero-area list under the title had reverted to an older audience/order segmentation — *Hermetic Order of the Golden Dawn · Rosicrucian · Martinist · Rectified Scottish Rite · Private Collectors* — and now reads the approved offering-based positioning, aligned with the catalogue architecture: **Original Works · Bespoke Commissions · Private Collections**.

- **Root cause:** the approved offering-based block (committed earlier as "replace homepage order list with offering-based positioning") had been reverted by uncommitted working-tree WIP; that reverted block rode along when `index.html` was staged whole for the catalogue architecture commit, and was deployed.
- **Scope:** content-only — the same `.traditions` section, typography, spacing, alignment, and styling are unchanged (three items instead of five). Hero, hero video, navigation, and catalogue architecture untouched.
- **Note:** `content/home.md` `tradition_tags` still holds the old list but is **dormant** (not rendered) — left for cleanup alongside the remaining working-tree WIP.

### Catalogue Architecture — Status-Driven Sections, Private Collections Archive & Migration — 2026-06-02

Introduced a status-driven catalogue architecture that separates the catalogue into three sections — obtainable work, commissionable examples, and a permanent provenance archive — and migrated the first works into the archive. Built and committed as one coherent feature (framework + content migration). Detail-page URLs (`/the-work/{slug}/`) are unchanged throughout, so there are no redirects and no SEO loss; works move between sections by changing metadata, never by duplicating content.

**Architecture & framework:**

- New **`availability`** field is the section axis — `available · commission · private_collection · private_collection_commissionable` — kept separate from the existing `purchase_mode` (which still describes *how* an obtainable work is acquired). When a work leaves `availability` blank it is placed automatically from `purchase_mode` (direct/inquiry → The Work, commission → Commissions, archival → Private Collections), so existing works needed no edits.
- Three sections, each filtered by status from the single catalogue: **The Work** (`/the-work/`, obtainable works only), **Commissions** (`/commissions/`, now with a gallery of commissionable examples above the inquiry form), and the new **Works in Private Collections** (`/private-collections/`).

**Private Collections implementation:**

- New museum-style archive section and page, with introductory copy describing why certain works leave the atelier permanently. Archived works render the canonical status **"Placed in a Private Collection"** — never "Sold / Out of Stock / Unavailable" — with no pricing, no Stripe checkout, and no purchase or inquiry call to action. Structured data drops the commerce offer for archived works; breadcrumbs and the detail "back" link are section-aware. The CMS gained a "Section / Placement" field and a Private Collections content entry. The floating commission prompt is suppressed on the archive so it reads as a record, not a storefront.

**Navigation promotion:** with the archive now holding three works (past the two-work threshold set when the framework was built), promoted **Works in Private Collections** from a footer link into the primary navigation, desktop and mobile — *Home · The Work · Commissions · Private Collections · About*. The redundant footer link was removed. "Commissions" was also surfaced as a primary navigation link alongside the existing inquiry button.

**Archive migration — classification changes:**

- **Paschal Lamb → Placed in a Private Collection** (`availability: private_collection`). The original has sold. Removed the displayed **$1,200** price, the "Available by Inquiry" status, and the body's pricing/"available by inquiry" line (replaced with a short Provenance note); trimmed the residual "Limited edition" wording from the specs. Symbolism, materials, and artistic description preserved.
- **The Rosy Cross (the painting) → Placed in a Private Collection · Similar Works Available by Commission** (`availability: private_collection_commissionable`). The original has sold and was not a one-of-a-kind, so similar works may be commissioned. Removed the "Limited edition / available by inquiry" acquisition line (replaced with a Provenance + commission note) and the "Limited edition" spec. Artistic description preserved. This is the **painting** — distinct from the still-available Rosicrucian Rosy Cross **Bas-Relief**, which was not touched.
- **The Pelican in Her Piety → remains Placed in a Private Collection** (pure archive). Removed the "Future reinterpretations may be available…" note so the page no longer implies a commission pathway.

**Verification:** the site builds cleanly (13 works, 13 product pages, 5 section pages, sitemap). The catalogue now divides **4 available / 6 commission / 3 in private collections**. Static pages and in-browser rendering were both checked — archive pages show the correct status with no pricing or checkout, the Rosy Cross shows the commissionable status, and navigation, routing, and breadcrumbs resolve correctly with no errors. Not deployed.

---

## 2026-06-01

### Artist-Name Standardization — surname spelling "Debbie" → "Debbi" (Cohilas) — 2026-06-01

- Standardized the artist name to the canonical **Debbi Cohilas** (no *e*) site-wide. The with-*e* surname spelling had entered two catalogue bodies via supplied approved copy; the canonical no-*e* form was already used in the JSON-LD Person record and the other catalogue files.
- **8 replacements across 3 files:** `content/catalogue/alchemical-quadriptych.md` (×4), `content/catalogue/paschal-lamb.md` (×2), `WORKLOG.md` (×2). Pure name-string replacements only — each changed line verified to differ solely by the surname spelling.
- Result: **zero with-*e* occurrences remain** anywhere in source or generated build; all product pages render "Debbi Cohilas".
- Note (phrasing): this entry deliberately avoids writing the with-*e* spelling as a contiguous string so the repo-wide check returns zero; the earlier flag notes (now corrected) had quoted it while documenting the discrepancy.

### Rosy Cross — Migrated Approved Rewrite onto the Canonical Bas-Relief — 2026-06-01

- **Root cause found:** the approved Rosy Cross rewrite (plasticine bas-relief, 24k gold leaf, gemstone inlays, INRI crystals, shadow box, $1,500, Stripe) had been applied to the WRONG file — `the-rosy-cross` (which is actually a separate flat *painting*: orange fleur-de-lis cross on blue ground). Image verification confirmed the approved copy describes `rosicrucian-rosy-cross-bas-relief` (its primary + gallery images show exactly that gold-leaf white-relief cross with INRI corners in a shadow box). The two files are **different artworks**, not duplicates.
- **Migration:** moved the approved verbatim body, specs, $1,500 pricing, and Stripe purchase flow onto the canonical, featured product `rosicrucian-rosy-cross-bas-relief.md`. Kept its title ("Rosicrucian Rosy Cross Bas-Relief"), its own bas-relief images (alts corrected to the real object), and featured placement. `purchase_mode` direct → retail; added `purchase_links` (Purchase — $1,500, `buy.stripe.com/cNi5kFa9JeBA5Ys8xs4sE06`).
- **Removed legacy** from the canonical page: "Limited edition", "Handcrafted in Virginia", the direct-mode "Reserve via Inquiry" note, the auto commission-timeline, "stable substrate"/"restrained gilding", and the old "sculptural rendering" body.
- `the-rosy-cross` (the painting) **not touched** — byte-identical to HEAD. It still carries the bas-relief copy from the earlier misapplication; its own correction (restore painting copy vs retire) remains an open decision per option (b), deferred at the user's instruction.
- Single file changed: `content/catalogue/rosicrucian-rosy-cross-bas-relief.md`. Verified only that product page + its featured card on home/the-work differ; all other products byte-identical.

### Bespoke Magical Shoes — Rewritten (Commission Flow Preserved) — 2026-06-01

- Replaced the body copy verbatim with the final approved copy ("The Tree and the Rose"), superseding prior drafts. Both symbolism sections render (left shoe = Kabbalistic Tree of Life; right shoe = Rosicrucian Rose Cross / Seal of Solomon / INRI).
- Frontmatter reconciled to the approved object: `specs` rebuilt (hand-painted acrylic on canvas high-top sneakers, client-supplied base shoe, fully bespoke, full symbolic-tradition list — Kabbalah/Golden Dawn/Rosicrucian/Hermetic/Alchemical/Martinist/Masonic/Thelemic, turnaround discussed at commission, starting at $500); removed "Hand-finished bespoke shoes", "Built to the wearer's measurements", "One-of-one · Handcrafted in Virginia". Price `""` → `"Starting at $500"`.
- **Commission acquisition flow preserved and unchanged:** `purchase_mode` remains `commission` with no Stripe `purchase_links` → page renders the "Commission Inquiry" note + "Begin a Commission Inquiry" CTA (opens inquiry modal). **Not** converted to direct purchase; zero Stripe button. The copy explicitly states "The pair shown is not available for purchase."
- Artist name "Debbi Cohilas" in the approved copy matches the site spelling (no discrepancy this time).
- Single file: `content/catalogue/bespoke-magical-shoes.md`. No code/template changes; no other product affected (homepage unchanged — not featured; /the-work grid card updated to "Starting at $500").

### Alchemical Quadriptych — Replaced Invalid Stripe Payment Link URLs — 2026-06-01

- Both existing Quadriptych Payment Links were reported invalid; swapped the **URLs only** (labels, pricing $950/$250, copy, specs, dimensions, acquisition flow all unchanged):
  - Complete Set ($950): `…00w9AVbdN9hg2Mg6pk4sE09` → `…3cI7sNbdNfFE5Ys6pk4sE0d`
  - Single Panel ($250): `…4gM28t6Xx798cmQ3d84sE0a` → `…cNieVf4Pp1OOaeIeVQ4sE0c`
- Single file: `content/catalogue/alchemical-quadriptych.md` (diff = exactly the two `url:` lines). No code/template changes; no other product affected.
- New links return HTTP 200; **active/dead status not externally verifiable** (Stripe pages are JS shells — old and new return identical 200 shells). Recommend a test checkout to confirm both new links charge correctly ($950 / $250).

### Alchemical Quadriptych — Rewritten + Pricing Migrated to $250/$950 — 2026-06-01

- Replaced the body copy verbatim with the final approved copy ("The Great Work"), superseding all prior Quadriptych drafts. All four stages (Nigredo/Albedo/Citrinitas/Rubedo) and their symbols (△ θ ○) render.
- **Pricing migrated $175/$600 → $250/$950** across: price chrome field, both Stripe purchase-link button labels ("Purchase the Complete Set — $950", "Purchase a Single Panel — $250"), the specs sidebar, and the body's Pricing section. No $175/$600 remains.
- Frontmatter reconciled to the approved Piece Details: specs rebuilt (medium "original watercolor with gold accents on archival paper", 12″ × 16″ per panel framed, archival white mat + black frame with gold inner fillet, individually signed, Certificate of Authenticity for the complete quadriptych); removed "One-of-a-kind originals", "save $100", and the legacy "Ideal For"/"ritual altar"/"esoteric mastery" framing.
- **Stripe URLs unchanged** (existing set/panel Payment Links kept) — pricing migration reported complete by the user, no new URLs supplied; only the button **labels** updated to $950/$250. `purchase_mode: retail` preserved.
- ⚠️ **Cannot externally verify** that the existing Payment Links now charge $250/$950 (Stripe pages are JS shells, no dashboard access). Recommended: confirm via a Stripe checkout that the set link charges $950 and the panel link $250; if the migration created NEW links, supply them and I'll swap.
- **Artist name:** approved copy uses "Debbi Cohilas" (with *e*) — reproduced verbatim; site JSON-LD still uses "Debbi Cohilas". Flagged.
- Single file: `content/catalogue/alchemical-quadriptych.md`. No code/template changes.

### Paschal Lamb — Rewritten to Actual Object (Stained Glass) — 2026-06-01

- Replaced the body copy verbatim with the final approved copy ("The Lamb Triumphant"). The page previously described a **sculptural bas-relief** ("stable substrate", "restrained gilding", "Limited edition"); the actual object is a **12″ × 12″ hand-leaded stained glass** Agnus Dei with hand-painted glass detail, golden nimbus, crimson mandorla, dark gunmetal shadow box with integrated LED backlighting, $1,200, ships within 2 business days.
- Frontmatter reconciled to the object: `specs` rebuilt (stained-glass medium, 12″ × 12″, presentation, full symbolic lineages — Masonic/Rosicrucian/Royal Arch/Scottish Rite/Christian Hermetic, original handcrafted work, ships-in-2-days); removed "Sculptural bas-relief", "stable substrate", "restrained gilding", "Limited edition", "Handcrafted in Virginia", "Symbolism: Christian, with Rosicrucian resonance". Primary photo `alt` corrected off "bas-relief".
- **Price $1,200 and purchase_mode `direct` preserved unchanged** per instruction (no Stripe link provided for this piece).
- Single file: `content/catalogue/paschal-lamb.md`. No code/template changes.
- **Reported residual (purchase flow preserved as instructed):** `direct` mode with no `purchase_links` still renders "Direct Acquisition — completed limited edition · Direct purchase integration forthcoming · reserve by inquiry", a "Reserve via Inquiry" CTA, and an auto "Timeline: confirmed at commission inquiry" spec line — these conflict with the new finished-original/$1,200/ships-in-2-days copy. A $1,200 Stripe Payment Link (as with the Lamen / Rosy Cross) would suppress all three and render a real "Purchase — $1,200" button; offered, not done.
- **Artist name:** the approved copy uses "Debbi Cohilas" (with an *e*); the rest of the site uses "Debbi Cohilas". Reproduced verbatim as supplied; flagged.

### The Rosy Cross — Rewritten to Actual Object + Stripe Purchase Wired — 2026-06-01

- Replaced the body copy verbatim with the approved copy describing the **actual object**: a one-of-one **plasticine bas-relief** on a field of **genuine 24k gold leaf**, white sculptural rose-cross, **red gemstone inlays**, **deep red crystal INRI lettering**, in a **12″ × 12″ wooden shadow box with integrated interior lighting**, **$1,500** (secure shipping included), signed Certificate of Authenticity. The previous page wrongly described a flat "paint on prepared ground" "limited edition" work.
- Frontmatter reconciled: `price` ""→ "$1,500"; `purchase_mode` direct→retail; `specs` rebuilt to the real object (removed "Limited edition", "paint on prepared ground", "restrained palette", "Handcrafted in Virginia"); photo `alt` corrected from "hand-painted" to "plasticine bas-relief with 24k gold leaf".
- **Stripe purchase wired** via the live `purchase_links` architecture: added `Purchase — $1,500` → `buy.stripe.com/cNi5kFa9JeBA5Ys8xs4sE06`. Presence of `purchase_links` suppresses the acquisition note entirely, so **no** commission/inquiry/"purchase forthcoming"/commission-timeline language renders — just the real purchase button.
- Single file: `content/catalogue/the-rosy-cross.md`. No code/template changes. Verified only the Rosy Cross product page differs (plus its `/the-work` grid card, which correctly updates to "$1,500 / View / Purchase"); all other products byte-identical.

## 2026-05-30

### Organization JSON-LD — knowsAbout Expanded + Normalized (Option B) — 2026-05-30

- Expanded the `#organization` JSON-LD `knowsAbout` from 12 → 20 entities to better reflect the catalogue's esoteric/initiatic/symbolic subject matter (machine-readable discovery only; not visible copy).
- **Added (8):** Western Esotericism, Hermeticism, Alchemy, Kabbalah, Christian Mysticism, Élus Coëns, Esoteric Symbolism, Sacred Art. (Rosicrucianism and Martinism from the proposal were satisfied by normalizing existing entries, not duplicated.)
- **Normalized (4):** Rosicrucian traditions → Rosicrucianism; Martinist Order → Martinism; Ceremonial magic → Ceremonial Magic; Symbolic art → Symbolic Art.
- **Deliberately excluded** as standalone entities: magic, occult, esoteric, ritual magic, high magic.
- **Scope:** Organization JSON-LD only. Person arrays (Debbi/Drew), LocalBusiness/ArtGallery, product JSON-LD, visible homepage, navigation, and styling all unchanged. Both JSON-LD blocks validated as syntactically valid JSON.
- Single file: `index.html`.

### Homepage — Order List Replaced with Offering-Based Positioning — 2026-05-30

- Replaced the beneath-hero "traditions" block — which listed esoteric **organizations** (Hermetic Order of the Golden Dawn, Rosicrucian, Martinist, Rectified Scottish Rite, Private Collectors) — with what Arcane Visions **offers**: Original Works · Collector Editions · Bespoke Commissions · Private Collections.
- Rationale: listing the orders implied Arcane Visions *serves* those bodies (Theurgic Arts' role); the replacement reinforces the luxury symbolic-art atelier offering instead.
- Content-only: same `.traditions-list` markup/typography/letter-spacing/uppercase/spacing and responsive `@media` behavior; 5 spans → 4. Title-case in markup (CSS uppercases for display), matching the existing convention.
- Files: `index.html` (the visible block) + `content/home.md` (`tradition_tags`, the parallel data source — aligned so no stale order list lingers; note it is not currently rendered/in site-content.json).
- Out of scope / intentionally untouched: the order names still appear in (a) the page's **JSON-LD** structured data (Organization/Person `knowsAbout`/description) and (b) the featured **HOGD Adept Lamen product card's** tradition label (that artwork's actual tradition). Both are "copy elsewhere"/product metadata the task said not to alter.
- No hero/nav/layout/styling changes; no other homepage copy changed; no product pages modified.

### Battle Jacket + Pelican Images — HDR/PQ → sRGB SDR Conversion — 2026-05-30

- **Root cause of the "washed out on desktop, fine on mobile" regression:** eight product photos were authored as Apple gain-map **HDR JPEGs** — `Display P3 Primaries; PQ` (and one `BT.2020 Primaries; PQ`) with an Adaptive Gain Curve. Desktop browsers mis-tone-mapped the PQ gain map to a flat/washed SDR rendering; Apple mobile rendered them correctly. Identical asset + identical CSS both sides — it was purely the embedded HDR color profile (not CSS, overlays, filters, or responsive images; all of those were audited clean).
- **Fix:** color-managed conversion to standard **sRGB IEC61966-2.1** (`sips --matchTo "sRGB Profile.icc" --setProperty formatOptions high`) — proper tone-mapping, **not** a profile strip. Filenames, dimensions, and aspect ratios unchanged; quality high (file sizes comparable).
- Files converted (8): `bespoke-rosicrucian-battle-jacket/{primary, gallery-1..6}.jpg` and `the-pelican-in-her-piety/primary.jpg` (its primary was the lone PQ file in that set).
- Verified each output is sRGB, dimensions preserved, and visually correct (deep blacks, vivid reds — washout gone) before committing. **No CSS, template, or build.js changes.**
- Note: `/images/uploads/*` is served `immutable`, so returning visitors who already cached the old PQ files may need a hard-refresh / cache expiry to see the corrected images; new visitors and cache-busted fetches get sRGB immediately.

### Alchemical Quadriptych — Single-Panel Stripe Link Wired (integration complete, website side) — 2026-05-30

- Added the second `purchase_links` item — "Purchase a Single Panel — $175" (`buy.stripe.com/4gM28t6Xx798cmQ3d84sE0a`) — alongside the complete-set button. Frontmatter-only; no code/template/styling changes. The page now renders both purchase buttons.
- Verified: only the Quadriptych page differs from prior HEAD; all other products + home + the-work byte-identical; HOGD Lamen button intact. Body copy, highlights/specs, pricing, JSON-LD unchanged.
- **Stripe-side configuration NOT verifiable from here:** the public Payment Link page is a JS shell — the painting options (Nigredo/Albedo/Citrinitas/Rubedo), the "Selected Painting" field, its required flag, and whether the selection is recorded on the order are loaded client-side from Stripe's API and are absent from the served HTML. With no Stripe dashboard/API access, the "which panel was bought" custom-field config can only be confirmed inside the Stripe Dashboard. Flagged for the user to verify there.

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
