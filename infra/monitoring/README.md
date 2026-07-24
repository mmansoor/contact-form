# Monitoring rollout

This directory holds the first-pass production monitoring configuration for the `contact-form` Cloud Run service.

## Signals

- Cloud Run request `5xx` responses
- repeated `ses_delivery_failure` log events
- repeated `recaptcha_transport_failure` log events
- uptime failure on `GET /health`

Cloud Run reserves exact URL paths ending in `z`, so do not rename this probe to
`/healthz`; Google Frontend intercepts that path before it reaches Express.

## Rollout assumptions

Set these values before applying any policy:

- `PROJECT_ID`
- `SERVICE_NAME`
- `REGION`
- `OPS_EMAIL_CHANNEL_ID`
- `UPTIME_CHECK_ID`

The log-based metric filters assume the structured JSON event names emitted by `src/app.js` stay stable.
