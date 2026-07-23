import test from 'node:test';
import assert from 'node:assert/strict';
import { matchSiteByOrigin } from '../../src/contact/match-origin.js';
import { validateRoutingConfig } from '../../src/contact/validate-config.js';

function buildConfig() {
  return validateRoutingConfig({
    version: '1',
    sites: [
      {
        id: 'donornode',
        originRules: [
          { type: 'exact', value: 'https://donornode.com' },
          { type: 'exact', value: 'https://www.donornode.com' },
          { type: 'regex', value: '^https://(dev|demo|app)\\.donornode\\.cloud$' }
        ],
        email: { to: ['contact@donornode.com'] }
      },
      {
        id: 'wwt',
        originRules: [{ type: 'exact', value: 'https://wwt.co' }],
        email: { to: ['info@wwt.co'] }
      }
    ]
  });
}

test('matches exact apex and www origins', () => {
  const cfg = buildConfig();
  assert.equal(matchSiteByOrigin(cfg, 'https://donornode.com').id, 'donornode');
  assert.equal(matchSiteByOrigin(cfg, 'https://www.donornode.com').id, 'donornode');
  assert.equal(matchSiteByOrigin(cfg, 'https://wwt.co').id, 'wwt');
});

test('matches regex origins', () => {
  const cfg = buildConfig();
  assert.equal(matchSiteByOrigin(cfg, 'https://dev.donornode.cloud').id, 'donornode');
  assert.equal(matchSiteByOrigin(cfg, 'https://demo.donornode.cloud').id, 'donornode');
  assert.equal(matchSiteByOrigin(cfg, 'https://app.donornode.cloud').id, 'donornode');
});

test('does not match suffix/partial spoofs', () => {
  const cfg = buildConfig();
  assert.equal(matchSiteByOrigin(cfg, 'https://donornode.evil.com'), null);
  assert.equal(matchSiteByOrigin(cfg, 'https://evil-donornode.cloud'), null);
  assert.equal(matchSiteByOrigin(cfg, 'https://wwt.co.evil.com'), null);
});

test('rejects non-https origins', () => {
  const cfg = buildConfig();
  assert.equal(matchSiteByOrigin(cfg, 'http://donornode.com'), null);
});

test('rejects unknown origins', () => {
  const cfg = buildConfig();
  assert.equal(matchSiteByOrigin(cfg, 'https://example.com'), null);
});

test('returns null for missing or malformed origin', () => {
  const cfg = buildConfig();
  assert.equal(matchSiteByOrigin(cfg, null), null);
  assert.equal(matchSiteByOrigin(cfg, ''), null);
  assert.equal(matchSiteByOrigin(cfg, 'not-a-url'), null);
});

test('skips disabled sites', () => {
  const cfg = buildConfig();
  cfg.sites[0].enabled = false;
  assert.equal(matchSiteByOrigin(cfg, 'https://donornode.com'), null);
});
