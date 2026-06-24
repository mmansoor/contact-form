const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const METADATA_PROJECT_URL = 'http://metadata.google.internal/computeMetadata/v1/project/project-id';
const SECRET_MANAGER_BASE = 'https://secretmanager.googleapis.com/v1';

async function fetchMetadata(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!response.ok) {
    throw new Error(`Metadata server request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

export async function resolveProjectId({ projectId, fetchImpl = globalThis.fetch }) {
  if (projectId) {
    return projectId;
  }
  const body = await fetchMetadata(fetchImpl, METADATA_PROJECT_URL);
  return body;
}

export async function accessSecret({ secretName, projectId, token, fetchImpl = globalThis.fetch }) {
  const resolvedProject = await resolveProjectId({ projectId, fetchImpl });
  if (!resolvedProject) {
    throw new Error('Could not resolve GCP project id for Secret Manager.');
  }

  const accessToken = token || (await fetchMetadata(fetchImpl, METADATA_TOKEN_URL)).access_token;
  const url = `${SECRET_MANAGER_BASE}/projects/${resolvedProject}/secrets/${secretName}/versions/latest:access`;

  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Secret Manager request failed (${response.status}) for secret ${secretName}.`);
  }

  const body = await response.json();
  const encoded = body?.payload?.data;
  if (!encoded) {
    throw new Error(`Secret Manager response for ${secretName} is missing payload data.`);
  }

  return Buffer.from(encoded, 'base64').toString('utf8');
}
