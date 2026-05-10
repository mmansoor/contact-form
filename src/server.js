import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig(process.env);
const app = createApp({ env: process.env });

app.listen(config.port, () => {
  console.log(
    JSON.stringify({
      severity: 'INFO',
      service: 'contact-form',
      event: 'server_started',
      port: config.port
    })
  );
});
