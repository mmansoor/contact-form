import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { routingConfigSchema } from './config-schema.js';

const ajv = new Ajv({ allErrors: true, useDefaults: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(routingConfigSchema);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_PATTERN.test(value);
}

function normalizeExactOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`origin rule is not a valid URL: ${value}`);
  }

  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (!isLocal && url.protocol !== 'https:') {
    throw new Error(`exact origin rule must use https: ${value}`);
  }

  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error(`exact origin rule must not include a path: ${value}`);
  }

  return url.origin;
}

function compileRegexRule(value) {
  if (!value.startsWith('^') || !value.endsWith('$')) {
    throw new Error(`regex origin rule must be anchored with ^ and $: ${value}`);
  }

  let regex;
  try {
    regex = new RegExp(value);
  } catch (error) {
    throw new Error(`regex origin rule is invalid: ${value} (${error.message})`);
  }

  return regex;
}

export function validateRoutingConfig(input) {
  const config = JSON.parse(JSON.stringify(input));

  if (!validateSchema(config)) {
    const messages = (validateSchema.errors || [])
      .map((error) => `${error.instancePath || '<root>'} ${error.message}`)
      .join('; ');
    throw new Error(`Contact form routing config schema invalid: ${messages}`);
  }

  config.defaultPolicy = {
    allowCredentials: false,
    allowedMethods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    maxBodyKb: 64,
    rateLimit: { enabled: false, windowSeconds: 60, maxRequests: 20 },
    ...(config.defaultPolicy || {})
  };

  for (const site of config.sites) {
    site.security = {
      clientKeyRequired: false,
      clientKeyHeader: 'X-Contact-Client-Key',
      clientKeyHash: null,
      captchaRequired: true,
      ...(site.security || {})
    };
    site.formPolicy = {
      requiredFields: ['name', 'email', 'message'],
      allowedFields: [],
      maxMessageLength: 5000,
      honeypotFields: [],
      ...(site.formPolicy || {})
    };
    if (!site.email.cc) {
      site.email.cc = [];
    }
  }

  // A browser preflights any non-safelisted client-key header. Keep CORS in
  // sync with per-site security config so a valid client-key policy cannot be
  // deployed with an unusable browser integration.
  const allowedHeaderNames = new Set(
    config.defaultPolicy.allowedHeaders.map((header) => header.toLowerCase())
  );
  for (const site of config.sites) {
    if (site.enabled !== false && site.security.clientKeyRequired) {
      const clientKeyHeader = site.security.clientKeyHeader;
      if (!allowedHeaderNames.has(clientKeyHeader.toLowerCase())) {
        config.defaultPolicy.allowedHeaders.push(clientKeyHeader);
        allowedHeaderNames.add(clientKeyHeader.toLowerCase());
      }
    }
  }

  const seenIds = new Set();
  const seenExactOrigins = new Map();

  for (const site of config.sites) {
    if (seenIds.has(site.id)) {
      throw new Error(`Duplicate site id: ${site.id}`);
    }
    seenIds.add(site.id);

    if (site.security.clientKeyRequired) {
      if (!site.security.clientKeyHash || !SHA256_HEX.test(site.security.clientKeyHash)) {
        throw new Error(
          `Site ${site.id} requires a client key but clientKeyHash is missing or not a sha256 hex string.`
        );
      }
    }

    for (const recipient of [...site.email.to, ...site.email.cc]) {
      if (!isValidEmail(recipient)) {
        throw new Error(`Site ${site.id} has an invalid email address: ${recipient}`);
      }
    }

    if (site.enabled === false) {
      continue;
    }

    for (const rule of site.originRules) {
      if (rule.type === 'exact') {
        const normalized = normalizeExactOrigin(rule.value);
        rule.value = normalized;
        if (seenExactOrigins.has(normalized)) {
          throw new Error(
            `Origin ${normalized} is claimed by both site "${seenExactOrigins.get(normalized)}" and "${site.id}".`
          );
        }
        seenExactOrigins.set(normalized, site.id);
      } else if (rule.type === 'regex') {
        rule._regex = compileRegexRule(rule.value);
      }
    }
  }

  return config;
}
