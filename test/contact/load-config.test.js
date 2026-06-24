import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadRoutingConfig } from '../../src/contact/load-config.js';

const validJson = JSON.stringify({
  version: '1',
  sites: [
    {
      id: 'a',
      originRules: [{ type: 'exact', value: 'https://a.example.com' }],
      email: { to: ['owner@a.example.com'] }
    }
  ]
});

const samplePath = fileURLToPath(
  new URL('../../config/contact-form-routing-config.sample.json', import.meta.url)
);

test('loads from inline env source', async () => {
  const cfg = await loadRoutingConfig({ source: 'env', inlineJson: validJson });
  assert.equal(cfg.sites[0].id, 'a');
});

test('loads from the committed sample file', async () => {
  const cfg = await loadRoutingConfig({ source: 'file', filePath: samplePath });
  assert.ok(cfg.sites.length >= 1);
  assert.ok(cfg.sites.some((site) => site.id === 'donornode'));
});

test('rejects malformed json', async () => {
  await assert.rejects(
    () => loadRoutingConfig({ source: 'env', inlineJson: '{not json' }),
    /not valid JSON/
  );
});

test('rejects empty config', async () => {
  await assert.rejects(
    () => loadRoutingConfig({ source: 'env', inlineJson: '   ' }),
    /empty/
  );
});

test('rejects semantically invalid config', async () => {
  const bad = JSON.parse(validJson);
  bad.sites[0].email.to = ['bad'];
  await assert.rejects(
    () => loadRoutingConfig({ source: 'env', inlineJson: JSON.stringify(bad) }),
    /email/i
  );
});

test('loads from secret-manager via an injected fetch', async () => {
  const secretJson = JSON.stringify({
    version: '1',
    sites: [
      {
        id: 'sm',
        originRules: [{ type: 'exact', value: 'https://sm.example.com' }],
        email: { to: ['o@sm.example.com'] }
      }
    ]
  });
  const encoded = Buffer.from(secretJson).toString('base64');
  const fetchImpl = async (url) => {
    if (url.includes('default/token')) {
      return { ok: true, json: async () => ({ access_token: 'tok' }) };
    }
    return { ok: true, json: async () => ({ payload: { data: encoded } }) };
  };

  const cfg = await loadRoutingConfig({
    source: 'secret-manager',
    secretName: 'contact-form-routing-config',
    projectId: 'proj-x',
    fetchImpl
  });
  assert.equal(cfg.sites[0].id, 'sm');
});
