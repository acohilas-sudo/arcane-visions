# Commission inquiry email (Arcane Visions)

## What changed
The Begin Commission Inquiry form no longer relies on `mailto:` as the primary path.
Browsers POST to `POST /api/inquiry` (Cloudflare Pages Function). Success UI shows
only after the mail provider accepts the message. Mailto remains a visible fallback
link on the error state.

## Recipients (hard-coded)
- info@arcanevisionsstudios.com
- acohilas@gmail.com

## Secrets required (Cloudflare Pages → Settings → Environment variables)
| Name | Required | Notes |
|------|----------|-------|
| `RESEND_API_KEY` | YES | Resend API key. Never commit it. |
| `INQUIRY_FROM` | optional | Verified From, e.g. `Arcane Visions <info@arcanevisionsstudios.com>`. Defaults to `Arcane Visions Inquiries <onboarding@resend.dev>` (Resend test sender). |

## Deploy
```bash
npm run build
npx wrangler pages deploy dist/ --project-name=arcane-visions --branch=main
# then bind the secret:
npx wrangler pages secret put RESEND_API_KEY --project-name=arcane-visions
```

The Cloudflare API token used on this Mac currently **cannot** deploy Pages for
`arcanevisions.art` (token sees Workers on the ADVANCE account only; AV zone/Pages
live on another account). Use a token with Pages Edit on the account that owns
the `arcane-visions` Pages project, or set the secret + redeploy from the CF dashboard.

## Smoke test
Submit the form with subject override via temporary field, or POST:
```bash
curl -sS -X POST https://arcanevisions.art/api/inquiry \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://arcanevisions.art' \
  -d '{"name":"AV Diagnostic","email":"acohilas@gmail.com","commission_type":"Other / undecided","desired_work":"AV FORM DIAGNOSTIC TEST — ignore","notes":"ignore"}'
```
Expect `{"ok":true,"delivered":true,...}` once `RESEND_API_KEY` is set.
