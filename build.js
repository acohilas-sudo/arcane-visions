const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const matter = require('gray-matter');
const { marked } = require('marked');

const SRC = __dirname;
const DEST = path.join(__dirname, 'dist');
const BASE_ORIGIN = 'https://arcanevisions.art';
const BRAND_NAME = 'Arcane Visions';
const OG_IMAGE_FALLBACK = `${BASE_ORIGIN}/images/og-default.jpg`;

// ── Image dimension extraction ────────────────────────────────────────────
// Pulls intrinsic pixel dimensions from disk via macOS `sips`, cached per build.
// Used to inject width/height attributes on every <img> so browsers can reserve
// layout space before image decode — eliminates CLS. Real values only; never
// guessed. Returns null when the file is missing or sips fails, in which case
// width/height attributes are simply omitted (no fake values shipped).
const _dimCache = new Map();
function imgDims(refPath) {
  if (!refPath) return null;
  if (_dimCache.has(refPath)) return _dimCache.get(refPath);
  const abs = path.join(SRC, refPath.replace(/^\//, ''));
  let result = null;
  if (fs.existsSync(abs)) {
    try {
      const out = execSync(`sips -g pixelWidth -g pixelHeight "${abs}"`, { encoding: 'utf8' });
      const w = parseInt((out.match(/pixelWidth:\s*(\d+)/) || [])[1]);
      const h = parseInt((out.match(/pixelHeight:\s*(\d+)/) || [])[1]);
      if (Number.isFinite(w) && Number.isFinite(h)) result = { width: w, height: h };
    } catch (e) { /* leave null */ }
  }
  _dimCache.set(refPath, result);
  return result;
}
function dimAttrs(refPath) {
  const d = imgDims(refPath);
  return d ? ` width="${d.width}" height="${d.height}"` : '';
}

// Rewrite og:image:width/height so they match the og:image actually declared in
// `html`, measured from disk. The template ships a placeholder 1200×1200; this
// replaces it with the real pixel size of the served image (the ~1200×630 default
// or a portrait/landscape product image — none are square). Shared by rewriteHead
// (section + product pages) and the home-page write (which keeps the template head
// rather than going through rewriteHead). If the file can't be measured, the
// placeholder is left untouched rather than faked.
function applyOgImageDims(html) {
  const m = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/);
  if (!m) return html;
  const d = imgDims(m[1].replace(BASE_ORIGIN, ''));
  if (!d) return html;
  return html
    .replace(
      /<meta\s+property="og:image:width"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:image:width" content="${d.width}">`
    )
    .replace(
      /<meta\s+property="og:image:height"\s+content="[^"]*"\s*\/?>/,
      `<meta property="og:image:height" content="${d.height}">`
    );
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Recursive copy that drops hidden/system files.
function copyTreeClean(src, dest) {
  if (!fs.existsSync(src)) return;
  const entries = fs.readdirSync(src, { withFileTypes: true });
  ensureDir(dest);
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTreeClean(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyFileIfPresent(rel) {
  const src = path.join(SRC, rel);
  if (!fs.existsSync(src)) return false;
  const dest = path.join(DEST, rel);
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

// ── Availability: the section axis ────────────────────────────────────────
// `availability` decides WHICH of the three sections a work appears in. It is
// orthogonal to `purchase_mode` (which decides HOW an obtainable work is
// acquired — direct checkout vs inquiry vs commission copy). When a work omits
// `availability`, it is derived from purchase_mode so existing content needs no
// edits:
//   direct | inquiry → available            (The Work)
//   commission       → commission           (Commissions)
//   archival         → private_collection    (Works in Private Collections)
// 'private_collection_commissionable' is explicit-only (never derived): an
// acquired original whose *similar works* remain available by commission.
const AVAILABILITY_VALUES = new Set([
  'available', 'commission', 'private_collection', 'private_collection_commissionable'
]);
function deriveAvailability(purchaseMode) {
  switch (purchaseMode) {
    case 'commission': return 'commission';
    case 'archival':   return 'private_collection';
    case 'direct':
    case 'inquiry':    return 'available';
    default:           return 'available';
  }
}
function resolveAvailability(data) {
  const explicit = String(data.availability || '').trim();
  if (AVAILABILITY_VALUES.has(explicit)) return explicit;
  return deriveAvailability(data.purchase_mode || 'inquiry');
}
// Section predicates — single source of truth for which works belong where.
const isAvailable = w => w.availability === 'available';
const isCommission = w => w.availability === 'commission';
const isPrivateCollection = w =>
  w.availability === 'private_collection' ||
  w.availability === 'private_collection_commissionable';
// Canonical archive status line — the section's signature language, rendered
// from `availability` (never "Sold / Out of Stock / Unavailable").
const PRIVATE_COLLECTION_STATUS = 'Placed in a Private Collection';

// Section a work belongs to — drives the detail-page back-link and breadcrumb
// so a commission or private-collection piece isn't filed under "The Work".
// (The detail URL itself stays /the-work/{slug}/ regardless — see buildProductPage.)
function sectionInfo(work) {
  if (isCommission(work)) return { pageId: 'commissions', path: '/commissions/', label: 'Commissions' };
  if (isPrivateCollection(work)) return { pageId: 'private-collections', path: '/private-collections/', label: 'Works in Private Collections' };
  return { pageId: 'the-work', path: '/the-work/', label: 'The Work' };
}

function readCatalogue() {
  const dir = path.join(SRC, 'content', 'catalogue');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  return files.map(file => {
    const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
    const { data, content } = matter(raw);
    return {
      slug: file.replace('.md', ''),
      name: data.name || '',
      tradition: data.tradition || '',
      category: data.category || '',
      // Physical form and material of the work, surfaced in VisualArtwork schema.
      // Read verbatim from frontmatter; buildProductJsonLD falls back to a derived
      // value only when these are absent. Never availability/edition language.
      artform: data.artform || '',
      artMedium: data.artMedium || '',
      featured: data.featured || false,
      photos: data.photos || [],
      specs: data.specs || '',
      price: data.price || '',
      // Stripe-hosted Payment Link (https://buy.stripe.com/...). A non-empty
      // value marks the piece as directly purchasable; blank keeps it inquiry-only.
      stripe_link: data.stripe_link || '',
      // Multi-link purchase support (e.g. a set + single-panel price). Each item
      // is { label, url }; presence makes the piece purchasable just like
      // stripe_link. Additive — coexists with the single stripe_link field.
      purchase_links: Array.isArray(data.purchase_links) ? data.purchase_links.filter(l => l && l.url) : [],
      // 'direct'      = completed limited edition; available by inquiry
      // 'inquiry'     = one-of-one collector piece or made-to-specification
      // 'commission'  = bespoke commission requiring conversation
      // 'archival'    = acquired one-of-one in a private collection; portfolio-visible, no acquisition CTA
      purchase_mode: data.purchase_mode || 'inquiry',
      // Section axis — resolved once here (explicit value wins, else derived
      // from purchase_mode). Everything downstream reads this, never re-derives.
      availability: resolveAvailability(data),
      // Acquisition-state display lines (optional, rendered verbatim from
      // frontmatter — never fabricated): a status label (e.g. "Edition of 4",
      // "Acquired · One-of-One Work") and a secondary availability/reinterpretation note.
      acquisition_status: data.acquisition_status || '',
      acquisition_note: data.acquisition_note || '',
      // Optional per-work override for the purchase-panel heading (defaults to
      // "Ready to Acquire" when blank). Lets one work read differently without
      // touching the shared readyToAcquireHTML default for every other work.
      acquire_heading: data.acquire_heading || '',
      body: content || '',
      description: marked.parse(content || '')
    };
  });
}

function readPage(filename) {
  const filepath = path.join(SRC, 'content', filename);
  if (!fs.existsSync(filepath)) return {};
  const raw = fs.readFileSync(filepath, 'utf-8');
  const { data, content } = matter(raw);
  return { ...data, bodyHtml: marked.parse(content || '') };
}

// ── Slug validation ───────────────────────────────────────────────────────
const SLUG_RE = /^[a-z0-9-]+$/;
function validateSlugs(catalogue) {
  const seen = new Set();
  for (const p of catalogue) {
    if (!SLUG_RE.test(p.slug)) {
      throw new Error(
        `Build failed: invalid slug "${p.slug}". Slugs must match /^[a-z0-9-]+$/ (lowercase letters, digits, hyphens).`
      );
    }
    if (seen.has(p.slug)) {
      throw new Error(`Build failed: duplicate slug "${p.slug}".`);
    }
    seen.add(p.slug);
  }
}

// ── Text helpers ──────────────────────────────────────────────────────────
function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateChars(text, n) {
  if (!text) return '';
  if (text.length <= n) return text;
  return text.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text) { return escapeHtml(text); }

// ── Price parsing for JSON-LD ─────────────────────────────────────────────
function extractPrices(product) {
  const src = [product.price || '', product.specs || ''].join('\n');
  const matches = src.match(/\$[\d,]+(?:\.\d+)?/g) || [];
  const nums = matches
    .map(m => parseFloat(m.replace(/[$,]/g, '')))
    .filter(n => !isNaN(n) && n > 0);
  if (!nums.length) return null;
  const low = Math.min(...nums);
  const high = Math.max(...nums);
  return { low, high, single: low === high };
}

function productSku(product) {
  return `AV-${product.slug.toUpperCase()}`;
}

function priceValidUntil() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
}

function buildOffer(product, canonical, price) {
  // Offer for a piece with a known fixed price (Tier-1 direct pieces with $X
  // already published). Real number; no fabrication.
  return {
    '@type': 'Offer',
    url: canonical,
    price: price.toFixed(2),
    priceCurrency: 'USD',
    priceValidUntil: priceValidUntil(),
    availability: 'https://schema.org/InStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@type': 'Organization', name: BRAND_NAME, url: BASE_ORIGIN }
  };
}

function buildInquiryOffer(product, canonical) {
  // Offer for a piece whose price is intentionally private (inquiry / commission
  // tiers, or a priced piece kept in gallery posture). schema.org
  // permits omitting `price` when a textual PriceSpecification documents the
  // arrangement — keeps the Offer well-formed without inventing a numeric value.
  return {
    '@type': 'Offer',
    url: canonical,
    availability: 'https://schema.org/InStock',
    itemCondition: 'https://schema.org/NewCondition',
    priceCurrency: 'USD',
    priceSpecification: {
      '@type': 'PriceSpecification',
      priceCurrency: 'USD',
      description: 'Price on inquiry'
    },
    seller: { '@type': 'Organization', name: BRAND_NAME, url: BASE_ORIGIN }
  };
}

// Derive a small keyword vocabulary from category + tradition; produces stable,
// honest keywords without keyword stuffing. Used in VisualArtwork.keywords.
function buildKeywords(product) {
  const out = new Set();
  if (product.category) out.add(product.category);
  if (product.tradition) out.add(product.tradition);
  out.add('Arcane Visions');
  out.add('Western Mystery Tradition');
  out.add('symbolic art');
  return Array.from(out).join(', ');
}

// Derive an artworkSurface from spec lines. Reads the first spec line for a
// canonical surface noun (panel, paper, denim, glass, substrate, etc.) — only
// what's literally present in the spec text. No invented surfaces.
function deriveArtworkSurface(product) {
  const blob = (product.specs || '') + '\n' + (product.body || '');
  const lower = blob.toLowerCase();
  if (/prepared panel|on prepared panel/.test(lower))   return 'Prepared panel';
  if (/colored pencil and watercolor|graphite on paper|on paper/.test(lower)) return 'Paper';
  if (/hand-painted denim|denim/.test(lower))           return 'Denim';
  if (/bas-relief construction|sculptural bas-relief|sculptural rendering/.test(lower)) return 'Sculptural bas-relief';
  if (/prepared ground|paint on prepared ground/.test(lower)) return 'Prepared ground';
  if (/breast-plate|hand-painted to the order/.test(lower)) return 'Breast-plate (hand-painted)';
  if (/hand-finished bespoke shoes|shoes/.test(lower))  return 'Leather and textile';
  if (/heraldic device|final art/.test(lower))          return 'Print-ready artwork';
  return undefined;
}

// ── Product JSON-LD ───────────────────────────────────────────────────────
// Products are also Visual Artworks. Emitting both @types lets Google understand
// them as commerce listings AND lets art-aware retrieval (Google Arts & Culture,
// AI agents looking for artist work, etc.) discover them as artworks.
function buildProductJsonLD(product, canonical) {
  const firstImg = product.photos[0]?.image
    ? BASE_ORIGIN + product.photos[0].image
    : OG_IMAGE_FALLBACK;
  const images = (product.photos || [])
    .map(photo => photo.image ? BASE_ORIGIN + photo.image : '')
    .filter(Boolean);
  const desc = truncateChars(stripMarkdown(product.body) || stripMarkdown(product.specs) || product.name, 300);
  // Derive artMedium from the first spec line ("Sculptural bas-relief...", etc.)
  const firstSpec = (product.specs || '').split('\n').map(s => s.trim()).filter(Boolean)[0] || '';
  // Genre derived honestly from tradition + category — no keyword stuffing.
  const genre = [product.tradition, product.category].filter(Boolean).join(' — ') || 'Symbolic art';
  const artworkSurface = deriveArtworkSurface(product);
  const ld = {
    '@context': 'https://schema.org',
    '@type': ['Product', 'VisualArtwork'],
    name: product.name,
    description: desc,
    image: images.length ? images : firstImg,
    url: canonical,
    sku: productSku(product),
    mpn: productSku(product),
    category: product.category || 'Symbolic Art',
    brand: { '@type': 'Brand', name: BRAND_NAME },
    // VisualArtwork-specific fields — honest values only, undefined skipped below.
    // artform/artMedium come from frontmatter (the work's actual form and
    // material); the legacy derivations remain only as a fallback for works that
    // have not yet declared them. artMedium must describe material, never
    // availability or edition language.
    artform: product.artform || (product.category === 'Portraiture' ? 'Portraiture' : 'Symbolic art'),
    artMedium: product.artMedium || firstSpec || undefined,
    artworkSurface,
    genre,
    keywords: buildKeywords(product),
    creator: { '@id': `${BASE_ORIGIN}/#person-debbi` },
    inLanguage: 'en-US'
  };

  // Offer: keyed on whether the piece is actually purchasable — i.e. it has a
  // live purchase link (a Stripe Payment Link or one or more purchase_links) AND
  // is in the available section. This mirrors the site's own isPurchasable test
  // so the schema never contradicts the page's CTA.
  //   • Purchasable + a real $ price  → fixed-price Offer (numeric price, InStock).
  //   • Purchasable but price private → inquiry Offer (InStock, no fabricated price).
  //   • Commission / made-to-order / inquiry-only with NO live purchase link
  //     → NO Offer at all. These are not in stock and not directly purchasable;
  //     omitting the Offer is more honest than a false InStock claim.
  //   • Works in a private collection are acquired, not a commerce listing — they
  //     ship no Offer at all (avoids implying availability or any "sold out" framing).
  if (product.availability !== 'private_collection' && product.availability !== 'private_collection_commissionable') {
    const prices = extractPrices(product);
    const purchaseLinks = (product.purchase_links || []).filter(l => l && l.url);
    const isPurchasable = (purchaseLinks.length > 0 || !!product.stripe_link) && product.availability === 'available';
    if (isPurchasable && prices) {
      ld.offers = buildOffer(product, canonical, prices.low);
    } else if (isPurchasable) {
      ld.offers = buildInquiryOffer(product, canonical);
    }
    // else: not purchasable → no Offer emitted.
  }

  // Drop undefined values so the JSON stays clean
  for (const k of Object.keys(ld)) if (ld[k] === undefined) delete ld[k];

  return ld;
}

// ── ItemList for /the-work/ — discoverable collection of all artworks ────
function buildTheWorkItemListJsonLD(catalogue) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'The Work — Arcane Visions',
    description: 'A focused body of symbolic art, bas-relief works, and portraiture from the Arcane Visions atelier.',
    numberOfItems: catalogue.length,
    itemListOrder: 'https://schema.org/ItemListUnordered',
    itemListElement: catalogue.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE_ORIGIN}/the-work/${p.slug}/`,
      name: p.name
    }))
  };
}

// ── BreadcrumbList JSON-LD ────────────────────────────────────────────────
function buildBreadcrumbJsonLD(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.name,
      item: crumb.url
    }))
  };
}

// ── Pre-rendered product detail body ──────────────────────────────────────
// Next-step note for a directly purchasable piece (one carrying a Stripe link).
// Kept in sync with the same helper in index.html.
// The upper acquisition panel is a real purchase CTA: it embeds the SAME
// purchase button(s) — identical Stripe URL(s), label(s), and price — as the
// bottom purchase button, so the framed box is actionable rather than a
// look-alike. Multi-link works (e.g. set + single panel) render one button per
// link; single-stripe_link works render one "Purchase — <price>" button.
function readyToAcquireHTML(purchaseLinks, stripeLink, price, productName, heading) {
  const work = escapeAttr(productName || '');
  const title = escapeHtml(heading || 'Ready to Acquire');
  let buttonsHTML;
  if (purchaseLinks && purchaseLinks.length) {
    buttonsHTML = purchaseLinks
      .map(l => `<a class="btn" href="${escapeAttr(l.url)}" data-cta="product-purchase-panel" data-work="${work}">${escapeHtml(l.label || 'Purchase')}</a>`)
      .join('\n          ');
  } else {
    const buyLabel = price ? `Purchase — ${escapeHtml(price)}` : 'Purchase';
    buttonsHTML = `<a class="btn" href="${escapeAttr(stripeLink || '')}" data-cta="product-purchase-panel" data-work="${work}">${buyLabel}</a>`;
  }
  return `<div class="next-step-note next-step-purchase">
        <div class="next-step-title">${title}</div>
        <div class="next-step-purchase-actions">${buttonsHTML}</div>
      </div>`;
}

// Three tiers of acquisition copy. The next-step note differs by tier; the CTA
// button is standardized to "Begin Commission Inquiry" and routes to the form.
function productNextStepHTML(purchaseMode, ctaHref, ctaOnclick) {
  let title, body;
  if (purchaseMode === 'private_collection_commissionable') {
    title = 'Available by Commission';
    body = 'This original has been placed in a private collection. A similar work can be created as a new commission — distinct in materials and execution. Share what you envision to begin.';
  } else if (purchaseMode === 'direct') {
    title = 'Direct Acquisition';
    body = 'This piece is a completed limited edition. Available by inquiry — pricing, current edition status, and shipping window confirmed on response.';
  } else if (purchaseMode === 'commission') {
    title = 'Commission Inquiry';
    body = 'This piece is built to commission. Send the subject, scale, reference handling, materials, and timeline. We respond and confirm scope before work begins.';
  } else {
    // 'inquiry' — one-of-one collector pieces and made-to-specification regalia
    title = 'Inquiry Details';
    body = 'This piece is built to a particular order, grade, or collector context. Include intended use, dimensions, tradition or lineage, material preferences, deadline, and shipping country.';
  }
  // When a CTA destination is provided, the whole panel becomes one link to the
  // SAME place as the bottom "Begin Commission Inquiry" button. Copy is unchanged.
  if (ctaHref) {
    return `<a class="next-step-note next-step-cta" href="${ctaHref}" onclick="${escapeAttr(ctaOnclick)}" data-cta="product-panel" aria-label="Begin a commission inquiry">
        <div class="next-step-title">${title}</div>
        <p>${body}</p>
        <span class="next-step-cta-line">Begin Commission Inquiry →</span>
      </a>`;
  }
  return `<div class="next-step-note">
        <div class="next-step-title">${title}</div>
        <p>${body}</p>
      </div>`;
}

function renderProductDetailHTML(product) {
  const mode = product.purchase_mode || 'inquiry';
  const availability = product.availability || 'available';
  // A work placed in a private collection — acquired, no price, no checkout.
  // The "_commissionable" variant additionally permits a commission inquiry for
  // *similar* new works; the original itself remains unavailable.
  const inPrivateCollection = availability === 'private_collection' || availability === 'private_collection_commissionable';
  const commissionable = availability === 'private_collection_commissionable';
  // A Stripe Payment Link makes a piece directly purchasable — only ever an
  // obtainable work in The Work; never a commission example or an acquired work.
  const purchaseLinks = (product.purchase_links || []).filter(l => l && l.url);
  const isPurchasable = (purchaseLinks.length > 0 || !!product.stripe_link) && availability === 'available';

  const specsArr = (product.specs || '').split('\n').filter(Boolean);
  // Inquiry/commission pieces get a timeline line; purchasable and private-
  // collection pieces do not (one ships now, the other is already acquired).
  if (!isPurchasable && !inPrivateCollection && !specsArr.some(s => /timeline/i.test(s))) {
    specsArr.push('Timeline: confirmed at commission inquiry');
  }

  // Use per-photo alt text from frontmatter when present (richer than the product name).
  const photos = (product.photos || []).filter(p => p && p.image);
  const imgs = photos.map(p => p.image);
  const imagesJson = JSON.stringify(imgs).replace(/"/g, '&quot;');
  const visualHTML = imgs.length
    ? `<div class="product-detail-images">
        <div class="zoom-hint">Click to zoom</div>
        ${photos.map((p, i) => `<img src="${escapeAttr(p.image)}" alt="${escapeAttr(p.alt || product.name)}"${dimAttrs(p.image)} loading="lazy" decoding="async" data-lightbox-index="${i}" data-lightbox-images="${imagesJson}">`).join('\n        ')}
      </div>`
    : `<div class="product-detail-glyph">✦</div>`;

  // Private-collection works carry no price (even if a price field lingers);
  // everything else shows its price or "Price on Inquiry".
  const priceHTML = inPrivateCollection
    ? ''
    : (product.price
        ? `<div class="product-detail-price">${escapeHtml(product.price)}</div>`
        : `<div class="product-detail-price" style="color:var(--text-soft)">Price on Inquiry</div>`);

  // Status line. In a private collection the canonical section language is the
  // status ("Placed in a Private Collection") — it supersedes any per-work
  // acquisition_status so no "Acquired/Sold/Unavailable" wording can appear.
  // Elsewhere the per-work acquisition_status renders verbatim (never invented).
  const statusHTML = inPrivateCollection
    ? `<div class="acquisition-status">${escapeHtml(PRIVATE_COLLECTION_STATUS)}</div>`
    : (product.acquisition_status
        ? `<div class="acquisition-status">${escapeHtml(product.acquisition_status)}</div>`
        : '');
  // private_collection_commissionable: original stays in the collection, but
  // similar works may be commissioned. Plain private_collection shows nothing here.
  const similarWorksHTML = commissionable
    ? `<div class="acquisition-note">Similar Works Available by Commission</div>`
    : '';
  const noteHTML = product.acquisition_note
    ? `<div class="acquisition-note">${escapeHtml(product.acquisition_note)}</div>`
    : '';

  const specsHTML = specsArr.length
    ? `<div class="product-detail-specs">${specsArr.map(s => `<div>${escapeHtml(s)}</div>`).join('')}</div>`
    : '';

  // Next-step note: purchasable → "Ready to Acquire"; private collection → none
  // (the status line says everything); _commissionable → the "available by
  // commission" note; otherwise the tier-aware inquiry note keyed on purchase_mode.
  // Acquisition CTA. A static product page is a pruned standalone page with no
  // inquiry form, so the inquiry button links to /commissions/?work=… — the query
  // prefills the desired-work field after navigation (works with JS disabled);
  // with JS, beginCommissionInquiry() intercepts and carries the same prefill.
  // The upper inquiry panel is also made clickable to the SAME destination.
  // A work in a private collection carries no CTA — unless it is _commissionable,
  // which routes a commission inquiry for similar (new) works.
  const workQuery = encodeURIComponent(product.name || '');
  const jsName = (product.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const panelCtaHref = `/commissions/?work=${workQuery}`;
  const panelCtaOnclick = `event.preventDefault(); beginCommissionInquiry('', '${jsName}')`;
  let nextStepHTML;
  if (isPurchasable) nextStepHTML = readyToAcquireHTML(purchaseLinks, product.stripe_link, product.price, product.name, product.acquire_heading);
  else if (availability === 'private_collection') nextStepHTML = '';
  else if (commissionable) nextStepHTML = productNextStepHTML('private_collection_commissionable', panelCtaHref, panelCtaOnclick);
  else nextStepHTML = productNextStepHTML(mode, panelCtaHref, panelCtaOnclick);
  let inquireButtonHTML;
  if (isPurchasable) {
    // Direct acquisition via Stripe-hosted checkout — a top-level navigation,
    // exactly the Theurgic Arts pattern. data-cta drives the analytics shim.
    // Multi-link products (e.g. set + single panel) render one button per link;
    // single-stripe_link products render one "Purchase — <price>" button.
    if (purchaseLinks.length) {
      inquireButtonHTML = purchaseLinks
        .map(l => `<a class="btn" href="${escapeAttr(l.url)}" data-cta="product-purchase" data-work="${escapeAttr(product.name || '')}">${escapeHtml(l.label || 'Purchase')}</a>`)
        .join('\n      ');
    } else {
      const buyLabel = product.price ? `Purchase — ${escapeHtml(product.price)}` : 'Purchase';
      inquireButtonHTML = `<a class="btn" href="${escapeAttr(product.stripe_link)}" data-cta="product-purchase" data-work="${escapeAttr(product.name || '')}">${buyLabel}</a>`;
    }
  } else if (availability === 'private_collection') {
    inquireButtonHTML = '';
  } else {
    const inquireOnclick = `event.preventDefault(); beginCommissionInquiry('', '${jsName}')`;
    inquireButtonHTML = `<a class="btn" href="/commissions/?work=${workQuery}" onclick="${escapeAttr(inquireOnclick)}" data-cta="product">Begin Commission Inquiry</a>`;
  }

  return {
    layout: `
    <div>${visualHTML}</div>
    <div>
      <div class="product-detail-tradition">${escapeHtml(product.tradition || '')}</div>
      <h1 class="product-detail-name">${escapeHtml(product.name)}</h1>
      ${priceHTML}
      ${statusHTML}
      ${similarWorksHTML}
      ${noteHTML}
      ${specsHTML}
      ${nextStepHTML}
    </div>
  `,
    description: product.description || '',
    inquire: inquireButtonHTML
  };
}

function renderProductCardHTML(product, showSpecs) {
  const slug = product.slug || '';
  const href = slug ? `/the-work/${slug}/` : '#';
  const photos = (product.photos || []).filter(p => p && p.image);
  const imgs = photos.map(p => p.image);
  const specsArr = (product.specs || '').split('\n').filter(Boolean);
  const inPrivateCollection = product.availability === 'private_collection' || product.availability === 'private_collection_commissionable';
  const isPurchasable = (((product.purchase_links && product.purchase_links.length) || !!product.stripe_link)) && (product.availability || 'available') === 'available';
  const ctaLabel = inPrivateCollection
    ? 'View'
    : (isPurchasable ? 'View / Purchase' : 'View / Inquire');
  // Private-collection cards show the canonical archive status in place of a
  // price — an acquired work is not "price on inquiry".
  const priceLabel = inPrivateCollection
    ? PRIVATE_COLLECTION_STATUS
    : (product.price || 'Price on inquiry');
  let visualHTML;

  if (imgs.length) {
    const multiClass = imgs.length > 1 ? ' multi' : '';
    const imagesJson = JSON.stringify(imgs).replace(/"/g, '&quot;');
    visualHTML = `<div class="product-images${multiClass}">
      ${photos.map((p, i) => `<img src="${escapeAttr(p.image)}" alt="${escapeAttr(p.alt || product.name)}"${dimAttrs(p.image)} loading="lazy" decoding="async" data-lightbox-index="${i}" data-lightbox-images="${imagesJson}">`).join('\n      ')}
    </div>`;
  } else {
    visualHTML = `<div class="product-glyph">✦</div>`;
  }

  let specsHTML;
  if (showSpecs) {
    const preview = specsArr.slice(0, 3).map(escapeHtml).join(' · ');
    specsHTML = `<div class="product-card-specs">${preview}</div>
    <div class="product-footer">
      <span class="product-price">${escapeHtml(priceLabel)}</span>
      <span class="product-card-cta" aria-hidden="true">${escapeHtml(ctaLabel)}</span>
    </div>`;
  } else {
    const short = [specsArr[0], specsArr[1]].filter(Boolean).map(escapeHtml).join(' · ');
    specsHTML = `<div style="font-size:14px;color:var(--text-soft);line-height:1.6;margin-bottom:20px">${short}</div>
    <div class="product-footer">
      <span class="product-price">${escapeHtml(priceLabel)}</span>
      <span class="product-card-cta" aria-hidden="true">${escapeHtml(ctaLabel)}</span>
    </div>`;
  }

  return `<a class="product-card" href="${escapeAttr(href)}" aria-label="View details for ${escapeAttr(product.name)}">
    ${visualHTML}
    <div class="product-order">${escapeHtml(product.tradition || '')}</div>
    <h3 class="product-name">${escapeHtml(product.name)}</h3>
    ${specsHTML}
  </a>`;
}

// Canonical taxonomy order for the filter bar. Categories present in the
// catalogue render in this order; anything unlisted (e.g. the CMS "Other"
// escape hatch) falls in afterward, in encounter order. Mirrors CATEGORY_ORDER
// in index.html so the static bake and the hydrated bar match exactly — no
// reorder flash when the CMS fetch resolves.
const CATEGORY_ORDER = ['Symbolic Art', 'Portraiture', 'Wearable Works'];
function orderCategories(cats) {
  const known = CATEGORY_ORDER.filter(c => cats.includes(c));
  const extra = cats.filter(c => !CATEGORY_ORDER.includes(c));
  return [...known, ...extra];
}

function bakeProductGridsIntoTemplate(template, catalogue) {
  // Partition once by section. The Work shows only obtainable works; the filter
  // bar reflects that subset; Commissions and Private Collections get their own grids.
  const availableWorks = catalogue.filter(isAvailable);
  const commissionWorks = catalogue.filter(isCommission);
  const privateCollectionWorks = catalogue.filter(isPrivateCollection);

  const present = [];
  for (const product of availableWorks) {
    if (product.category && !present.includes(product.category)) present.push(product.category);
  }
  const categories = ['All', ...orderCategories(present)];

  const filters = categories
    .map((cat, i) => `<button class="filter-btn${i === 0 ? ' active' : ''}" type="button">${escapeHtml(cat)}</button>`)
    .join('\n        ');
  const catalogueCards = availableWorks.map(product => renderProductCardHTML(product, true)).join('\n        ');
  const commissionCards = commissionWorks.map(product => renderProductCardHTML(product, true)).join('\n        ');
  const privateCollectionCards = privateCollectionWorks.map(product => renderProductCardHTML(product, true)).join('\n        ');
  // Home "Selected Works" — featured items only, and never a private-collection
  // piece (the home grid promotes obtainable/commissionable work; the archive
  // has its own reverent section). The empty-set fallback also excludes the archive.
  const featuredCatalogue = catalogue.filter(p => p.featured && !isPrivateCollection(p));
  const featuredCards = (featuredCatalogue.length ? featuredCatalogue : catalogue.filter(p => !isPrivateCollection(p)))
    .map(product => renderProductCardHTML(product, false))
    .join('\n        ');

  return template
    .replace('<div class="filters" id="filterBar"></div>', `<div class="filters" id="filterBar">\n        ${filters}\n      </div>`)
    .replace('<div class="product-grid" id="catalogueGrid"></div>', `<div class="product-grid" id="catalogueGrid">\n        ${catalogueCards}\n      </div>`)
    .replace('<div class="product-grid" id="featuredGrid"></div>', `<div class="product-grid" id="featuredGrid">\n        ${featuredCards}\n      </div>`)
    .replace('<div class="product-grid" id="commissionsGrid"></div>', `<div class="product-grid" id="commissionsGrid">\n        ${commissionCards}\n      </div>`)
    .replace('<div class="product-grid" id="privateCollectionsGrid"></div>', `<div class="product-grid" id="privateCollectionsGrid">\n        ${privateCollectionCards}\n      </div>`);
}

// ── Head rewriter ─────────────────────────────────────────────────────────
function rewriteHead(template, { title, description, canonical, ogType, ogImage, extraHeadHTML = '' }) {
  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escapeAttr(description)}">`
  );
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${escapeAttr(canonical)}">`
  );
  html = html.replace(
    /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:type" content="${escapeAttr(ogType)}">`
  );
  html = html.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${escapeAttr(title)}">`
  );
  html = html.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${escapeAttr(description)}">`
  );
  html = html.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${escapeAttr(canonical)}">`
  );
  html = html.replace(
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/,
    `<meta property="og:image" content="${escapeAttr(ogImage)}">`
  );
  // og:image:width/height must match the ACTUAL file served on this page.
  html = applyOgImageDims(html);
  html = html.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${escapeAttr(title)}">`
  );
  html = html.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${escapeAttr(description)}">`
  );
  html = html.replace(
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/,
    `<meta name="twitter:image" content="${escapeAttr(ogImage)}">`
  );

  if (extraHeadHTML) {
    html = html.replace('</head>', `${extraHeadHTML}\n</head>`);
  }
  return html;
}

function flipActivePage(html, targetPageId) {
  html = html.replace(
    '<div class="page active" id="page-home">',
    '<div class="page" id="page-home">'
  );
  html = html.replace(
    `<div class="page" id="${targetPageId}">`,
    `<div class="page active" id="${targetPageId}">`
  );
  return html;
}

function findClosingDiv(html, start) {
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = tagRe.exec(html))) {
    if (match[0].startsWith('</')) depth -= 1;
    else depth += 1;
    if (depth === 0) return tagRe.lastIndex;
  }
  throw new Error(`Could not find closing </div> for page block at ${start}`);
}

function keepOnlyPage(html, keepPageId) {
  const pageRe = /<div class="page(?: active)?" id="(page-[^"]+)">/g;
  const blocks = [];
  let match;
  while ((match = pageRe.exec(html))) {
    const start = match.index;
    const end = findClosingDiv(html, start);
    blocks.push({ id: match[1], start, end });
    pageRe.lastIndex = end;
  }
  if (!blocks.some(block => block.id === keepPageId)) {
    throw new Error(`Build failed: ${keepPageId} not found while pruning route HTML.`);
  }
  let out = '';
  let cursor = 0;
  for (const block of blocks) {
    out += html.slice(cursor, block.start);
    if (block.id === keepPageId) out += html.slice(block.start, block.end);
    cursor = block.end;
  }
  out += html.slice(cursor);
  return out;
}

// ── Product page generator ────────────────────────────────────────────────
function buildProductPage(template, product) {
  const canonical = `${BASE_ORIGIN}/the-work/${product.slug}/`;
  const title = `${product.name} | ${BRAND_NAME}`;
  const metaDesc = truncateChars(stripMarkdown(product.body) || stripMarkdown(product.specs) || product.name, 160);
  const ogImage = product.photos[0]?.image
    ? BASE_ORIGIN + product.photos[0].image
    : OG_IMAGE_FALLBACK;

  // The detail URL is always /the-work/{slug}/ (SEO-stable), but the breadcrumb
  // and back-link point at the work's actual section.
  const sec = sectionInfo(product);
  const productJsonLD = buildProductJsonLD(product, canonical);
  const breadcrumbJsonLD = buildBreadcrumbJsonLD([
    { name: 'Home', url: `${BASE_ORIGIN}/` },
    { name: sec.label, url: `${BASE_ORIGIN}${sec.path}` },
    { name: product.name, url: canonical }
  ]);

  const extraHead =
    `<script type="application/ld+json">${JSON.stringify(productJsonLD, null, 2)}</script>\n` +
    `<script type="application/ld+json">${JSON.stringify(breadcrumbJsonLD, null, 2)}</script>\n` +
    `<script>window._pendingSlug = ${JSON.stringify(product.slug)};</script>`;

  let html = rewriteHead(template, {
    title,
    description: metaDesc,
    canonical,
    ogType: 'product',
    ogImage,
    extraHeadHTML: extraHead
  });

  const detail = renderProductDetailHTML(product);

  html = html.replace(
    '<div class="page active" id="page-home">',
    '<div class="page" id="page-home">'
  );
  html = html.replace(
    /<div class="page" id="page-product">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
    `<div class="page active" id="page-product">
    <div class="product-detail">
      <a class="product-detail-back" href="${sec.path}" onclick="event.preventDefault(); showPage('${sec.pageId}')">← Back to ${escapeHtml(sec.label)}</a>
      <div class="product-detail-layout" id="productDetailLayout">${detail.layout}</div>
      <div class="product-detail-description" id="productDetailDescription">${detail.description}</div>
      <div style="text-align:center;margin-top:24px;padding-bottom:0" id="productDetailInquire">${detail.inquire}</div>
    </div>
  </div>`
  );

  return keepOnlyPage(html, 'page-product');
}

// ── The Work (catalogue index) generator ──────────────────────────────────
function buildTheWorkPage(template, catalogue) {
  const canonical = `${BASE_ORIGIN}/the-work/`;
  const title = `The Work | ${BRAND_NAME}`;
  const metaDesc = 'Handcrafted symbolic art, bas-relief works, and portraiture from the Arcane Visions atelier — limited editions for collectors of the Western Mystery Tradition.';
  const ogImage = OG_IMAGE_FALLBACK;

  // ItemList mirrors the visible page — the obtainable works only — so the
  // structured data never claims items the page no longer shows.
  const itemListLD = buildTheWorkItemListJsonLD((catalogue || []).filter(isAvailable));
  const extraHead = `<script type="application/ld+json">${JSON.stringify(itemListLD, null, 2)}</script>`;

  let html = rewriteHead(template, {
    title,
    description: metaDesc,
    canonical,
    ogType: 'website',
    ogImage,
    extraHeadHTML: extraHead
  });

  return keepOnlyPage(flipActivePage(html, 'page-the-work'), 'page-the-work');
}

function buildCommissionsPage(template) {
  const canonical = `${BASE_ORIGIN}/commissions/`;
  const title = `Commissions | ${BRAND_NAME}`;
  const metaDesc = 'Private commissions for symbolic art, bas-relief work, and ceremonial portraiture. Built to the order or tradition\'s exact specifications, in the Washington, DC region atelier.';
  const ogImage = OG_IMAGE_FALLBACK;

  let html = rewriteHead(template, {
    title,
    description: metaDesc,
    canonical,
    ogType: 'website',
    ogImage
  });

  return keepOnlyPage(flipActivePage(html, 'page-commissions'), 'page-commissions');
}

// Works in Private Collections — the prestige archive index. The grid is baked
// into the shared template (privateCollectionsGrid); this builder sets the head
// and prunes to the page, mirroring buildCommissionsPage.
function buildPrivateCollectionsPage(template) {
  const canonical = `${BASE_ORIGIN}/private-collections/`;
  const title = `Works in Private Collections | ${BRAND_NAME}`;
  const metaDesc = 'Significant works that have permanently left the Arcane Visions atelier and been placed in private collections — held here as part of the artistic record.';
  const ogImage = OG_IMAGE_FALLBACK;

  let html = rewriteHead(template, {
    title,
    description: metaDesc,
    canonical,
    ogType: 'website',
    ogImage
  });

  return keepOnlyPage(flipActivePage(html, 'page-private-collections'), 'page-private-collections');
}

function buildAboutPage(template, about) {
  const canonical = `${BASE_ORIGIN}/about/`;
  const title = `About | ${BRAND_NAME}`;
  const metaDesc = 'Arcane Visions is a ceremonial and esoteric atelier producing original artworks, symbolic art, and collector-grade occult works in the Washington, DC region.';
  const ogImage = OG_IMAGE_FALLBACK;

  let html = rewriteHead(template, {
    title,
    description: metaDesc,
    canonical,
    ogType: 'website',
    ogImage
  });

  html = flipActivePage(html, 'page-about');

  if (about && about.body) {
    html = html.replace(
      /<div class="prose" id="about-content">[\s\S]*?<\/div>/,
      `<div class="prose" id="about-content">${about.body}</div>`
    );
  }

  return keepOnlyPage(html, 'page-about');
}

// ── Sitemap ───────────────────────────────────────────────────────────────
function buildSitemap(catalogue) {
  const urls = [
    { loc: `${BASE_ORIGIN}/`,              priority: '1.0', changefreq: 'weekly'  },
    { loc: `${BASE_ORIGIN}/the-work/`,     priority: '0.9', changefreq: 'weekly'  },
    { loc: `${BASE_ORIGIN}/commissions/`,  priority: '0.8', changefreq: 'monthly' },
    { loc: `${BASE_ORIGIN}/private-collections/`, priority: '0.7', changefreq: 'monthly' },
    { loc: `${BASE_ORIGIN}/about/`,        priority: '0.7', changefreq: 'monthly' }
  ];
  for (const p of catalogue) {
    urls.push({
      loc: `${BASE_ORIGIN}/the-work/${p.slug}/`,
      priority: '0.8',
      changefreq: 'monthly'
    });
  }
  const today = new Date().toISOString().split('T')[0];
  const body = urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

// ── Main ──────────────────────────────────────────────────────────────────
console.log(`Building ${BRAND_NAME}...`);

if (fs.existsSync(DEST)) fs.rmSync(DEST, { recursive: true });
ensureDir(DEST);

// Explicit allowlist — public assets that ship to the deploy output.
const ASSET_FILES = [
  'index.html',
  '404.html',
  'privacy.html',
  'returns.html',
  'robots.txt',
  'llms.txt',
  '_headers',
  '_redirects'
];
const ASSET_DIRS = [
  'admin',
  'images'
];

for (const file of ASSET_FILES) {
  if (!copyFileIfPresent(file)) {
    console.warn(`  warn: allowlisted file missing from source: ${file}`);
  }
}
for (const dir of ASSET_DIRS) {
  copyTreeClean(path.join(SRC, dir), path.join(DEST, dir));
}

const catalogue = readCatalogue();
validateSlugs(catalogue);
console.log(`Validated ${catalogue.length} slug(s).`);

const home = readPage('home.md');
const about = readPage('about.md');
const commissions = readPage('commissions.md');
const privateCollections = readPage('private-collections.md');

ensureDir(path.join(DEST, 'data'));
fs.writeFileSync(
  path.join(DEST, 'data', 'site-content.json'),
  JSON.stringify({
    catalogue: catalogue.map(p => ({
      slug: p.slug,
      name: p.name,
      tradition: p.tradition,
      category: p.category,
      featured: p.featured,
      // Photos enriched with intrinsic image dimensions so the JS-side renderer
      // (createProductCard / showProduct) can emit width/height attributes
      // matching the static build output. Same source of truth, same CLS budget.
      photos: (p.photos || []).map(ph => {
        const d = imgDims(ph.image);
        return d ? { ...ph, width: d.width, height: d.height } : { ...ph };
      }),
      specs: p.specs,
      price: p.price,
      stripe_link: p.stripe_link || '',
      purchase_links: p.purchase_links || [],
      purchase_mode: p.purchase_mode,
      // Resolved section — the hydrated SPA consumes this directly so it never
      // re-derives (single source of truth = build.js readCatalogue).
      availability: p.availability,
      acquisition_status: p.acquisition_status || '',
      acquisition_note: p.acquisition_note || '',
      acquire_heading: p.acquire_heading || '',
      description: p.description
    })),
    home,
    about,
    commissions,
    privateCollections
  }, null, 2)
);

let template = fs.readFileSync(path.join(DEST, 'index.html'), 'utf-8');
template = bakeProductGridsIntoTemplate(template, catalogue);
// The home page keeps the template head (it does not pass through rewriteHead),
// so correct its og:image:width/height to the served default image here too.
fs.writeFileSync(path.join(DEST, 'index.html'), applyOgImageDims(keepOnlyPage(template, 'page-home')));

// Per-product static pages → /the-work/{slug}/index.html
for (const product of catalogue) {
  const pageHtml = buildProductPage(template, product);
  const outDir = path.join(DEST, 'the-work', product.slug);
  ensureDir(outDir);
  fs.writeFileSync(path.join(outDir, 'index.html'), pageHtml);
}

const theWorkPageHtml = buildTheWorkPage(template, catalogue);
ensureDir(path.join(DEST, 'the-work'));
fs.writeFileSync(path.join(DEST, 'the-work', 'index.html'), theWorkPageHtml);

const commissionsPageHtml = buildCommissionsPage(template);
ensureDir(path.join(DEST, 'commissions'));
fs.writeFileSync(path.join(DEST, 'commissions', 'index.html'), commissionsPageHtml);

const privateCollectionsPageHtml = buildPrivateCollectionsPage(template);
ensureDir(path.join(DEST, 'private-collections'));
fs.writeFileSync(path.join(DEST, 'private-collections', 'index.html'), privateCollectionsPageHtml);

const aboutPageHtml = buildAboutPage(template, about);
ensureDir(path.join(DEST, 'about'));
fs.writeFileSync(path.join(DEST, 'about', 'index.html'), aboutPageHtml);

fs.writeFileSync(path.join(DEST, 'sitemap.xml'), buildSitemap(catalogue));

console.log(
  `Done: ${catalogue.length} work(s), ` +
  `${catalogue.length} product pages, ` +
  `5 section pages (home, the-work, commissions, private-collections, about), ` +
  `sitemap.xml`
);
