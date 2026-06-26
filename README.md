# contact-form

Minimal Cloud Run service for the shared contact-form backend used by `wwt.co`, `cloudvantage.co`, `donornode.cloud`, and `donornode.com`.

## Local development

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Local development loads `.env.local` automatically when you use `npm run dev`.

Required environment variables:

- `CONTACT_API_SECRET`
- `CONTRACT_DOCS_SECRET`
- `RECAPTCHA_SECRET`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `CONTACT_FROM_EMAIL`
- `CONTACT_TO_EMAIL`
- `SES_ADMIN_TEMPLATE`
- `SES_CONFIRMATION_TEMPLATE`

Optional environment variables:

- `PORT`
- `RECAPTCHA_VERIFY_URL`
- `SERVICE_BASE_URL`
- `CONTACT_TO_EMAIL_DONORNODE`
- `CONTACT_TO_EMAIL_CLOUDVANTAGE`
- `CONTACT_TO_EMAIL_WWT`
- `CONTACT_FORM_CONFIG_SOURCE`
- `CONTACT_FORM_CONFIG_FILE`
- `CONTACT_FORM_CONFIG_JSON`
- `CONTACT_FORM_CONFIG_SECRET_NAME`
- `CONTACT_FORM_CONFIG_PROJECT_ID`
- `BRAND_COMPANY_NAME`
- `BRAND_SITE_NAME`
- `BRAND_DOMAIN`
- `BRAND_URL`
- `BRAND_SUPPORT_EMAIL`
- `BRAND_TEAM_NAME`
- `BRAND_PRIVACY_URL`
- `BRAND_TERMS_URL`

Keep `.env.local` uncommitted. It is intended for local-only secrets such as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

## Cloud Run deployment

Cloud Run should provide the same environment variable names the app already expects.

Sensitive values should be injected as secret-backed environment variables:

- `CONTACT_API_SECRET`
- `CONTRACT_DOCS_SECRET`
- `RECAPTCHA_SECRET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

Non-secret configuration can be set as regular environment variables.

The repo includes a GitHub Actions workflow for the `deployment` branch that validates the app, updates the AWS managed runtime policy, syncs SES templates, and deploys to Cloud Run. The workflow expects GitHub secrets and variables for both AWS OIDC and Google Cloud authentication.

## Endpoints

### Legacy (hard-coded CORS, shared-secret path)

- `POST /api/contact/<shared-secret>`
- `OPTIONS /api/contact/<shared-secret>`
- `GET /contracts/<docs-secret>/openapi.yaml`
- `GET /contracts/<docs-secret>/docs`
- `GET /healthz`

### Configurable v2 (opt-in, config-driven routing)

- `POST /api/v2/contact`
- `OPTIONS /api/v2/contact`

The v2 router is **dormant by default**. It only mounts when `CONTACT_FORM_CONFIG_SOURCE` is set. Allowed origins, recipients, client keys, and per-site security toggles are all defined in the routing config — no domains are hard-coded in the application.

See [config/contact-form-routing-config.sample.json](./config/contact-form-routing-config.sample.json) for the full config shape.

For endpoint details, test examples, and per-site configuration see the **[V2 Contact API Reference](./docs/V2-CONTACT-API.md)**.

## Configurable v2 contact API

### Config sources

| `CONTACT_FORM_CONFIG_SOURCE` | How config is provided |
|---|---|
| _(unset)_ | v2 router is not mounted. Legacy endpoint works as before. |
| `file` | Load from the JSON file at `CONTACT_FORM_CONFIG_FILE`. |
| `env` | Load from inline JSON in `CONTACT_FORM_CONFIG_JSON`. |
| `secret-manager` | Fetch from GCP Secret Manager (`CONTACT_FORM_CONFIG_SECRET_NAME` in `CONTACT_FORM_CONFIG_PROJECT_ID`). |

Config is loaded **once at startup** and validated. If it fails validation the server will not start (Cloud Run revision fails health checks and rolls back). To update config in production: update the secret, then bounce the Cloud Run service.

### Local development with v2

```bash
CONTACT_FORM_CONFIG_SOURCE=file \
CONTACT_FORM_CONFIG_FILE=config/contact-form-routing-config.sample.json \
npm run dev
```

See [INIT.md](./INIT.md) for ownership and operating rules.
