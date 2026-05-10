import test from 'node:test';
import assert from 'node:assert/strict';
import { inject } from 'light-my-request';
import { createApp } from '../src/app.js';

function createLogger() {
  const messages = [];
  return {
    messages,
    info(message) {
      messages.push(JSON.parse(message));
    },
    warn(message) {
      messages.push(JSON.parse(message));
    },
    error(message) {
      messages.push(JSON.parse(message));
    },
    log(message) {
      messages.push(JSON.parse(message));
    }
  };
}

function buildEnv() {
  return {
    CONTACT_API_SECRET: 'shared-secret',
    CONTRACT_DOCS_SECRET: 'docs-secret',
    RECAPTCHA_SECRET: 'recaptcha-secret',
    AWS_REGION: 'us-east-1',
    AWS_ACCESS_KEY_ID: 'key',
    AWS_SECRET_ACCESS_KEY: 'secret',
    CONTACT_FROM_EMAIL: 'noreply@wwt.co',
    CONTACT_TO_EMAIL: 'info@wwt.co',
    SES_ADMIN_TEMPLATE: 'contact-form-admin-notification-v2',
    SES_CONFIRMATION_TEMPLATE: 'contact-form-confirmation-v2',
    BRAND_DOMAIN: 'wwt.co'
  };
}

function buildApp(overrides = {}) {
  const logger = overrides.logger || createLogger();
  const sentEmails = [];
  const app = createApp({
    env: { ...buildEnv(), ...(overrides.env || {}) },
    logger,
    verifyRecaptcha: overrides.verifyRecaptcha || (async () => ({ success: true })),
    sendTemplatedEmail:
      overrides.sendTemplatedEmail ||
      (async (payload) => {
        sentEmails.push(payload);
      })
  });

  return { app, logger, sentEmails };
}

const validBody = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  message: 'Hello there',
  'g-recaptcha-response': 'token',
  phone: '555-555-1212',
  company: 'Example Co',
  inquiry_type: 'General Inquiry',
  subject: 'Need help'
};

async function sendForm(app, method, url, body, headers = {}) {
  const payload = new URLSearchParams(body).toString();
  return inject(app, {
    method,
    url,
    payload,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...headers
    }
  });
}

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

test('secret API route is required', async () => {
  const { app, logger } = buildApp();
  const response = await sendForm(app, 'POST', '/api/contact', validBody);
  assert.equal(response.statusCode, 404);
  assert.equal(JSON.parse(response.body).result, false);
  assert.match(logger.messages.find((entry) => entry.event === 'contact_secret_mismatch').event, /contact_secret_mismatch/);
});

test('protected docs route is required', async () => {
  const { app } = buildApp();
  const response = await inject(app, { method: 'GET', url: '/contracts/openapi.yaml' });
  assert.equal(response.statusCode, 404);
});

test('allows configured HTTPS origins and blocks others', async () => {
  const { app } = buildApp();
  const allowed = await inject(app, {
    method: 'OPTIONS',
    url: '/api/contact/shared-secret',
    headers: {
      origin: 'https://www.wwt.co'
    }
  });
  assert.equal(allowed.statusCode, 204);
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://www.wwt.co');

  const blocked = await sendForm(app, 'POST', '/api/contact/shared-secret', validBody, {
    origin: 'https://example.com'
  });
  assert.equal(blocked.statusCode, 403);
});

test('validates required fields and email syntax', async () => {
  const { app } = buildApp();

  const missing = await sendForm(app, 'POST', '/api/contact/shared-secret', {
    email: 'jane@example.com',
    message: 'Hello',
    'g-recaptcha-response': 'token'
  });
  assert.equal(missing.statusCode, 400);
  assert.equal(JSON.parse(missing.body).message, 'Name, email, and message are required.');

  const invalidEmail = await sendForm(app, 'POST', '/api/contact/shared-secret', {
    ...validBody,
    email: 'bad-email'
  });
  assert.equal(invalidEmail.statusCode, 400);
  assert.equal(JSON.parse(invalidEmail.body).message, 'Please provide a valid email address.');
});

test('rejects missing recaptcha token', async () => {
  const { app } = buildApp();
  const response = await sendForm(app, 'POST', '/api/contact/shared-secret', {
    ...validBody,
    'g-recaptcha-response': ''
  });
  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).message, 'Please complete the reCAPTCHA challenge.');
});

test('handles recaptcha transport failure and logs it', async () => {
  const logger = createLogger();
  const { app } = buildApp({
    logger,
    verifyRecaptcha: async () => {
      throw new Error('network down');
    }
  });

  const response = await sendForm(app, 'POST', '/api/contact/shared-secret', validBody);

  assert.equal(response.statusCode, 502);
  assert.equal(JSON.parse(response.body).message, 'Could not verify reCAPTCHA right now. Please try again.');
  assert.ok(logger.messages.some((entry) => entry.event === 'recaptcha_transport_failure'));
});

test('maps SES failures and logs downstream context', async () => {
  const logger = createLogger();
  const { app } = buildApp({
    logger,
    sendTemplatedEmail: async () => {
      throw new Error('SES unavailable');
    }
  });

  const response = await sendForm(app, 'POST', '/api/contact/shared-secret', validBody);

  assert.equal(response.statusCode, 503);
  assert.equal(
    JSON.parse(response.body).message,
    'Your message could not be sent right now. Please try again or email info@wwt.co.'
  );
  assert.ok(logger.messages.some((entry) => entry.event === 'ses_delivery_failure'));
});

test('returns success payload and sends both emails sequentially', async () => {
  const { app, sentEmails } = buildApp();
  const response = await sendForm(app, 'POST', '/api/contact/shared-secret', validBody, {
    origin: 'https://wwt.co'
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    result: true,
    message: 'Thanks. Your message has been sent successfully.'
  });
  assert.equal(sentEmails.length, 2);
  assert.equal(sentEmails[0].toEmail, 'info@wwt.co');
  assert.equal(sentEmails[1].toEmail, 'jane@example.com');
  assert.equal(response.headers['access-control-allow-origin'], 'https://wwt.co');
});

test('allows localhost origins for local browser testing', async () => {
  const { app, sentEmails } = buildApp();
  const response = await sendForm(app, 'POST', '/api/contact/shared-secret', validBody, {
    origin: 'http://localhost:3000'
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:3000');
  assert.equal(sentEmails.length, 2);
});

test('supports multipart form-data submissions', async () => {
  const { app } = buildApp();
  const boundary = '----contact-form-boundary';
  const multipartBody = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="name"',
    '',
    'Jane Doe',
    `--${boundary}`,
    'Content-Disposition: form-data; name="email"',
    '',
    'jane@example.com',
    `--${boundary}`,
    'Content-Disposition: form-data; name="message"',
    '',
    'Hello there',
    `--${boundary}`,
    'Content-Disposition: form-data; name="g-recaptcha-response"',
    '',
    'token',
    `--${boundary}--`,
    ''
  ].join('\r\n');
  const response = await inject(app, {
    method: 'POST',
    url: '/api/contact/shared-secret',
    payload: multipartBody,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`
    }
  });
  assert.equal(response.statusCode, 200);
});
