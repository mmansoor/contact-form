import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRoutingConfig } from '../../src/contact/validate-config.js';

function baseConfig() {
  return {
    version: '1',
    sites: [
      {
        id: 'a',
        originRules: [{ type: 'exact', value: 'https://a.example.com' }],
        email: { to: ['owner@a.example.com'] }
      }
    ]
  };
}

test('accepts a minimal valid config and applies defaults', () => {
  const cfg = validateRoutingConfig(baseConfig());
  assert.equal(cfg.sites[0].enabled, true);
  assert.deepEqual(cfg.defaultPolicy.allowedMethods, ['POST', 'OPTIONS']);
  assert.equal(cfg.sites[0].security.captchaRequired, true);
  assert.equal(cfg.sites[0].email.replyToFromForm, true);
});

test('rejects duplicate site ids', () => {
  const cfg = baseConfig();
  cfg.sites.push({
    id: 'a',
    originRules: [{ type: 'exact', value: 'https://b.example.com' }],
    email: { to: ['x@b.example.com'] }
  });
  assert.throws(() => validateRoutingConfig(cfg), /Duplicate site id/);
});

test('rejects conflicting exact origins across enabled sites', () => {
  const cfg = baseConfig();
  cfg.sites.push({
    id: 'b',
    originRules: [{ type: 'exact', value: 'https://a.example.com' }],
    email: { to: ['x@b.example.com'] }
  });
  assert.throws(() => validateRoutingConfig(cfg), /is claimed by both/);
});

test('allows the same origin on a disabled site', () => {
  const cfg = baseConfig();
  cfg.sites.push({
    id: 'b',
    enabled: false,
    originRules: [{ type: 'exact', value: 'https://a.example.com' }],
    email: { to: ['x@b.example.com'] }
  });
  const out = validateRoutingConfig(cfg);
  assert.equal(out.sites.length, 2);
});

test('rejects invalid email in to list', () => {
  const cfg = baseConfig();
  cfg.sites[0].email.to = ['not-an-email'];
  assert.throws(() => validateRoutingConfig(cfg), /email/i);
});

test('rejects missing to list (schema required)', () => {
  const cfg = baseConfig();
  cfg.sites[0].email = { cc: ['x@a.example.com'] };
  assert.throws(() => validateRoutingConfig(cfg));
});

test('rejects missing originRules', () => {
  const cfg = baseConfig();
  delete cfg.sites[0].originRules;
  assert.throws(() => validateRoutingConfig(cfg));
});

test('rejects unanchored regex', () => {
  const cfg = baseConfig();
  cfg.sites[0].originRules = [{ type: 'regex', value: 'https://.*\\.example.com' }];
  assert.throws(() => validateRoutingConfig(cfg), /anchored/);
});

test('rejects invalid regex', () => {
  const cfg = baseConfig();
  cfg.sites[0].originRules = [{ type: 'regex', value: '^([\\)$' }];
  assert.throws(() => validateRoutingConfig(cfg), /regex origin rule is invalid/);
});

test('normalizes exact origin and compiles anchored regex', () => {
  const cfg = baseConfig();
  cfg.sites[0].originRules = [
    { type: 'exact', value: 'https://a.example.com/' },
    { type: 'regex', value: '^https://(.*)\\.example\\.com$' }
  ];
  const out = validateRoutingConfig(cfg);
  assert.equal(out.sites[0].originRules[0].value, 'https://a.example.com');
  assert.ok(out.sites[0].originRules[1]._regex instanceof RegExp);
});

test('rejects non-https exact origin', () => {
  const cfg = baseConfig();
  cfg.sites[0].originRules = [{ type: 'exact', value: 'http://a.example.com' }];
  assert.throws(() => validateRoutingConfig(cfg), /https/);
});

test('rejects exact origin with a path', () => {
  const cfg = baseConfig();
  cfg.sites[0].originRules = [{ type: 'exact', value: 'https://a.example.com/contact' }];
  assert.throws(() => validateRoutingConfig(cfg), /path/);
});

test('rejects clientKeyRequired without a valid sha256 hash', () => {
  const cfg = baseConfig();
  cfg.sites[0].security = { clientKeyRequired: true, clientKeyHash: 'short' };
  assert.throws(() => validateRoutingConfig(cfg), /clientKeyHash/);
});

test('adds a required client key header to the CORS allow-list', () => {
  const cfg = baseConfig();
  cfg.defaultPolicy = { allowedHeaders: ['Content-Type'] };
  cfg.sites[0].security = {
    clientKeyRequired: true,
    clientKeyHeader: 'X-Custom-Client-Key',
    clientKeyHash: 'a'.repeat(64)
  };

  const out = validateRoutingConfig(cfg);
  assert.deepEqual(out.defaultPolicy.allowedHeaders, ['Content-Type', 'X-Custom-Client-Key']);
});

test('does not mutate the caller input', () => {
  const input = baseConfig();
  const snapshot = JSON.parse(JSON.stringify(input));
  validateRoutingConfig(input);
  assert.deepEqual(input, snapshot);
});
