import test from 'node:test';
import assert from 'node:assert/strict';
import { inject } from 'light-my-request';
import { createApp } from '../../src/app.js';
import { validateRoutingConfig } from '../../src/contact/validate-config.js';

const DONORNODE_KEY = 'donornode-sample-client-key';
const DONORNODE_KEY_HASH = '1f66150ca537650759b6cf81ab2b5d2f272bcffd8601a72b8775a8a4733a33cd';

function routingConfig() {
  return validateRoutingConfig({
    version: '1',
    defaultPolicy: {
      allowCredentials: false,
      allowedMethods: ['POST', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-Id',
        'X-Contact-Client-Key'
      ],
      maxBodyKb: 64,
      rateLimit: { enabled: false }
    },
    sites: [
      {
        id: 'donornode',
        originRules: [
          { type: 'exact', value: 'https://donornode.com' },
          { type: 'regex', value: '^https://(dev|demo|app)\\.donornode\\.cloud$' }
        ],
        email: {
          to: ['contact@donornode.com', 'support@donornode.com'],
          cc: ['admin@donornode.com'],
          replyToFromForm: true,
          confirmation: { enabled: true }
        },
        formPolicy: {
          requiredFields: ['name', 'email', 'message'],
          allowedFields: ['name', 'email', 'phone', 'organization', 'subject', 'message'],
          maxMessageLength: 50,
          honeypotFields: ['company_website']
        },
        security: {
          clientKeyRequired: true,
          clientKeyHash: DONORNODE_KEY_HASH,
          captchaRequired: true
        },
        branding: { siteName: 'DonorNode', supportEmail: 'support@donornode.com' }
      },
      {
        id: 'wwt',
        originRules: [{ type: 'exact', value: 'https://wwt.co' }],
        email: { to: ['info@wwt.co'] },
        formPolicy: { allowedFields: ['name', 'email', 'message'] }
      },
      {
        id: 'cloudvantage',
        originRules: [{ type: 'exact', value: 'https://cloudvantage.co' }],
        email: { from: 'noreply@cloudvantage.co', to: ['info@cloudvantage.co'] },
        formPolicy: { allowedFields: ['name', 'email', 'message'] }
      }
    ]
  });
}

function buildApp(overrides = {}) {
  const sent = [];
  const app = createApp({
    env: {
      CONTACT_API_SECRET: 'x',
      CONTRACT_DOCS_SECRET: 'd',
      RECAPTCHA_SECRET: 'r',
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'k',
      AWS_SECRET_ACCESS_KEY: 's',
      CONTACT_FROM_EMAIL: 'noreply@example.com',
      CONTACT_TO_EMAIL: 'info@example.com',
      BRAND_DOMAIN: 'wwt.co'
    },
    routingConfig: overrides.routingConfig || routingConfig(),
    verifyRecaptcha: overrides.verifyRecaptcha || (async () => ({ success: true })),
    sendContactEmail: async (payload) => {
      sent.push(payload);
    }
  });
  return { app, sent };
}

const validBody = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  message: 'Hello there',
  'g-recaptcha-response': 'token'
};

function post(app, body, headers = {}) {
  return inject(app, {
    method: 'POST',
    url: '/api/v2/contact',
    payload: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers }
  });
}

test('rejects unknown origin with 403 and sends no email', async () => {
  const { app, sent } = buildApp();
  const response = await post(app, validBody, { origin: 'https://evil.example.com' });
  assert.equal(response.statusCode, 403);
  assert.equal(sent.length, 0);
});

test('handles OPTIONS preflight for an allowed origin', async () => {
  const { app } = buildApp();
  const response = await inject(app, {
    method: 'OPTIONS',
    url: '/api/v2/contact',
    headers: { origin: 'https://donornode.com', 'Access-Control-Request-Method': 'POST' }
  });
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['access-control-allow-origin'], 'https://donornode.com');
  assert.equal(response.headers['access-control-allow-methods'], 'POST, OPTIONS');
  assert.match(
    response.headers['access-control-allow-headers'],
    /(?:^|,\s*)X-Contact-Client-Key(?:,|$)/i
  );
  assert.equal(response.headers.vary, 'Origin');
  assert.equal(response.headers['access-control-allow-credentials'], undefined);
});

test('preflight for a disallowed origin is 403', async () => {
  const { app } = buildApp();
  const response = await inject(app, {
    method: 'OPTIONS',
    url: '/api/v2/contact',
    headers: { origin: 'https://evil.example.com' }
  });
  assert.equal(response.statusCode, 403);
});

test('allows an exact origin and routes to the configured recipients', async () => {
  const { app, sent } = buildApp();
  const response = await post(app, validBody, {
    origin: 'https://donornode.com',
    'x-contact-client-key': DONORNODE_KEY
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(sent[0].to, ['contact@donornode.com', 'support@donornode.com']);
  assert.deepEqual(sent[0].cc, ['admin@donornode.com']);
  assert.deepEqual(sent[0].replyTo, ['jane@example.com']);
  assert.equal(sent[0].templateName, 'contact-form-admin-notification-v2');
  assert.equal(sent[0].templateData.name, 'Jane Doe');
  assert.equal(sent[0].templateData.email, 'jane@example.com');
  assert.equal(sent[0].templateData.brand_site_name, 'DonorNode');
  // confirmation email goes to the submitter
  assert.deepEqual(sent[1].to, ['jane@example.com']);
  assert.equal(sent[1].templateName, 'contact-form-confirmation-v2');
});

test('allows a regex origin', async () => {
  const { app, sent } = buildApp();
  const response = await post(app, validBody, {
    origin: 'https://dev.donornode.cloud',
    'x-contact-client-key': DONORNODE_KEY
  });
  assert.equal(response.statusCode, 200);
  assert.equal(sent.length, 2);
});

test('uses a per-site sender address when configured', async () => {
  const { app, sent } = buildApp();
  const response = await post(app, validBody, { origin: 'https://cloudvantage.co' });

  assert.equal(response.statusCode, 200);
  assert.equal(sent[0].fromEmail, 'noreply@cloudvantage.co');
  assert.deepEqual(sent[0].to, ['info@cloudvantage.co']);
});

test('falls back to the global sender when a site sender is not configured', async () => {
  const { app, sent } = buildApp();
  const response = await post(app, validBody, { origin: 'https://wwt.co' });

  assert.equal(response.statusCode, 200);
  assert.equal(sent[0].fromEmail, 'noreply@example.com');
});

test('requires the per-site client key when configured', async () => {
  const { app, sent } = buildApp();
  const missing = await post(app, validBody, { origin: 'https://donornode.com' });
  assert.equal(missing.statusCode, 403);
  assert.equal(sent.length, 0);

  const wrong = await post(app, validBody, {
    origin: 'https://donornode.com',
    'x-contact-client-key': 'wrong-key'
  });
  assert.equal(wrong.statusCode, 403);
  assert.equal(sent.length, 0);
});

test('rejects POST with missing required fields', async () => {
  const { app, sent } = buildApp();
  const response = await post(
    app,
    { name: 'Jane', email: 'jane@example.com', 'g-recaptcha-response': 'token' },
    { origin: 'https://wwt.co' }
  );
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).message, /Missing required field: message/);
  assert.equal(sent.length, 0);
});

test('rejects POST with an invalid email', async () => {
  const { app } = buildApp();
  const response = await post(
    app,
    { ...validBody, email: 'bad-email' },
    { origin: 'https://wwt.co' }
  );
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).message, /valid email/);
});

test('rejects an over-long message', async () => {
  const { app } = buildApp();
  const response = await post(
    app,
    { ...validBody, message: 'x'.repeat(51) },
    { origin: 'https://donornode.com', 'x-contact-client-key': DONORNODE_KEY }
  );
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).message, /characters or fewer/);
});

test('rejects unknown fields when allowedFields is set', async () => {
  const { app } = buildApp();
  const response = await post(
    app,
    { ...validBody, phone: '555' },
    { origin: 'https://wwt.co' }
  );
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).message, /Unexpected field: phone/);
});

test('requires a captcha token when captchaRequired is true', async () => {
  const { app, sent } = buildApp();
  const response = await post(
    app,
    { name: 'Jane', email: 'jane@example.com', message: 'Hello' },
    { origin: 'https://donornode.com', 'x-contact-client-key': DONORNODE_KEY }
  );
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).message, /reCAPTCHA/);
  assert.equal(sent.length, 0);
});

test('rejects unsupported content type', async () => {
  const { app } = buildApp();
  const response = await inject(app, {
    method: 'POST',
    url: '/api/v2/contact',
    payload: 'plain',
    headers: { 'content-type': 'text/plain', origin: 'https://wwt.co' }
  });
  assert.equal(response.statusCode, 415);
});

test('returns 405 for non-POST/OPTIONS methods from an allowed origin', async () => {
  const { app } = buildApp();
  const response = await inject(app, {
    method: 'GET',
    url: '/api/v2/contact',
    headers: { origin: 'https://wwt.co' }
  });
  assert.equal(response.statusCode, 405);
});

test('silently accepts a honeypot hit without sending email', async () => {
  const { app, sent } = buildApp();
  const response = await post(
    app,
    { ...validBody, company_website: 'http://spam.example' },
    { origin: 'https://donornode.com', 'x-contact-client-key': DONORNODE_KEY }
  );
  assert.equal(response.statusCode, 200);
  assert.equal(sent.length, 0);
});

test('rejects a request with no Origin header', async () => {
  const { app, sent } = buildApp();
  const response = await post(app, validBody);
  assert.equal(response.statusCode, 403);
  assert.equal(sent.length, 0);
});

test('skips captcha when captchaRequired is false', async () => {
  const cfg = routingConfig();
  cfg.sites[0].security.captchaRequired = false;
  const { app, sent } = buildApp({ routingConfig: cfg });
  const response = await post(
    app,
    { name: 'Jane', email: 'jane@example.com', message: 'Hello' },
    { origin: 'https://donornode.com', 'x-contact-client-key': DONORNODE_KEY }
  );
  assert.equal(response.statusCode, 200);
  assert.equal(sent.length, 2);
});
