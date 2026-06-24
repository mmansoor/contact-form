# INIT

Read this file first before changing anything in the `contact-form` repo.

## Service purpose

This service owns the production contact-form backend for `wwt.co` and `cloudvantage.co`.

It is the source of truth for:

- the runtime API implementation
- the canonical `openapi.yaml`
- the protected docs and raw contract URLs
- SES template JSON source files
- CI/CD workflows for validation, template sync, Cloud Run deploy, and monitoring rollout

This repo does not own website markup, styling, or page-level UX outside the shared API contract.

## Secret URL model

The public integration route is intentionally a shared unguessable path:

- `POST /api/contact/<shared-secret>`
- `OPTIONS /api/contact/<shared-secret>`

Protected docs use a separate secret:

- `GET /contracts/<docs-secret>/openapi.yaml`
- `GET /contracts/<docs-secret>/docs`

Do not casually change either secret path format. Website repos, manual QA flows, docs URLs, and monitoring assumptions depend on them.

## OpenAPI-first rule

`openapi.yaml` is the contract. Change it before changing request/response behavior.

Any code change that affects:

- form fields
- validation rules
- response shape
- status codes
- docs URLs

must update the OpenAPI contract and related tests in the same change.

## CORS policy

Allowed browser origins:

- `https://wwt.co` and any HTTPS subdomain of `wwt.co`
- `https://cloudvantage.co` and any HTTPS subdomain of `cloudvantage.co`
- `https://donornode.cloud`, its `app`/`dev`/`demo` HTTPS subdomains, and `https://donornode.com` (apex only)
- `http://localhost:<port>`
- `https://localhost:<port>`
- `http://127.0.0.1:<port>`
- `https://127.0.0.1:<port>`

All other browser origins must be rejected with `403`.

## reCAPTCHA and SES flow

For every valid request:

1. Validate required form fields and email syntax.
2. Verify Google reCAPTCHA server-side.
3. Send the admin notification email through Amazon SES v2.
4. Send the submitter confirmation email through Amazon SES v2.

SES sends are sequential on purpose. If the admin send fails, do not continue to the confirmation send.

## SES template ownership

The only source of truth for stored SES templates is:

- `ses-templates/contact-form-admin-notification-v2.json`
- `ses-templates/contact-form-confirmation-v2.json`

Do not edit templates in AWS manually and leave repo files stale. Merge to `main` should be the path that updates templates in `us-east-1`.

## CI/CD behavior

- PRs and pushes validate the app, tests, OpenAPI, and template JSON.
- Merges to `main` sync SES templates through GitHub OIDC into AWS.
- Merges to `main` deploy the service to Cloud Run with least-privilege GCP credentials.
- Monitoring resources live in `infra/monitoring/` and should be applied as part of production rollout.

## Monitoring and alerting

Production must alert the ops inbox for:

- any Cloud Run `5xx` responses
- repeated SES downstream failures
- repeated reCAPTCHA transport failures
- uptime failure on `GET /healthz`

Application logs are structured JSON. Preserve stable `event` names when possible because log-based metrics depend on them.

## Key environment variables

Required secrets:

- `CONTACT_API_SECRET`
- `CONTRACT_DOCS_SECRET`
- `RECAPTCHA_SECRET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

Required config:

- `AWS_REGION`
- `CONTACT_FROM_EMAIL`
- `CONTACT_TO_EMAIL`
- `SES_ADMIN_TEMPLATE`
- `SES_CONFIRMATION_TEMPLATE`

Branding fields:

- `BRAND_COMPANY_NAME`
- `BRAND_SITE_NAME`
- `BRAND_DOMAIN`
- `BRAND_URL`
- `BRAND_SUPPORT_EMAIL`
- `BRAND_TEAM_NAME`
- `BRAND_PRIVACY_URL`
- `BRAND_TERMS_URL`

Optional behavior overrides:

- `PORT`
- `RECAPTCHA_VERIFY_URL`
- `SERVICE_BASE_URL`

Optional per-tenant admin recipients (override `CONTACT_TO_EMAIL` for the matching origin; fall back to `CONTACT_TO_EMAIL` when unset):

- `CONTACT_TO_EMAIL_DONORNODE`
- `CONTACT_TO_EMAIL_CLOUDVANTAGE`
- `CONTACT_TO_EMAIL_WWT`

## Configurable v2 contact API

The v2 endpoint (`POST /api/v2/contact`) is a config-driven, multi-tenant alternative to the legacy shared-secret path. It is **opt-in and dormant by default** — it only activates when `CONTACT_FORM_CONFIG_SOURCE` is set.

### Config model

- Routing config is a single JSON document (see `config/contact-form-routing-config.sample.json`).
- Each site defines `originRules` (exact or regex), email recipients (`to`/`cc`), optional per-site confirmation, and security toggles (`clientKeyHash`, `captchaRequired`, rate-limit, etc.).
- Config is loaded once at startup. If validation fails the server will not start — Cloud Run rolls back the revision.
- To update production config: update the Secret Manager secret, then bounce the Cloud Run service. There is no TTL or hot-reload.

### Operating rules

- **No hard-coded domains** in application code. All origins live in config.
- The per-site `clientKeyHash` is a sha-256 of the plaintext client key. Store only the hash in config; distribute the plaintext to the frontend out-of-band.
- reCAPTCHA is required by default (`captchaRequired: true`). Sites that disable it must have an equivalent guard (client key + strict origin).
- The v2 router coexists with the legacy endpoint. Do not remove the legacy endpoint until all frontends have migrated.

### v2 config environment variables

- `CONTACT_FORM_CONFIG_SOURCE` — `file`, `env`, or `secret-manager` (unset = v2 dormant).
- `CONTACT_FORM_CONFIG_FILE` — path to local JSON (when source is `file`).
- `CONTACT_FORM_CONFIG_JSON` — inline JSON string (when source is `env`).
- `CONTACT_FORM_CONFIG_SECRET_NAME` — Secret Manager secret name (when source is `secret-manager`).
- `CONTACT_FORM_CONFIG_PROJECT_ID` — GCP project holding the secret (defaults to `GOOGLE_CLOUD_PROJECT` / Cloud Run metadata).

See [infra/gcp/secret-manager-iam.md](./infra/gcp/secret-manager-iam.md) for one-time Secret Manager setup.

## High-risk changes

Do not casually change:

- the secret contact URL
- the docs secret URL
- the JSON response shape
- status-code behavior
- required field names
- log event names consumed by monitoring

Those are contract-level changes and must be treated as coordinated rollout work.
