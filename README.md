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

- `POST /api/contact/<shared-secret>`
- `OPTIONS /api/contact/<shared-secret>`
- `GET /contracts/<docs-secret>/openapi.yaml`
- `GET /contracts/<docs-secret>/docs`
- `GET /healthz`

See [INIT.md](./INIT.md) for ownership and operating rules.
