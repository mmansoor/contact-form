# INIT

Read this file before changing the `contact-form` service.

## Ownership and contract

This repository owns the production contact-form runtime, canonical `openapi.yaml`, protected API documentation, SES template sources, deployment workflow, and monitoring configuration.

`POST /api/v2/contact` is the only supported submission endpoint. The former shared-secret v1 endpoint is in a temporary `410 Gone` observation period; do not restore its business logic. Protected documentation remains available at `/contracts/<docs-secret>/openapi.yaml` and `/contracts/<docs-secret>/docs`.

OpenAPI is the canonical public contract. Update it and its tests in the same change whenever request fields, validation, response shapes, status codes, or documentation URLs change.

## Routing and startup

Valid routing configuration is mandatory. The service must fail before listening when `CONTACT_FORM_CONFIG_SOURCE` is missing or its selected configuration cannot be loaded and validated.

Routing configuration is the sole source of truth for:

- allowed browser origins
- notification and confirmation recipients
- per-site sender and branding
- accepted and required form fields
- client-key and reCAPTCHA requirements
- rate limits and body size

Configuration is loaded once at startup. Production changes require a new Secret Manager version and a new Cloud Run revision.

## Email and secrets

SES templates under `ses-templates/` are canonical and must be synchronized through CI/CD. Notification sends precede optional confirmations. Preserve stable structured-log event names because monitoring depends on them.

Runtime secrets are `CONTRACT_DOCS_SECRET`, `RECAPTCHA_SECRET`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`. Shared runtime configuration includes `AWS_REGION`, `CONTACT_FROM_EMAIL`, and the two SES template names. Do not reintroduce the retired `CONTACT_API_SECRET` or legacy global recipient/branding variables.

## Operational requirements

- Preserve `/healthz` and the protected documentation routes.
- Keep v1 tombstone logging free of the historical path secret.
- Alert on Cloud Run 5xx responses, repeated SES failures, repeated reCAPTCHA transport failures, and health-check failures.
- Run `npm run validate` before deployment.
- After the approved observation window, remove the tombstone and delete the legacy GCP secret; that final step intentionally ends v1 rollback capability.
