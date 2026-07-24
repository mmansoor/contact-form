# Contact Form V2 Integration — LLM Handoff

Use this document as the complete implementation brief for integrating an existing website contact form with the production Contact Form V2 API.

## Objective

Update the website's existing contact form to submit through the V2 API while preserving its current markup, styling, accessibility, validation, and user experience unless a change is explicitly required below.

Do not modify the API service or use the legacy secret endpoint. First inspect the website repository to identify its framework, contact-form component, existing reCAPTCHA integration, environment-variable conventions, and tests. Then implement and test the frontend integration using the conventions already present in that repository.

## Production endpoint

```text
POST https://contact-form.wwt.co/api/v2/contact
```

The direct Cloud Run URL is a fallback only:

```text
https://contact-form-auqjiasrgq-uc.a.run.app/api/v2/contact
```

Do not append a secret to either URL.

## Select the target site

Use only the row matching the website being changed:

| Site | Browser origin | Optional fields | Client key |
|---|---|---|---|
| Web Wire Technologies | `https://wwt.co` or `https://www.wwt.co` | `phone`, `company`, `inquiry_type`, `subject` | Not required |
| CloudVantage | `https://cloudvantage.co` or `https://www.cloudvantage.co` | `phone`, `company`, `subject` | Not required |
| DonorNode | `https://donornode.com`, or `https://dev.donornode.cloud`, `https://demo.donornode.cloud`, `https://app.donornode.cloud` | `phone`, `organization`, `subject` | Required |

The API determines the site and email recipients from the browser-provided `Origin` header. Frontend JavaScript must not try to set `Origin`; browsers set this forbidden header automatically. Production requests from an origin absent from the table will receive HTTP `403`.

## Request format

Prefer JSON:

```http
POST /api/v2/contact HTTP/1.1
Content-Type: application/json
```

Example payload for WWT or CloudVantage:

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+1 555 123 4567",
  "company": "Example Company",
  "subject": "Project inquiry",
  "message": "I would like to discuss a project.",
  "g-recaptcha-response": "TOKEN_FROM_RECAPTCHA"
}
```

Example payload for DonorNode (use `organization`, not `company`):

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+1 555 123 4567",
  "organization": "Example Nonprofit",
  "subject": "Product inquiry",
  "message": "I would like to learn more.",
  "g-recaptcha-response": "TOKEN_FROM_RECAPTCHA",
  "company_website": ""
}
```

Rules:

- `name`, `email`, and `message` are required non-empty strings.
- `email` must have valid email syntax.
- `message` must not exceed 5,000 characters.
- `g-recaptcha-response` must contain a fresh client-side reCAPTCHA token.
- Send only fields listed for the selected site. Unknown fields cause HTTP `400`.
- Omit unused optional fields or send them as strings.
- DonorNode accepts the honeypot `company_website`; WWT and CloudVantage do not. On DonorNode, keep it visually hidden, out of normal keyboard navigation, and empty for human users. Do not confuse it with the legitimate `company` field used by WWT and CloudVantage.
- Both JSON and `application/x-www-form-urlencoded` are supported, but do not send `multipart/form-data` to V2.

## reCAPTCHA

reCAPTCHA is required for all currently configured sites.

Reuse the website's existing client-side reCAPTCHA implementation and public site key if present. Obtain a fresh token immediately before each submission and place it in `g-recaptcha-response`. Never put the server-side reCAPTCHA secret in frontend code or a public environment variable.

If the website does not already have reCAPTCHA configured, stop and report that its public site key and reCAPTCHA mode/version are required. Do not invent a key or silently bypass CAPTCHA.

Reset or refresh the CAPTCHA after every submission attempt so an expired or previously consumed token is not reused.

## DonorNode client key

DonorNode additionally requires:

```http
X-Contact-Client-Key: <configured plaintext client key>
```

Use the deployment platform's existing public/build-time environment-variable convention for the value; do not hard-code it in source control. This key is a client identifier and is necessarily visible to browser users, so it must not be treated as a server secret or used as the sole abuse-prevention mechanism.

The API CORS policy permits `X-Contact-Client-Key`. Do not work around browser security, embed AWS/GCP credentials, expose the server-side reCAPTCHA secret, or route submissions through an unrelated public proxy.

## Suggested browser request

Adapt this to the repository's framework and state-management conventions; do not paste it blindly if the project already has an API abstraction.

```js
const payload = {
  name: values.name.trim(),
  email: values.email.trim(),
  message: values.message.trim(),
  'g-recaptcha-response': recaptchaToken
};

if (values.phone?.trim()) payload.phone = values.phone.trim();
if (values.company?.trim()) payload.company = values.company.trim();
if (values.inquiry_type?.trim()) payload.inquiry_type = values.inquiry_type.trim();
if (values.subject?.trim()) payload.subject = values.subject.trim();
if ('company_website' in values) {
  payload.company_website = values.company_website;
}

const response = await fetch('https://contact-form.wwt.co/api/v2/contact', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
});

let result;
try {
  result = await response.json();
} catch {
  result = { result: false, message: 'The server returned an invalid response.' };
}

if (!response.ok || result.result !== true) {
  throw new Error(result.message || 'Your message could not be sent. Please try again.');
}
```

For DonorNode, map the organization field to `payload.organization` and add:

```js
headers: {
  'Content-Type': 'application/json',
  'X-Contact-Client-Key': publicContactClientKey
}
```

## UI behavior

Implement all of the following:

- Keep the submit button disabled while a request is in flight and prevent duplicate submission.
- Preserve native/client-side validation and show clear field-level errors where the project already supports them.
- Show the API's safe `message` value for expected failures, with a generic fallback for network failures or invalid responses.
- On success, show a clear confirmation and reset form fields only after the API returns HTTP `200` with `result: true`.
- Do not claim success merely because `fetch()` resolved; it resolves for HTTP error statuses too.
- Preserve the user's entered values on failure.
- Refresh/reset reCAPTCHA after success and failure.
- Keep status messages accessible, preferably with the project's existing `aria-live` pattern.
- Do not log the CAPTCHA token, client key, complete submission payload, or personal data.
- If supported by the project, use an `AbortController` or equivalent to avoid state updates after component unmount.

## API response contract

Every normal API response has this shape:

```json
{
  "result": true,
  "message": "Thanks. Your message has been sent successfully."
}
```

On failure, `result` is `false` and `message` describes the failure.

| Status | Meaning | Frontend behavior |
|---|---|---|
| `200` | Accepted | Treat as success only when `result === true`. |
| `400` | Invalid fields or failed/missing CAPTCHA | Show returned message and let the user correct/retry. |
| `403` | Origin rejected or DonorNode client key rejected | Show a generic configuration error; report the deployment/origin configuration. |
| `413` | Request too large | Ask the user to shorten the submission. |
| `415` | Wrong content type | Treat as an implementation error. |
| `429` | Rate limited | Ask the user to wait and retry. |
| `500`, `502`, `503` | API, CAPTCHA transport, or email delivery problem | Preserve form data and offer retry. |

## Local development caveat

The production V2 routing configuration documented here does not list localhost origins. A frontend running on localhost may receive `403` even when the implementation is correct. Do not weaken production origin rules merely for local testing. Use the project's approved preview origin, a local API instance with local routing config, or request that the intended development origin be added to the API configuration.

## Implementation workflow

1. Inspect the repository and identify the target site, form component, field names, reCAPTCHA setup, environment handling, and test commands.
2. State the target site's payload mapping and flag any missing prerequisites before editing.
3. Preserve the existing design and implement the smallest coherent integration.
4. Add or update tests covering success, validation failure, API failure, network failure, duplicate-submit prevention, and CAPTCHA reset behavior.
5. Run the relevant formatter, linter, type checker, tests, and production build.
6. Review the final diff for leaked secrets or personal data.
7. Report changed files, verification results, required environment variables, and any remaining deployment/configuration work.

## Acceptance criteria

- The form submits to exactly `https://contact-form.wwt.co/api/v2/contact` with `POST`.
- The payload uses the correct site-specific field names and contains no unknown fields.
- A fresh reCAPTCHA token is sent as `g-recaptcha-response`.
- Success is based on both the HTTP status and `result === true`.
- Loading, success, validation, server-error, and network-error states work without losing user input on failure.
- Duplicate submissions are prevented.
- No private server credential or reCAPTCHA secret is added to frontend code.
- Existing styling and accessibility behavior are preserved or improved.
- Automated checks and the production build pass.
- For DonorNode, the client-key environment value is configured in the target website's deployment platform.
