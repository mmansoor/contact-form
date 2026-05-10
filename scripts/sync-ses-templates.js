import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  CreateEmailTemplateCommand,
  GetEmailTemplateCommand,
  SESv2Client,
  UpdateEmailTemplateCommand
} from '@aws-sdk/client-sesv2';

const region = process.env.AWS_REGION || 'us-east-1';
const templatesDir = fileURLToPath(new URL('../ses-templates', import.meta.url));
const client = new SESv2Client({ region });

const files = (await readdir(templatesDir)).filter((entry) => entry.endsWith('.json'));

for (const file of files) {
  const raw = await readFile(`${templatesDir}/${file}`, 'utf8');
  const template = JSON.parse(raw);

  let exists = true;
  try {
    await client.send(new GetEmailTemplateCommand({ TemplateName: template.TemplateName }));
  } catch (error) {
    if (error.name === 'NotFoundException') {
      exists = false;
    } else {
      throw error;
    }
  }

  if (exists) {
    await client.send(
      new UpdateEmailTemplateCommand({
        TemplateName: template.TemplateName,
        TemplateContent: template.TemplateContent
      })
    );
    console.log(`Updated ${template.TemplateName}`);
    continue;
  }

  await client.send(
    new CreateEmailTemplateCommand({
      TemplateName: template.TemplateName,
      TemplateContent: template.TemplateContent
    })
  );
  console.log(`Created ${template.TemplateName}`);
}
