import test from 'node:test';
import assert from 'node:assert/strict';
import { inject } from 'light-my-request';
import { createApp } from '../src/app.js';

function createLogger() {
  const messages = [];
  const capture = (message) => messages.push(JSON.parse(message));
  return { messages, info: capture, warn: capture, error: capture, log: capture };
}

function buildEnv() {
  return {
    CONTRACT_DOCS_SECRET: 'docs-secret',
    RECAPTCHA_SECRET: 'recaptcha-secret',
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'key',
    AWS_SECRET_ACCESS_KEY: 'secret',
    CONTACT_FROM_EMAIL: 'noreply@wwt.co',
    SES_ADMIN_TEMPLATE: 'contact-form-admin-notification-v2',
    SES_CONFIRMATION_TEMPLATE: 'contact-form-confirmation-v2'
  };
}

function buildRoutingConfig() {
  return {
    version: '2026-07-24',
    service: 'contact-form-api',
    defaultPolicy: {
      allowCredentials: false,
      allowedMethods: ['POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
      maxBodyKb: 64,
      rateLimit: { enabled: false, windowSeconds: 60, maxRequests: 20 }
    },
    sites: [
      {
        id: 'wwt',
        enabled: true,
        originRules: [{ type: 'exact', value: 'https://wwt.co' }],
        email: { to: ['info@wwt.co'], replyToFromForm: true },
        formPolicy: {
          requiredFields: ['name', 'email', 'message'],
          allowedFields: ['name', 'email', 'message']
        },
        security: { clientKeyRequired: false, captchaRequired: false },
        branding: { siteName: 'Web Wire Technologies' }
      }
    ]
  };
}

function buildApp(overrides = {}) {
  const logger = overrides.logger || createLogger();
  const app = createApp({
    env: { ...buildEnv(), ...(overrides.env || {}) },
    routingConfig: overrides.routingConfig || buildRoutingConfig(),
    logger,
    sendContactEmail: async () => {}
  });
  return { app, logger };
}

test('requires v2 routing configuration', () => {
  assert.throws(
    () => createApp({ env: buildEnv(), routingConfig: null }),
    /Valid v2 routing configuration is required/
  );
});

test('healthz returns 200', async () => {
  const { app } = buildApp();
  const response = await inject(app, { method: 'GET', url: '/healthz' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { ok: true });
});

test('root returns the site names', async () => {
  const { app } = buildApp();
  const response = await inject(app, { method: 'GET', url: '/' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, 'CloudVantage.co wwt.co');
});

test('protected docs route is required', async () => {
  const { app } = buildApp();
  const response = await inject(app, { method: 'GET', url: '/contracts/openapi.yaml' });
  assert.equal(response.statusCode, 404);
});

test('protected OpenAPI spec uses localhost when served locally', async () => {
  const { app } = buildApp();
  const response = await inject(app, {
    method: 'GET',
    url: '/contracts/docs-secret/openapi.yaml',
    headers: { host: 'localhost:8080' }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /servers:\n  - url: http:\/\/localhost:8080\n/);
  assert.doesNotMatch(response.body, /\/api\/contact\//);
});

test('protected OpenAPI spec uses forwarded Cloud Run host', async () => {
  const { app } = buildApp();
  const response = await inject(app, {
    method: 'GET',
    url: '/contracts/docs-secret/openapi.yaml',
    headers: {
      host: 'internal-host',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'contact-form.wwt.co'
    }
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /servers:\n  - url: https:\/\/contact-form\.wwt\.co\n/);
});

for (const method of ['GET', 'POST', 'OPTIONS']) {
  test(`legacy ${method} requests return 410 without logging the secret`, async () => {
    const { app, logger } = buildApp();
    const response = await inject(app, {
      method,
      url: '/api/contact/legacy-secret',
      headers: { origin: 'https://wwt.co' }
    });
    assert.equal(response.statusCode, 410);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(JSON.parse(response.body), {
      result: false,
      message: 'This endpoint has been retired. Use /api/v2/contact.'
    });
    assert.ok(logger.messages.some((entry) => entry.event === 'v1_endpoint_retired'));
    assert.ok(
      logger.messages
        .filter((entry) => Object.hasOwn(entry, 'path'))
        .every((entry) => !entry.path.includes('legacy-secret'))
    );
  });
}

test('v2 remains mounted', async () => {
  const { app } = buildApp();
  const response = await inject(app, {
    method: 'OPTIONS',
    url: '/api/v2/contact',
    headers: { origin: 'https://wwt.co' }
  });
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['access-control-allow-origin'], 'https://wwt.co');
});
