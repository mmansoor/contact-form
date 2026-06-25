import express from 'express';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { matchSiteByOrigin } from './match-origin.js';
import { routeContactEmails, defaultSendEmail } from './send.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function firstHeaderValue(value) {
  if (!value) {
    return '';
  }
  return String(value).split(',')[0].trim();
}

function logEvent(logger, level, event, fields = {}) {
  const target = typeof logger[level] === 'function' ? logger[level] : logger.log;
  target.call(
    logger,
    JSON.stringify({ severity: level.toUpperCase(), service: 'contact-form', event, ...fields })
  );
}

function buildCorsHeaders(origin, site, defaultPolicy) {
  const methods = (
    site.allowedMethods && site.allowedMethods.length
      ? site.allowedMethods
      : defaultPolicy.allowedMethods
  ).join(', ');

  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': defaultPolicy.allowedHeaders.join(', '),
    'Access-Control-Max-Age': '600',
    Vary: 'Origin'
  };

  if (defaultPolicy.allowCredentials) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return headers;
}

function checkClientKey(site, headerValue) {
  if (!site.security || !site.security.clientKeyRequired) {
    return true;
  }

  const expectedHash = site.security.clientKeyHash;
  if (!expectedHash || !headerValue) {
    return false;
  }

  const provided = createHash('sha256').update(String(headerValue)).digest();
  const expected = Buffer.from(expectedHash, 'hex');
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}

function createRateLimiter({ enabled, windowSeconds, maxRequests }) {
  if (!enabled) {
    return () => true;
  }

  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    let entry = buckets.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowSeconds * 1000 };
      buckets.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= maxRequests;
  };
}

async function defaultVerifyRecaptcha({
  recaptchaSecret,
  recaptchaVerifyUrl,
  token,
  remoteIp,
  fetchImpl
}) {
  const form = new URLSearchParams({ secret: recaptchaSecret, response: token });
  if (remoteIp) {
    form.set('remoteip', remoteIp);
  }

  const response = await fetchImpl(recaptchaVerifyUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });

  if (!response.ok) {
    throw new Error(`reCAPTCHA verification failed with status ${response.status}`);
  }

  return response.json();
}

function jsonResponse(res, status, body) {
  return res.status(status).json(body);
}

export function createContactRouter({
  routingConfig,
  sesClient,
  contactFromEmail,
  recaptchaSecret,
  recaptchaVerifyUrl,
  verifyRecaptcha = defaultVerifyRecaptcha,
  sendEmail = defaultSendEmail,
  notificationTemplate = 'contact-form-admin-notification-v2',
  confirmationTemplate = 'contact-form-confirmation-v2',
  fetchImpl = globalThis.fetch,
  logger = console
}) {
  const defaultPolicy = routingConfig.defaultPolicy || {};
  const maxBodyBytes = (defaultPolicy.maxBodyKb || 64) * 1024;
  const rateLimiter = createRateLimiter(defaultPolicy.rateLimit || {});
  const router = express.Router();

  router.use(express.json({ limit: maxBodyBytes }));
  router.use(express.urlencoded({ extended: false, limit: maxBodyBytes }));

  router.use('/', async (req, res, next) => {
    try {
      const requestId = firstHeaderValue(req.headers['x-request-id']) || randomUUID();
      res.set('X-Request-Id', requestId);

      const origin = req.headers.origin || null;
      const site = matchSiteByOrigin(routingConfig, origin);

      if (!site) {
        logEvent(logger, 'warn', 'origin_rejected', {
          origin,
          path: req.originalUrl,
          request_id: requestId
        });
        return jsonResponse(res, 403, {
          result: false,
          message: 'This origin is not allowed to submit to the contact API.'
        });
      }

      res.set(buildCorsHeaders(origin, site, defaultPolicy));

      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }

      if (req.method !== 'POST') {
        return jsonResponse(res, 405, { result: false, message: 'Method not allowed.' });
      }

      const contentType = req.headers['content-type'] || '';
      if (
        !contentType.includes('application/json') &&
        !contentType.includes('application/x-www-form-urlencoded')
      ) {
        return jsonResponse(res, 415, { result: false, message: 'Unsupported content type.' });
      }

      const remoteIp = firstHeaderValue(req.headers['x-forwarded-for']) || req.ip || '';
      const body = req.body || {};
      const formPolicy = site.formPolicy || {};
      const honeypotFields = formPolicy.honeypotFields || [];

      for (const field of honeypotFields) {
        if (String(body[field] || '').trim()) {
          logEvent(logger, 'info', 'honeypot_triggered', {
            site_id: site.id,
            request_id: requestId
          });
          return jsonResponse(res, 200, {
            result: true,
            message: 'Thanks. Your message has been sent successfully.'
          });
        }
      }

      if (!rateLimiter(`${site.id}:${remoteIp}`)) {
        return jsonResponse(res, 429, {
          result: false,
          message: 'Too many requests. Please try again later.'
        });
      }

      if (
        site.security &&
        site.security.clientKeyRequired &&
        !checkClientKey(site, req.headers[site.security.clientKeyHeader.toLowerCase()])
      ) {
        logEvent(logger, 'warn', 'client_key_mismatch', {
          site_id: site.id,
          request_id: requestId
        });
        return jsonResponse(res, 403, {
          result: false,
          message: 'This origin is not allowed to submit to the contact API.'
        });
      }

      const requiredFields = formPolicy.requiredFields || ['name', 'email', 'message'];
      for (const field of requiredFields) {
        if (!String(body[field] || '').trim()) {
          return jsonResponse(res, 400, {
            result: false,
            message: `Missing required field: ${field}.`
          });
        }
      }

      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim();
      const message = String(body.message || '').trim();

      if (!EMAIL_PATTERN.test(email)) {
        return jsonResponse(res, 400, {
          result: false,
          message: 'Please provide a valid email address.'
        });
      }

      const maxMessageLength = formPolicy.maxMessageLength || 5000;
      if (message.length > maxMessageLength) {
        return jsonResponse(res, 400, {
          result: false,
          message: `Message must be ${maxMessageLength} characters or fewer.`
        });
      }

      const allowedFields = formPolicy.allowedFields;
      if (Array.isArray(allowedFields) && allowedFields.length) {
        const allowed = new Set([...allowedFields, ...honeypotFields, 'g-recaptcha-response']);
        for (const key of Object.keys(body)) {
          if (!allowed.has(key)) {
            return jsonResponse(res, 400, {
              result: false,
              message: `Unexpected field: ${key}.`
            });
          }
        }
      }

      const captchaRequired = !(site.security && site.security.captchaRequired === false);
      const recaptchaToken = String(body['g-recaptcha-response'] || '').trim();
      if (captchaRequired) {
        if (!recaptchaToken) {
          return jsonResponse(res, 400, {
            result: false,
            message: 'Please complete the reCAPTCHA challenge.'
          });
        }

        if (!recaptchaSecret) {
          return jsonResponse(res, 500, {
            result: false,
            message: 'reCAPTCHA is not configured yet.'
          });
        }

        try {
          const verification = await verifyRecaptcha({
            recaptchaSecret,
            recaptchaVerifyUrl,
            token: recaptchaToken,
            remoteIp,
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
            site_id: site.id,
            request_id: requestId
          });
          return jsonResponse(res, 502, {
            result: false,
            message: 'Could not verify reCAPTCHA right now. Please try again.'
          });
        }
      }

      const payload = {
        name,
        email,
        message,
        phone: String(body.phone || '').trim(),
        organization: String(body.organization || '').trim(),
        subject: String(body.subject || '').trim(),
        origin,
        siteId: site.id,
        requestId,
        remoteIp,
        timestamp: new Date().toISOString()
      };

      try {
        await routeContactEmails({
          sendEmail,
          sesClient,
          fromEmail: contactFromEmail,
          site,
          payload,
          notificationTemplate,
          confirmationTemplate,
          logger
        });
      } catch (error) {
        logEvent(logger, 'error', 'ses_delivery_failure', {
          error: error.message,
          site_id: site.id,
          request_id: requestId
        });
        return jsonResponse(res, 503, {
          result: false,
          message: 'Your message could not be sent right now. Please try again later.'
        });
      }

      return jsonResponse(res, 200, {
        result: true,
        message: 'Thanks. Your message has been sent successfully.'
      });
    } catch (error) {
      next(error);
    }
  });

  router.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }
    if (error && (error.type === 'entity.parse.failed' || error.type === 'entity.too.large')) {
      const status = error.type === 'entity.too.large' ? 413 : 400;
      return jsonResponse(res, status, {
        result: false,
        message: status === 413 ? 'Request body too large.' : 'Malformed request body.'
      });
    }
    logEvent(logger, 'error', 'unhandled_application_error', {
      error: error.message,
      path: req.originalUrl
    });
    return jsonResponse(res, 500, {
      result: false,
      message: 'An unexpected error occurred. Please try again.'
    });
  });

  return router;
}
