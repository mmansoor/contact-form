import express from 'express';
import multer from 'multer';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { loadConfig } from './config.js';

const upload = multer();
const openApiPath = fileURLToPath(new URL('../openapi.yaml', import.meta.url));
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_BASE_DOMAINS = ['wwt.co', 'cloudvantage.co', 'webwiretech.com'];
const BRAND_PROFILES = {
  cloudvantage: {
    companyName: 'CloudVantage',
    siteName: 'CloudVantage',
    domain: 'cloudvantage.co',
    url: 'https://cloudvantage.co',
    supportEmail: 'info@cloudvantage.co',
    teamName: 'CloudVantage Team',
    privacyUrl: 'https://cloudvantage.co/privacy',
    termsUrl: 'https://cloudvantage.co/terms'
  },
  webWireTech: {
    companyName: 'Web Wire Technologies',
    siteName: 'Web Wire Tech',
    domain: 'wwt.co',
    url: 'https://wwt.co',
    supportEmail: 'info@wwt.co',
    teamName: 'Web Wire Tech Team',
    privacyUrl: 'https://wwt.co/privacy',
    termsUrl: 'https://wwt.co/terms'
  }
};

function firstHeaderValue(value) {
  if (!value) {
    return '';
  }

  return String(value)
    .split(',')[0]
    .trim();
}

function isValidEmail(email) {
  return EMAIL_PATTERN.test(email);
}

function jsonResponse(res, status, body) {
  return res.status(status).json(body);
}

function buildCorsHeaders(origin) {
  if (!origin) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  };
}

function isAllowedOrigin(originValue) {
  if (!originValue) {
    return null;
  }

  let origin;
  try {
    origin = new URL(originValue);
  } catch {
    return false;
  }

  const isLocalHost =
    origin.hostname === 'localhost' ||
    origin.hostname === '127.0.0.1';

  if (isLocalHost && (origin.protocol === 'http:' || origin.protocol === 'https:')) {
    return origin.origin;
  }

  if (origin.protocol !== 'https:') {
    return false;
  }

  for (const domain of ALLOWED_BASE_DOMAINS) {
    if (origin.hostname === domain || origin.hostname.endsWith(`.${domain}`)) {
      return origin.origin;
    }
  }

  return false;
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

function getBrandProfileForHostname(hostname, config) {
  if (hostname === 'cloudvantage.co' || hostname.endsWith('.cloudvantage.co')) {
    return BRAND_PROFILES.cloudvantage;
  }

  if (
    hostname === 'wwt.co' ||
    hostname.endsWith('.wwt.co') ||
    hostname === 'webwiretech.com' ||
    hostname.endsWith('.webwiretech.com')
  ) {
    return BRAND_PROFILES.webWireTech;
  }

  return {
    companyName: config.brandCompanyName || BRAND_PROFILES.webWireTech.companyName,
    siteName: config.brandSiteName || BRAND_PROFILES.webWireTech.siteName,
    domain: config.brandDomain || BRAND_PROFILES.webWireTech.domain,
    url: config.brandUrl || BRAND_PROFILES.webWireTech.url,
    supportEmail: config.brandSupportEmail || BRAND_PROFILES.webWireTech.supportEmail,
    teamName: config.brandTeamName || BRAND_PROFILES.webWireTech.teamName,
    privacyUrl: config.brandPrivacyUrl || BRAND_PROFILES.webWireTech.privacyUrl,
    termsUrl: config.brandTermsUrl || BRAND_PROFILES.webWireTech.termsUrl
  };
}

function buildContactTemplateData(config, payload) {
  const brand = getBrandProfileForHostname(payload.sourceDomain, config);

  return {
    name: payload.name,
    email: payload.email,
    phone: payload.phone || 'Not provided',
    company: payload.company || 'Not provided',
    subject: payload.subject || 'Website Contact Form Submission',
    inquiry_type: payload.inquiryType || 'General Inquiry',
    additional_fields_html: '',
    message: payload.message,
    ip_address: payload.remoteIp || 'Unavailable',
    admin_email: config.contactToEmail,
    source_domain: payload.sourceDomain,
    timestamp: payload.timestamp,
    brand_company_name: brand.companyName,
    brand_site_name: brand.siteName,
    brand_domain: brand.domain,
    brand_url: brand.url,
    brand_support_email: brand.supportEmail,
    brand_team_name: brand.teamName,
    brand_privacy_url: brand.privacyUrl,
    brand_terms_url: brand.termsUrl
  };
}

async function defaultVerifyRecaptcha({ config, token, remoteIp, fetchImpl = globalThis.fetch }) {
  const payload = new URLSearchParams({
    secret: config.recaptchaSecret,
    response: token
  });

  if (remoteIp) {
    payload.set('remoteip', remoteIp);
  }

  const response = await fetchImpl(config.recaptchaVerifyUrl, {
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

async function defaultSendTemplatedEmail({ client, config, toEmail, replyToAddresses, templateName, templateData }) {
  await client.send(
    new SendEmailCommand({
      FromEmailAddress: config.contactFromEmail,
      Destination: {
        ToAddresses: [toEmail]
      },
      ReplyToAddresses: replyToAddresses,
      Content: {
        Template: {
          TemplateName: templateName,
          TemplateData: JSON.stringify(templateData)
        }
      }
    })
  );
}

function formParser(req, res, next) {
  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('application/json')) {
    return express.json({ limit: '100kb' })(req, res, next);
  }

  if (contentType.includes('multipart/form-data')) {
    return upload.none()(req, res, next);
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return express.urlencoded({ extended: false })(req, res, next);
  }

  return next();
}

export function createApp({
  env = process.env,
  logger = console,
  verifyRecaptcha = defaultVerifyRecaptcha,
  sendTemplatedEmail = defaultSendTemplatedEmail,
  fetchImpl = globalThis.fetch
} = {}) {
  const config = loadConfig(env);
  const app = express();
  const sesClient = createSesClient(config);

  app.disable('x-powered-by');

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const baseFields = {
        method: req.method,
        path: req.originalUrl,
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

  app.use('/api/contact', formParser, async (req, res) => {
    const expectedApiPath = `/${config.contactApiSecret}`;
    if (!config.contactApiSecret || req.path !== expectedApiPath) {
      logEvent(logger, 'warn', 'contact_secret_mismatch', {
        method: req.method,
        path: req.originalUrl,
        origin: req.headers.origin || null
      });

      if (req.method === 'OPTIONS') {
        return res.status(404).end();
      }

      return jsonResponse(res, 404, { result: false, message: 'Not found.' });
    }

    const corsOrigin = isAllowedOrigin(req.headers.origin);
    if (req.method === 'OPTIONS') {
      if (corsOrigin === false) {
        return res.status(403).end();
      }

      return res.status(204).set(buildCorsHeaders(corsOrigin)).end();
    }

    if (corsOrigin === false) {
      return jsonResponse(res, 403, {
        result: false,
        message: 'This origin is not allowed to submit to the contact API.'
      });
    }

    res.set(buildCorsHeaders(corsOrigin));

    if (req.method === 'GET') {
      return jsonResponse(res, 200, {
        result: true,
        message: 'Contact form endpoint. Submit this route with POST.'
      });
    }

    if (req.method !== 'POST') {
      return jsonResponse(res, 405, { result: false, message: 'Method not allowed.' });
    }

    const contentType = req.headers['content-type'] || '';
    if (
      !contentType.includes('application/json') &&
      !contentType.includes('application/x-www-form-urlencoded') &&
      !contentType.includes('multipart/form-data')
    ) {
      return jsonResponse(res, 415, { result: false, message: 'Unsupported content type.' });
    }

    const body = req.body || {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();
    const company = String(body.company || '').trim();
    const inquiryType = String(body.inquiry_type || '').trim();
    const subject = String(body.subject || '').trim();
    const message = String(body.message || '').trim();
    const recaptchaToken = String(body['g-recaptcha-response'] || '').trim();

    if (!name || !email || !message) {
      return jsonResponse(res, 400, {
        result: false,
        message: 'Name, email, and message are required.'
      });
    }

    if (!isValidEmail(email)) {
      return jsonResponse(res, 400, {
        result: false,
        message: 'Please provide a valid email address.'
      });
    }

    if (!recaptchaToken) {
      return jsonResponse(res, 400, {
        result: false,
        message: 'Please complete the reCAPTCHA challenge.'
      });
    }

    if (!config.recaptchaSecret) {
      return jsonResponse(res, 500, {
        result: false,
        message: 'reCAPTCHA is not configured yet.'
      });
    }

    if (
      !config.awsAccessKeyId ||
      !config.awsSecretAccessKey ||
      !config.contactFromEmail ||
      !config.contactToEmail
    ) {
      return jsonResponse(res, 500, {
        result: false,
        message: 'Email delivery is not configured yet. Please email info@wwt.co.'
      });
    }

    try {
      const verification = await verifyRecaptcha({
        config,
        token: recaptchaToken,
        remoteIp: req.headers['x-forwarded-for'] || req.ip || '',
        fetchImpl
      });

      if (!verification.success) {
        return jsonResponse(res, 400, {
          result: false,
          message: 'reCAPTCHA verification failed. Please try again.'
        });
      }
    } catch (error) {
      logEvent(logger, 'error', 'recaptcha_transport_failure', {
        error: error.message,
        path: req.originalUrl
      });
      return jsonResponse(res, 502, {
        result: false,
        message: 'Could not verify reCAPTCHA right now. Please try again.'
      });
    }

    const timestamp = new Date().toISOString();
    const sourceDomain = req.headers.origin
      ? new URL(req.headers.origin).hostname
      : config.brandDomain;
    const templateData = buildContactTemplateData(config, {
      name,
      email,
      phone,
      company,
      inquiryType,
      subject,
      message,
      remoteIp: req.headers['x-forwarded-for'] || req.ip || '',
      sourceDomain,
      timestamp
    });

    try {
      await sendTemplatedEmail({
        client: sesClient,
        config,
        toEmail: config.contactToEmail,
        replyToAddresses: [email],
        templateName: config.sesAdminTemplate,
        templateData
      });

      await sendTemplatedEmail({
        client: sesClient,
        config,
        toEmail: email,
        replyToAddresses: [config.contactToEmail],
        templateName: config.sesConfirmationTemplate,
        templateData
      });
    } catch (error) {
      logEvent(logger, 'error', 'ses_delivery_failure', {
        error: error.message,
        path: req.originalUrl,
        template: error.templateName || null
      });
      return jsonResponse(res, 503, {
        result: false,
        message: 'Your message could not be sent right now. Please try again or email info@wwt.co.'
      });
    }

    return jsonResponse(res, 200, {
      result: true,
      message: 'Thanks. Your message has been sent successfully.'
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
