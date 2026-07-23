import { readFile } from 'node:fs/promises';
import { validateRoutingConfig } from './validate-config.js';
import { accessSecret } from './secret-manager.js';

export async function loadRoutingConfig({
  source,
  secretName,
  projectId,
  filePath,
  inlineJson,
  fetchImpl = globalThis.fetch
}) {
  let raw;

  if (source === 'env') {
    raw = inlineJson;
  } else if (source === 'file') {
    raw = await readFile(filePath, 'utf8');
  } else if (source === 'secret-manager') {
    raw = await accessSecret({ secretName, projectId, fetchImpl });
  } else {
    throw new Error(`Unknown CONTACT_FORM_CONFIG_SOURCE: ${source}`);
  }

  if (!raw || !raw.trim()) {
    throw new Error('Contact form routing config is empty.');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Contact form routing config is not valid JSON.');
  }

  return validateRoutingConfig(parsed);
}
