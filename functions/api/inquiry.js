/**
 * POST /api/inquiry — Arcane Visions commission inquiry.
 * Sends via Resend to BOTH info@arcanevisionsstudios.com AND acohilas@gmail.com.
 *
 * Required Pages secret: RESEND_API_KEY
 * Optional: INQUIRY_FROM (verified Resend from-address; defaults to onboarding@resend.dev)
 *
 * Success only after Resend accepts the send (2xx). Never claims mailto success.
 */
const RECIPIENTS = [
  'info@arcanevisionsstudios.com',
  'acohilas@gmail.com',
];

const CORS = {
  'Access-Control-Allow-Origin': 'https://arcanevisions.art',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...CORS,
      ...extraHeaders,
    },
  });
}

function clean(v, max = 5000) {
  if (typeof v !== 'string') return '';
  return v.replace(/\0/g, '').trim().slice(0, max);
}

function validEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 160;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet() {
  return json(405, {
    ok: false,
    error: 'Method not allowed. POST a commission inquiry JSON body.',
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Origin allowlist (browser form). Allow same-host previews too.
  const origin = request.headers.get('Origin') || '';
  const host = request.headers.get('Host') || '';
  const allowed =
    !origin ||
    origin === 'https://arcanevisions.art' ||
    origin === 'https://www.arcanevisions.art' ||
    /^https:\/\/[a-z0-9-]+\.arcane-visions\.pages\.dev$/.test(origin) ||
    (host && origin.endsWith('://' + host));
  if (!allowed) {
    return json(403, { ok: false, error: 'Forbidden origin.' });
  }

  let data;
  const ctype = (request.headers.get('Content-Type') || '').toLowerCase();
  try {
    if (ctype.includes('application/json')) {
      data = await request.json();
    } else {
      const fd = await request.formData();
      data = {};
      fd.forEach((val, key) => { data[key] = typeof val === 'string' ? val : ''; });
    }
  } catch {
    return json(400, { ok: false, error: 'Expected JSON or form body.' });
  }

  // Honeypot — pretend OK so bots get nothing useful.
  if (clean(data.company_url, 200)) {
    return json(200, { ok: true, delivered: false, honeypot: true });
  }

  const fields = {
    name: clean(data.name, 120),
    email: clean(data.email, 160).toLowerCase(),
    commission_type: clean(data.commission_type, 120),
    desired_work: clean(data.desired_work, 200),
    budget_range: clean(data.budget_range, 120),
    timeline: clean(data.timeline, 120),
    intended_use: clean(data.intended_use, 4000),
    symbolic_references: clean(data.symbolic_references, 4000),
    notes: clean(data.notes, 4000),
  };

  if (!fields.name || !fields.email || !fields.commission_type) {
    return json(400, {
      ok: false,
      error: 'Name, email, and commission type are required.',
    });
  }
  if (!validEmail(fields.email)) {
    return json(400, { ok: false, error: 'A valid email is required.' });
  }

  const key = env.RESEND_API_KEY;
  if (!key) {
    return json(503, {
      ok: false,
      error:
        'Inquiry email is not configured (missing RESEND_API_KEY). Please write to info@arcanevisionsstudios.com.',
      code: 'missing_resend_key',
    });
  }

  const subjectBase = fields.desired_work
    ? `Commission Inquiry — ${fields.commission_type} — ${fields.desired_work}`
    : `Commission Inquiry — ${fields.commission_type}`;
  // Diagnostic / normal subjects pass through; cap length.
  const subject = clean(data.subject_override || subjectBase, 200);

  const lines = [
    'New commission inquiry from arcanevisions.art',
    '',
    `Name: ${fields.name}`,
    `Email: ${fields.email}`,
    `Commission Type: ${fields.commission_type}`,
  ];
  if (fields.desired_work) lines.push(`Desired Work: ${fields.desired_work}`);
  if (fields.budget_range) lines.push(`Budget Range: ${fields.budget_range}`);
  if (fields.timeline) lines.push(`Timeline: ${fields.timeline}`);
  if (fields.intended_use) lines.push('', 'Intended Use:', fields.intended_use);
  if (fields.symbolic_references)
    lines.push('', 'Symbolic References:', fields.symbolic_references);
  if (fields.notes) lines.push('', 'Additional Notes:', fields.notes);
  lines.push('', `Reply-To: ${fields.email}`);

  const from =
    clean(env.INQUIRY_FROM, 200) ||
    'Arcane Visions Inquiries <onboarding@resend.dev>';

  async function sendWithResend(toList) {
    const payload = {
      from,
      to: toList,
      reply_to: fields.email,
      subject,
      text: lines.join('\n'),
    };
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const raw = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { parsed = { raw: raw.slice(0, 500) }; }
    return { res, parsed };
  }

  let toList = RECIPIENTS.slice();
  let result;
  try {
    result = await sendWithResend(toList);
  } catch (err) {
    return json(502, {
      ok: false,
      error: 'Could not reach the mail provider. Please email info@arcanevisionsstudios.com directly.',
      code: 'provider_network',
    });
  }

  // Resend test-mode restriction: until a domain is verified, only the account
  // owner's mailbox (acohilas@gmail.com) can be a recipient when FROM is
  // onboarding@resend.dev. Retry Gmail-only so inquiries are not silently lost.
  const msg = (result.parsed && (result.parsed.message || '')) || '';
  if (!result.res.ok && /only send testing emails to your own email address/i.test(msg)) {
    toList = ['acohilas@gmail.com'];
    try {
      result = await sendWithResend(toList);
    } catch (err) {
      return json(502, {
        ok: false,
        error: 'Could not reach the mail provider. Please email info@arcanevisionsstudios.com directly.',
        code: 'provider_network',
      });
    }
  }

  if (!result.res.ok) {
    const providerMessage =
      (result.parsed && (result.parsed.message || result.parsed.name || result.parsed.error)) || undefined;
    return json(502, {
      ok: false,
      error:
        'The atelier mailbox did not accept this inquiry. Please email info@arcanevisionsstudios.com directly.',
      code: 'provider_rejected',
      provider_status: result.res.status,
      provider_message: providerMessage,
    });
  }

  // Recipient details stay server-side (visible in Cloudflare function logs),
  // never in the browser response — keeps the personal mailbox off the wire.
  if (toList.length !== RECIPIENTS.length) {
    console.log('inquiry: delivered to fallback mailbox only; verify a Resend domain and set INQUIRY_FROM to enable dual-send.');
  }

  return json(200, {
    ok: true,
    delivered: true,
  });
}
