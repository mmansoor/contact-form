import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { loadRoutingConfig } from './contact/load-config.js';

const config = loadConfig(process.env);

if (!config.contactFormConfigSource) {
  throw new Error('CONTACT_FORM_CONFIG_SOURCE is required.');
}

const routingConfig = await loadRoutingConfig({
  source: config.contactFormConfigSource,
  secretName: config.contactFormConfigSecretName,
  projectId: config.contactFormConfigProjectId,
  filePath: config.contactFormConfigFile,
  inlineJson: config.contactFormConfigJson
});

const app = createApp({ env: process.env, routingConfig });

app.listen(config.port, () => {
  console.log(
    JSON.stringify({
      severity: 'INFO',
      service: 'contact-form',
      event: 'server_started',
      port: config.port,
      v2_routing: 'enabled'
    })
  );
});
