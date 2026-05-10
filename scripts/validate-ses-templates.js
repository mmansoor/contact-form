import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const requiredFiles = [
  fileURLToPath(new URL('../ses-templates/contact-form-admin-notification-v2.json', import.meta.url)),
  fileURLToPath(new URL('../ses-templates/contact-form-confirmation-v2.json', import.meta.url))
];

for (const path of requiredFiles) {
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.TemplateName || !parsed.TemplateContent) {
    throw new Error(`Template file ${path} is missing TemplateName or TemplateContent.`);
  }
  for (const field of ['Subject', 'Text', 'Html']) {
    if (!parsed.TemplateContent[field]) {
      throw new Error(`Template file ${path} is missing TemplateContent.${field}.`);
    }
  }
}

console.log('SES templates are structurally valid.');
