import express from 'express';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { loadConfig } from './config.js';
import { createContactRouter } from './contact/route.js';

const openApiPath = fileURLToPath(new URL('../openapi.yaml', import.meta.url));

function firstHeaderValue(value) {
  if (!value) {
    return '';
  }

  return String(value)
    .split(',')[0]
    .trim();
}

function jsonResponse(res, status, body) {
  return res.status(status).json(body);
}

function getRequestBaseUrl(req) {
  const protocol = firstHeaderValue(req.headers['x-forwarded-proto']) || req.protocol || 'http';
  const host = firstHeaderValue(req.headers['x-forwarded-host']) || req.headers.host || '';

  if (!host) {
    return '';
  }

  return `${protocol}://${host}`;
}

function withRuntimeOpenApiServer(rawSpec, baseUrl) {
  if (!baseUrl) {
    return rawSpec;
  }

  const serverBlock = `servers:\n  - url: ${baseUrl}\n`;
  const replaced = rawSpec.replace(/servers:\n(?:  - url: .*\n)+/, serverBlock);

  if (replaced !== rawSpec) {
    return replaced;
  }

  return rawSpec.replace(/(info:\n(?:  .*\n)+)/, `$1${serverBlock}`);
}

function logEvent(logger, level, event, fields = {}) {
  const target = typeof logger[level] === 'function' ? logger[level] : logger.log;
  target.call(
    logger,
    JSON.stringify({
      severity: level.toUpperCase(),
      service: 'contact-form',
      event,
      ...fields
    })
  );
}

function createSesClient(config) {
  return new SESv2Client({
    region: config.awsRegion,
    credentials: {
      accessKeyId: config.awsAccessKeyId,
      secretAccessKey: config.awsSecretAccessKey
    }
  });
}

async function defaultVerifyRecaptcha({
  recaptchaSecret,
  recaptchaVerifyUrl,
  token,
  remoteIp,
  fetchImpl = globalThis.fetch
}) {
  const payload = new URLSearchParams({
    secret: recaptchaSecret,
    response: token
  });

  if (remoteIp) {
    payload.set('remoteip', remoteIp);
  }

  const response = await fetchImpl(recaptchaVerifyUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: payload.toString()
  });

  if (!response.ok) {
    throw new Error(`reCAPTCHA verification failed with status ${response.status}`);
  }

  return response.json();
}

export function createApp({
  env = process.env,
  logger = console,
  verifyRecaptcha = defaultVerifyRecaptcha,
  fetchImpl = globalThis.fetch,
  routingConfig = null,
  sendContactEmail
} = {}) {
  if (!routingConfig) {
    throw new Error('Valid v2 routing configuration is required.');
  }

  const config = loadConfig(env);
  const app = express();
  const sesClient = createSesClient(config);

  app.disable('x-powered-by');

  app.use(
    '/api/v2/contact',
    createContactRouter({
      routingConfig,
      sesClient,
      contactFromEmail: config.contactFromEmail,
      recaptchaSecret: config.recaptchaSecret,
      recaptchaVerifyUrl: config.recaptchaVerifyUrl,
      verifyRecaptcha,
      sendEmail: sendContactEmail,
      notificationTemplate: config.sesAdminTemplate,
      confirmationTemplate: config.sesConfirmationTemplate,
      fetchImpl,
      logger
    })
  );

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const baseFields = {
        method: req.method,
        path: req.originalUrl.startsWith('/api/contact')
          ? '/api/contact/[redacted]'
          : req.originalUrl,
        status: res.statusCode,
        origin: req.headers.origin || null,
        latencyMs: Date.now() - startedAt
      };
      const level = res.statusCode >= 500 ? 'error' : 'info';
      logEvent(logger, level, 'request_outcome', baseFields);
    });
    next();
  });

  app.get('/', (req, res) => {
    res.type('text/plain').send('CloudVantage.co wwt.co');
  });

  app.get(['/healthz', '/healthz/'], (req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use('/contracts', async (req, res) => {
    const expectedDocsPrefix = `/${config.contractDocsSecret}`;
    if (!config.contractDocsSecret || !req.path.startsWith(expectedDocsPrefix)) {
      logEvent(logger, 'warn', 'contracts_secret_mismatch', {
        path: req.originalUrl,
        origin: req.headers.origin || null
      });
      return res.status(404).send('Not found.');
    }

    const suffix = req.path.slice(expectedDocsPrefix.length);
    if (suffix === '/openapi.yaml') {
      const rawSpec = await readFile(openApiPath, 'utf8');
      const runtimeSpec = withRuntimeOpenApiServer(rawSpec, getRequestBaseUrl(req));
      return res.type('application/yaml').send(runtimeSpec);
    }

    if (suffix === '/docs') {
      return res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>contact-form docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/contracts${expectedDocsPrefix}/openapi.yaml',
      dom_id: '#swagger-ui'
    });
  </script>
</body>
</html>`);
    }

    return res.status(404).send('Not found.');
  });

  app.use('/api/contact', (req, res) => {
    logEvent(logger, 'warn', 'v1_endpoint_retired', {
      method: req.method,
      origin: req.headers.origin || null,
      status: 410
    });
    res.set('Cache-Control', 'no-store');
    return jsonResponse(res, 410, {
      result: false,
      message: 'This endpoint has been retired. Use /api/v2/contact.'
    });
  });

  app.use((error, req, res, next) => {
    logEvent(logger, 'error', 'unhandled_application_error', {
      error: error.message,
      path: req.originalUrl
    });

    if (res.headersSent) {
      return next(error);
    }

    return jsonResponse(res, 500, {
      result: false,
      message: 'An unexpected error occurred. Please try again.'
    });
  });

  return app;
}
