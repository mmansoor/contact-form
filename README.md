# contact-form

Minimal Cloud Run service for the shared contact-form backend used by `wwt.co` and `cloudvantage.co`.

## Local development

```bash
npm install
npm run dev
```

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

## Endpoints

- `POST /api/contact/<shared-secret>`
- `OPTIONS /api/contact/<shared-secret>`
- `GET /contracts/<docs-secret>/openapi.yaml`
- `GET /contracts/<docs-secret>/docs`
- `GET /healthz`

See [INIT.md](./INIT.md) for ownership and operating rules.
