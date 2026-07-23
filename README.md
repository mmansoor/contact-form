# contact-form

Config-driven Cloud Run contact-form backend for `wwt.co`, `cloudvantage.co`, `donornode.cloud`, and `donornode.com`.

## Local development

```bash
npm install
cp .env.local.example .env.local
CONTACT_FORM_CONFIG_SOURCE=file \
CONTACT_FORM_CONFIG_FILE=config/contact-form-routing-config.sample.json \
npm run dev
```

Valid v2 routing configuration is required at startup. It is loaded once and validated; invalid or missing configuration prevents the server from listening.

Required runtime secrets:

- `CONTRACT_DOCS_SECRET`
- `RECAPTCHA_SECRET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

Required runtime configuration:

- `AWS_REGION`
- `CONTACT_FROM_EMAIL`
- `SES_ADMIN_TEMPLATE`
- `SES_CONFIRMATION_TEMPLATE`
- `CONTACT_FORM_CONFIG_SOURCE` (`file`, `env`, or `secret-manager`)

Config source settings:

- `CONTACT_FORM_CONFIG_FILE`
- `CONTACT_FORM_CONFIG_JSON`
- `CONTACT_FORM_CONFIG_SECRET_NAME`
- `CONTACT_FORM_CONFIG_PROJECT_ID`

Keep `.env.local` and inline production secrets uncommitted.

## Endpoints

- `POST /api/v2/contact`
- `OPTIONS /api/v2/contact`
- `GET /contracts/<docs-secret>/openapi.yaml`
- `GET /contracts/<docs-secret>/docs`
- `GET /healthz`

The former `/api/contact/<shared-secret>` endpoint is retired. It temporarily returns `410 Gone` during the migration observation window and will ultimately return `404` after its tombstone is removed.

Allowed origins, recipients, client keys, confirmation behavior, and per-site security controls come exclusively from routing configuration. See [config/contact-form-routing-config.sample.json](./config/contact-form-routing-config.sample.json) for its shape and [docs/V2-CONTACT-API.md](./docs/V2-CONTACT-API.md) for the API reference.

## Deployment

Pushes to `deployment` run validation, synchronize AWS IAM and SES templates, and deploy to Cloud Run. Production uses the `secret-manager` routing-config source. Update its secret version and deploy a new revision to apply routing changes.

Run all local checks with:

```bash
npm run validate
```

See [INIT.md](./INIT.md) for ownership and operating rules.
