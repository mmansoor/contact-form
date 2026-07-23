# V2 Contact API Reference

Reference for developers and coding agents integrating with or testing the configurable contact form API.

## Service URLs

| Environment | URL |
|---|---|
| Production (custom domain) | `https://contact-form.wwt.co` |
| Production (direct Cloud Run) | `https://contact-form-auqjiasrgq-uc.a.run.app` |
| GCP Project | `contact-form-495912` |
| Region | `us-central1` |

## Endpoint

```
POST /api/v2/contact
OPTIONS /api/v2/contact
```

The legacy endpoint (`POST /api/contact/<secret>`) still exists and is untouched. V2 is config-driven; no domains are hard-coded in the application.

## Request

### Required headers

| Header | Value | Notes |
|---|---|---|
| `Origin` | e.g. `https://wwt.co` | **Mandatory.** Must match a configured site's `originRules`. Requests with no `Origin` or an unlisted origin get `403`. |
| `Content-Type` | `application/json` or `application/x-www-form-urlencoded` | Required for POST. |

### Conditional headers

| Header | Required by | Value |
|---|---|---|
| `X-Contact-Client-Key` | Sites with `clientKeyRequired: true` (currently **donornode** only) | Plaintext client key. Server hashes it (SHA-256) and compares to `clientKeyHash` in config using `timingSafeEqual`. |

### Body fields

| Field | Required | Type | Notes |
|---|---|---|---|
| `name` | Yes | string | Min 1 char. |
| `email` | Yes | string | Must be valid email syntax. |
| `message` | Yes | string | Max length from site config (`maxMessageLength`, default 5000). |
| `phone` | No | string | |
| `organization` / `company` | No | string | Field name depends on site's `allowedFields`. |
| `subject` | No | string | |
| `g-recaptcha-response` | Conditional | string | Required when `captchaRequired: true` (default). |
| honeypot fields (e.g. `company_website`) | No | string | If present and non-empty, request is silently accepted (200) but no email is sent. |

Only fields listed in the site's `allowedFields` are accepted; unknown fields return `400`.

## Per-site configuration

| Site | Allowed origins | Client key | Captcha | Recipients | Confirmation |
|---|---|---|---|---|---|
| **wwt** | `https://wwt.co`, `https://www.wwt.co` | Not required | Required | `info@wwt.co` | Disabled |
| **cloudvantage** | `https://cloudvantage.co`, `https://www.cloudvantage.co` | Not required | Required | `info@cloudvantage.co` | Disabled |
| **donornode** | `https://donornode.com`, `https://www.donornode.com`, `^https://(dev\|demo\|app)\.donornode\.cloud$` | Required (`X-Contact-Client-Key`) | Required | `contact@donornode.com`, `support@donornode.com` (cc: `admin@donornode.com`) | Enabled |

### DonorNode client key

The sample client key `donornode-sample-client-key` hashes (SHA-256) to `1f66150ca537650759b6cf81ab2b5d2f272bcffd8601a72b8775a8a4733a33cd`. Replace with a real key in production.

## Security layers (in order)

1. **Origin check** — `Origin` header matched against site `originRules` (exact or anchored regex). No match → `403`.
2. **Honeypot** — if any honeypot field is filled, silently return `200` without sending email.
3. **Rate limit** — per-instance in-memory bucket (`site_id:ip`, default 20 req / 60s). Exceeded → `429`.
4. **Client key** — if `clientKeyRequired: true`, SHA-256 of provided key compared to config hash via `timingSafeEqual`. Mismatch → `403`.
5. **Field validation** — required fields present, email valid, message length, allowed fields only. Failure → `400`.
6. **reCAPTCHA** — token verified via Google siteverify. Missing → `400`, failed → `400`, transport error → `502`.

## Response codes

| Code | When | Body |
|---|---|---|
| `200` | Success (or honeypot hit) | `{"result":true,"message":"Thanks. Your message has been sent successfully."}` |
| `400` | Validation / reCAPTCHA failure | `{"result":false,"message":"<details>"}` |
| `403` | Origin not allowed or client key mismatch | `{"result":false,"message":"This origin is not allowed to submit to the contact API."}` |
| `405` | Non-POST/OPTIONS from allowed origin | `{"result":false,"message":"Method not allowed."}` |
| `413` | Body exceeds `maxBodyKb` | `{"result":false,"message":"Request body too large."}` |
| `415` | Unsupported Content-Type | `{"result":false,"message":"Unsupported content type."}` |
| `429` | Rate limit exceeded | `{"result":false,"message":"Too many requests. Please try again later."}` |
| `500` | Server config error | `{"result":false,"message":"An unexpected error occurred. Please try again."}` |
| `502` | reCAPTCHA transport failure | `{"result":false,"message":"Could not verify reCAPTCHA right now. Please try again."}` |
| `503` | SES delivery failure | `{"result":false,"message":"Your message could not be sent right now. Please try again later."}` |

## CORS behavior

- `OPTIONS` preflight from an allowed origin returns `204` with `Access-Control-Allow-Origin` echoing the matched origin (never `*`).
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization, X-Request-Id, X-Contact-Client-Key`
- `Access-Control-Max-Age: 600`
- `Vary: Origin`
- Credentials: off by default (`allowCredentials: false` in config).

## Email flow

1. **Notification email** — sent to site's `email.to` list (cc: `email.cc`). Uses the optional per-site `email.from` sender, falling back to `CONTACT_FROM_EMAIL`. Uses SES template `contact-form-admin-notification-v2` via `Content.Template`. Template data assembled from form fields + per-site `branding` config.
2. **Confirmation email** — sent to submitter only if `email.confirmation.enabled: true`. Uses SES template `contact-form-confirmation-v2`.

CloudVantage sends use `noreply@cloudvantage.co`; sites without `email.from` use the verified `CONTACT_FROM_EMAIL` fallback (`noreply@wwt.co`). SES templates are synced by the CI/CD pipeline on merge to `deployment`.

## Test examples

### wwt.co (no client key, captcha required)

```bash
# Preflight
curl -X OPTIONS https://contact-form.wwt.co/api/v2/contact \
  -H "Origin: https://wwt.co" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" \
  -D -

# Submit (will fail at captcha without a real token)
curl -X POST https://contact-form.wwt.co/api/v2/contact \
  -H "Content-Type: application/json" \
  -H "Origin: https://wwt.co" \
  -d '{"name":"Jane Doe","email":"jane@example.com","message":"Hello"}'
# → 400 "Please complete the reCAPTCHA challenge."
```

### donornode.com (client key required)

```bash
# Missing client key
curl -X POST https://contact-form.wwt.co/api/v2/contact \
  -H "Content-Type: application/json" \
  -H "Origin: https://donornode.com" \
  -d '{"name":"Jane","email":"jane@example.com","message":"Hello"}'
# → 403 "origin not allowed"

# With correct client key (captcha still required)
curl -X POST https://contact-form.wwt.co/api/v2/contact \
  -H "Content-Type: application/json" \
  -H "Origin: https://donornode.com" \
  -H "X-Contact-Client-Key: donornode-sample-client-key" \
  -d '{"name":"Jane","email":"jane@example.com","message":"Hello"}'
# → 400 "Please complete the reCAPTCHA challenge."

# With wrong client key
curl -X POST https://contact-form.wwt.co/api/v2/contact \
  -H "Content-Type: application/json" \
  -H "Origin: https://donornode.com" \
  -H "X-Contact-Client-Key: wrong-key" \
  -d '{"name":"Jane","email":"jane@example.com","message":"Hello"}'
# → 403 "origin not allowed"
```

### Rejected requests

```bash
# Disallowed origin
curl -X POST https://contact-form.wwt.co/api/v2/contact \
  -H "Content-Type: application/json" \
  -H "Origin: https://evil.com" \
  -d '{"name":"X","email":"x@x.com","message":"hi"}'
# → 403

# No Origin header
curl -X POST https://contact-form.wwt.co/api/v2/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"X","email":"x@x.com","message":"hi"}'
# → 403

# Missing required fields
curl -X POST https://contact-form.wwt.co/api/v2/contact \
  -H "Content-Type: application/json" \
  -H "Origin: https://wwt.co" \
  -d '{}'
# → 400 "Missing required field: name."
```

## Configuration

Routing config is a JSON document stored in GCP Secret Manager (`contact-form-routing-config` in project `contact-form-495912`). It is loaded **once at startup**. To update:

1. Edit the config JSON locally.
2. `gcloud secrets versions add contact-form-routing-config --project=contact-form-495912 --data-file=<path>`
3. Bounce the service: `gcloud run services update contact-form --project=contact-form-495912 --region=us-central1 --update-env-vars="_CONFIG_RELOAD=$(date +%s)"`

See `config/contact-form-routing-config.sample.json` for the full schema with all fields.

## CI/CD

- Pushes to `deployment` trigger the deploy workflow (validate → sync SES templates + IAM → deploy Cloud Run).
- GitHub repo variables: `GCP_PROJECT_ID=contact-form-495912`, `CLOUD_RUN_SERVICE=contact-form`, `CLOUD_RUN_REGION=us-central1`.
- GitHub secrets: `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT_EMAIL` (WIF auth for deploy).

## Key source files

| File | Purpose |
|---|---|
| `src/contact/route.js` | Express router — full request flow (origin, security, validation, send) |
| `src/contact/send.js` | SES template-based email sending + template data assembly |
| `src/contact/validate-config.js` | Schema + semantic validation of routing config |
| `src/contact/match-origin.js` | Origin matching (exact + regex) |
| `src/contact/load-config.js` | Config loader (Secret Manager / file / env) |
| `src/app.js` | Mounts v2 router at `/api/v2/contact` |
| `src/server.js` | Loads routing config at startup (fail-fast) |
| `src/config.js` | Environment variable wiring |
| `ses-templates/contact-form-admin-notification-v2.json` | Admin notification SES template (HTML) |
| `ses-templates/contact-form-confirmation-v2.json` | Submitter confirmation SES template |
| `test/contact/*.test.js` | 70 tests (validate-config, match-origin, load-config, route) |
