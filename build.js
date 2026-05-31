const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const SRC = __dirname;
const DEST = path.join(__dirname, 'dist');
const BASE_ORIGIN = 'https://arcanevisions.art';
const BRAND_NAME = 'Arcane Visions';
const OG_IMAGE_FALLBACK = `${BASE_ORIGIN}/images/og-default.jpg`;

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
      featured: data.featured || false,
      featured_order: typeof data.featured_order === 'number' ? data.featured_order : null,
      photos: data.photos || [],
      specs: data.specs || '',
      price: data.price || '',
      purchase_links: Array.isArray(data.purchase_links) ? data.purchase_links.filter(l => l && l.url) : [],
      // 'direct'      = completed limited edition; checkout integration forthcoming
      // 'inquiry'     = one-of-one collector piece or made-to-specification
      // 'commission'  = bespoke commission requiring conversation
      purchase_mode: data.purchase_mode || 'inquiry',
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
  // Inquiry-only atelier: every offer is PreOrder pending consultation.
  return {
    '@type': 'Offer',
    url: canonical,
    price: price.toFixed(2),
    priceCurrency: 'USD',
    priceValidUntil: priceValidUntil(),
    availability: 'https://schema.org/PreOrder',
    itemCondition: 'https://schema.org/NewCondition',
    seller: {
      '@type': 'Organization',
      name: BRAND_NAME,
      url: BASE_ORIGIN
    }
  };
}

// ── Product JSON-LD ───────────────────────────────────────────────────────
function buildProductJsonLD(product, canonical) {
  const firstImg = product.photos[0]?.image
    ? BASE_ORIGIN + product.photos[0].image
    : OG_IMAGE_FALLBACK;
  const images = (product.photos || [])
    .map(photo => photo.image ? BASE_ORIGIN + photo.image : '')
    .filter(Boolean);
  const desc = truncateChars(stripMarkdown(product.body) || stripMarkdown(product.specs) || product.name, 300);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: desc,
    image: images.length ? images : firstImg,
    url: canonical,
    sku: productSku(product),
    mpn: productSku(product),
    category: product.category || 'Ceremonial Art',
    brand: { '@type': 'Brand', name: BRAND_NAME }
  };

  const prices = extractPrices(product);
  if (prices) ld.offers = buildOffer(product, canonical, prices.low);

  return ld;
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
// Three tiers of acquisition copy. The next-step note + the CTA button differ
// by tier; the underlying inquiry modal flow is the same until checkout ships.
function productNextStepHTML(purchaseMode) {
  if (purchaseMode === 'retail') {
    return `<div class="next-step-note">
        <div class="next-step-title">Available Now</div>
        <p>This work is available now at the fixed prices shown. Acquire a single panel or the complete set through Arcane Visions Studios.</p>
      </div>`;
  }
  if (purchaseMode === 'direct') {
    return `<div class="next-step-note">
        <div class="next-step-title">Direct Acquisition</div>
        <p>This piece is a completed limited edition. Direct purchase integration is forthcoming; in the meantime, reserve a piece by inquiry — pricing, current edition status, and shipping window confirmed on response.</p>
      </div>`;
  }
  if (purchaseMode === 'commission') {
    return `<div class="next-step-note">
        <div class="next-step-title">Commission Inquiry</div>
        <p>This piece is built to commission. Send the subject, scale, reference handling, materials, and timeline. We respond and confirm scope before work begins.</p>
      </div>`;
  }
  // 'inquiry' — one-of-one collector pieces and made-to-specification regalia
  return `<div class="next-step-note">
        <div class="next-step-title">Inquiry Details</div>
        <p>This piece is built to a particular order, grade, or collector context. Include intended use, dimensions, tradition or lineage, material preferences, deadline, and shipping country.</p>
      </div>`;
}

function productCTALabel(purchaseMode) {
  if (purchaseMode === 'retail') return 'Acquire This Work';
  if (purchaseMode === 'direct') return 'Reserve via Inquiry';
  if (purchaseMode === 'commission') return 'Begin a Commission Inquiry';
  return 'Send an Inquiry';
}

function renderProductDetailHTML(product) {
  const purchaseLinks = (product.purchase_links || []).filter(l => l && l.url);
  const isPurchasable = purchaseLinks.length > 0;
  const specsArr = (product.specs || '').split('\n').filter(Boolean);
  if (!isPurchasable && (product.purchase_mode || 'inquiry') !== 'retail' && !specsArr.some(s => /timeline/i.test(s))) {
    specsArr.push('Timeline: confirmed at commission inquiry');
  }

  const imgs = (product.photos || []).map(p => p.image).filter(Boolean);
  const imagesJson = JSON.stringify(imgs).replace(/"/g, '&quot;');
  const visualHTML = imgs.length
    ? `<div class="product-detail-images">
        <div class="zoom-hint">Click to zoom</div>
        ${imgs.map((img, i) => `<img src="${escapeAttr(img)}" alt="${escapeAttr(product.name)}" loading="lazy" data-lightbox-index="${i}" data-lightbox-images="${imagesJson}">`).join('\n        ')}
      </div>`
    : `<div class="product-detail-glyph">✦</div>`;

  const priceHTML = product.price
    ? `<div class="product-detail-price">${escapeHtml(product.price)}</div>`
    : `<div class="product-detail-price" style="color:var(--text-soft)">Price on Inquiry</div>`;

  const specsHTML = specsArr.length
    ? `<div class="product-detail-specs">${specsArr.map(s => `<div>${escapeHtml(s)}</div>`).join('')}</div>`
    : '';

  const safeName = escapeHtml(product.name).replace(/'/g, "\\'");
  const mode = product.purchase_mode || 'inquiry';
  const nextStepHTML = isPurchasable ? '' : productNextStepHTML(mode);
  const ctaLabel = productCTALabel(mode);
  // TODO: For purchase_mode === 'direct', replace this inquiry button with a
  // Stripe Checkout / Link button when the payment integration ships. Until
  // then, the inquiry modal serves both reservation and inquiry flows.
  const stripeMarker = (!isPurchasable && mode === 'direct')
    ? `\n<!-- TODO(stripe): Replace this CTA with a Stripe/Link checkout button when the payment integration is live. price=${escapeAttr(product.price || '')} sku=${productSku(product)} -->`
    : '';
  const inquireButtonHTML = isPurchasable
    ? purchaseLinks.map(l => `<a class="btn" href="${escapeAttr(l.url)}" data-cta="product-purchase">${escapeHtml(l.label || 'Purchase')}</a>`).join('\n      ')
    : `${stripeMarker}<button class="btn" onclick="openInquiry('${safeName}')">${escapeHtml(ctaLabel)}</button>`;

  return {
    layout: `
    <div>${visualHTML}</div>
    <div>
      <div class="product-detail-tradition">${escapeHtml(product.tradition || '')}</div>
      <div class="product-detail-name">${escapeHtml(product.name)}</div>
      ${priceHTML}
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
  const imgs = (product.photos || []).map(p => p.image).filter(Boolean);
  const specsArr = (product.specs || '').split('\n').filter(Boolean);
  const ctaLabel = ((product.purchase_links && product.purchase_links.length) || product.purchase_mode === 'retail') ? 'View / Purchase' : 'View / Inquire';
  let visualHTML;

  if (imgs.length) {
    const multiClass = imgs.length > 1 ? ' multi' : '';
    const imagesJson = JSON.stringify(imgs).replace(/"/g, '&quot;');
    visualHTML = `<div class="product-images${multiClass}">
      ${imgs.map((img, i) => `<img src="${escapeAttr(img)}" alt="${escapeAttr(product.name)}" loading="lazy" data-lightbox-index="${i}" data-lightbox-images="${imagesJson}">`).join('\n      ')}
    </div>`;
  } else {
    visualHTML = `<div class="product-glyph">✦</div>`;
  }

  let specsHTML;
  if (showSpecs) {
    const preview = specsArr.slice(0, 3).map(escapeHtml).join(' · ');
    specsHTML = `<div class="product-card-specs">${preview}</div>
    <div class="product-footer">
      <span class="product-price">${escapeHtml(product.price || 'Price on inquiry')}</span>
      <span class="product-card-cta" aria-hidden="true">${escapeHtml(ctaLabel)}</span>
    </div>`;
  } else {
    const short = [specsArr[0], specsArr[1]].filter(Boolean).map(escapeHtml).join(' · ');
    specsHTML = `<div style="font-size:14px;color:var(--text-soft);line-height:1.6;margin-bottom:20px">${short}</div>
    <div class="product-footer">
      <span class="product-price">${escapeHtml(product.price || 'Price on inquiry')}</span>
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

function bakeProductGridsIntoTemplate(template, catalogue) {
  const categories = ['All'];
  for (const product of catalogue) {
    if (product.category && !categories.includes(product.category)) categories.push(product.category);
  }

  // Explicit filter order by medium; categories not listed fall in afterward, in encounter order.
  const CATEGORY_ORDER = ['Stained Glass', 'Bas-Reliefs', 'Paintings & Panels', 'Portraiture', 'Wearable Works', 'Heraldic Works'];
  const presentCats = categories.filter(c => c !== 'All');
  const orderedCategories = ['All',
    ...CATEGORY_ORDER.filter(c => presentCats.includes(c)),
    ...presentCats.filter(c => !CATEGORY_ORDER.includes(c))
  ];

  const filters = orderedCategories
    .map((cat, i) => `<button class="filter-btn${i === 0 ? ' active' : ''}" type="button">${escapeHtml(cat)}</button>`)
    .join('\n        ');
  const catalogueCards = catalogue.map(product => renderProductCardHTML(product, true)).join('\n        ');
  // Home "Selected Works" — only featured items so the section reads as curated editorial.
  // /the-work/ still receives the full catalogue.
  const featuredCatalogue = catalogue
    .filter(p => p.featured)
    .sort((a, b) => (a.featured_order ?? Infinity) - (b.featured_order ?? Infinity));
  const featuredCards = (featuredCatalogue.length ? featuredCatalogue : catalogue)
    .map(product => renderProductCardHTML(product, false))
    .join('\n        ');

  return template
    .replace('<div class="filters" id="filterBar"></div>', `<div class="filters" id="filterBar">\n        ${filters}\n      </div>`)
    .replace('<div class="product-grid" id="catalogueGrid"></div>', `<div class="product-grid" id="catalogueGrid">\n        ${catalogueCards}\n      </div>`)
    .replace('<div class="product-grid" id="featuredGrid"></div>', `<div class="product-grid" id="featuredGrid">\n        ${featuredCards}\n      </div>`);
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

  const productJsonLD = buildProductJsonLD(product, canonical);
  const breadcrumbJsonLD = buildBreadcrumbJsonLD([
    { name: 'Home', url: `${BASE_ORIGIN}/` },
    { name: 'The Work', url: `${BASE_ORIGIN}/the-work/` },
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
      <a class="product-detail-back" href="/the-work/" onclick="event.preventDefault(); showPage('the-work')">← Back to The Work</a>
      <div class="product-detail-layout" id="productDetailLayout">${detail.layout}</div>
      <div class="product-detail-description" id="productDetailDescription">${detail.description}</div>
      <div style="text-align:center;margin-top:24px;padding-bottom:0" id="productDetailInquire">${detail.inquire}</div>
    </div>
  </div>`
  );

  return keepOnlyPage(html, 'page-product');
}

// ── The Work (catalogue index) generator ──────────────────────────────────
function buildTheWorkPage(template) {
  const canonical = `${BASE_ORIGIN}/the-work/`;
  const title = `The Work | ${BRAND_NAME}`;
  const metaDesc = 'Original esoteric and occult artworks, bas-relief works, and portraiture from the Arcane Visions atelier — limited and one-of-one works for collectors and patrons of the Western Mystery Tradition.';
  const ogImage = OG_IMAGE_FALLBACK;

  let html = rewriteHead(template, {
    title,
    description: metaDesc,
    canonical,
    ogType: 'website',
    ogImage
  });

  return keepOnlyPage(flipActivePage(html, 'page-the-work'), 'page-the-work');
}

function buildCommissionsPage(template) {
  const canonical = `${BASE_ORIGIN}/commissions/`;
  const title = `Commissions | ${BRAND_NAME}`;
  const metaDesc = 'Bespoke esoteric artistic commissions from the Arcane Visions atelier — original esoteric artworks, bas-relief works, and portraiture created to the collector\'s brief, in the Virginia / Washington DC area.';
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

function buildAboutPage(template, about) {
  const canonical = `${BASE_ORIGIN}/about/`;
  const title = `About | ${BRAND_NAME}`;
  const metaDesc = 'Arcane Visions is an esoteric art atelier creating original occult and esoteric artworks and bespoke commissions in the Virginia / Washington DC area.';
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

function buildContactPage(template) {
  const canonical = `${BASE_ORIGIN}/contact/`;
  const title = `Contact | ${BRAND_NAME}`;
  const metaDesc = 'Begin a commission or inquire about a piece. Arcane Visions is reached by direct correspondence at info@arcanevisionsstudios.com.';
  const ogImage = OG_IMAGE_FALLBACK;

  let html = rewriteHead(template, {
    title,
    description: metaDesc,
    canonical,
    ogType: 'website',
    ogImage
  });

  return keepOnlyPage(flipActivePage(html, 'page-contact'), 'page-contact');
}

// ── Sitemap ───────────────────────────────────────────────────────────────
function buildSitemap(catalogue) {
  const urls = [
    { loc: `${BASE_ORIGIN}/`,              priority: '1.0', changefreq: 'weekly'  },
    { loc: `${BASE_ORIGIN}/the-work/`,     priority: '0.9', changefreq: 'weekly'  },
    { loc: `${BASE_ORIGIN}/commissions/`,  priority: '0.8', changefreq: 'monthly' },
    { loc: `${BASE_ORIGIN}/about/`,        priority: '0.7', changefreq: 'monthly' },
    { loc: `${BASE_ORIGIN}/contact/`,      priority: '0.6', changefreq: 'yearly'  }
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
  'privacy.html',
  'returns.html',
  'robots.txt',
  'llms.txt',
  '_headers'
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
      photos: p.photos,
      specs: p.specs,
      price: p.price,
      purchase_mode: p.purchase_mode,
      purchase_links: p.purchase_links,
      description: p.description
    })),
    home,
    about,
    commissions
  }, null, 2)
);

let template = fs.readFileSync(path.join(DEST, 'index.html'), 'utf-8');
template = bakeProductGridsIntoTemplate(template, catalogue);
fs.writeFileSync(path.join(DEST, 'index.html'), keepOnlyPage(template, 'page-home'));

// Per-product static pages → /the-work/{slug}/index.html
for (const product of catalogue) {
  const pageHtml = buildProductPage(template, product);
  const outDir = path.join(DEST, 'the-work', product.slug);
  ensureDir(outDir);
  fs.writeFileSync(path.join(outDir, 'index.html'), pageHtml);
}

const theWorkPageHtml = buildTheWorkPage(template);
ensureDir(path.join(DEST, 'the-work'));
fs.writeFileSync(path.join(DEST, 'the-work', 'index.html'), theWorkPageHtml);

const commissionsPageHtml = buildCommissionsPage(template);
ensureDir(path.join(DEST, 'commissions'));
fs.writeFileSync(path.join(DEST, 'commissions', 'index.html'), commissionsPageHtml);

const aboutPageHtml = buildAboutPage(template, about);
ensureDir(path.join(DEST, 'about'));
fs.writeFileSync(path.join(DEST, 'about', 'index.html'), aboutPageHtml);

const contactPageHtml = buildContactPage(template);
ensureDir(path.join(DEST, 'contact'));
fs.writeFileSync(path.join(DEST, 'contact', 'index.html'), contactPageHtml);

fs.writeFileSync(path.join(DEST, 'sitemap.xml'), buildSitemap(catalogue));

console.log(
  `Done: ${catalogue.length} work(s), ` +
  `${catalogue.length} product pages, ` +
  `5 section pages (home, the-work, commissions, about, contact), ` +
  `sitemap.xml`
);
