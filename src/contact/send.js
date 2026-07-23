import { SendEmailCommand } from '@aws-sdk/client-sesv2';

export async function defaultSendEmail({
  sesClient,
  fromEmail,
  to,
  cc = [],
  replyTo = [],
  templateName,
  templateData
}) {
  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: fromEmail,
      Destination: {
        ToAddresses: to,
        CcAddresses: cc
      },
      ReplyToAddresses: replyTo,
      Content: {
        Template: {
          TemplateName: templateName,
          TemplateData: JSON.stringify(templateData)
        }
      }
    })
  );
}

export function buildTemplateData({ site, payload }) {
  const branding = site.branding || {};
  return {
    name: payload.name,
    email: payload.email,
    phone: payload.phone || 'Not provided',
    company: payload.organization || payload.company || 'Not provided',
    subject: payload.subject || 'Website Contact Form Submission',
    inquiry_type: payload.inquiryType || 'General Inquiry',
    additional_fields_html: '',
    message: payload.message,
    ip_address: payload.remoteIp || 'Unavailable',
    admin_email: site.email.to[0],
    source_domain: payload.origin,
    timestamp: payload.timestamp,
    brand_company_name: branding.companyName || branding.siteName || site.id,
    brand_site_name: branding.siteName || site.id,
    brand_domain: branding.domain || '',
    brand_url: branding.url || '',
    brand_support_email: branding.supportEmail || site.email.to[0],
    brand_team_name: branding.teamName || '',
    brand_privacy_url: branding.privacyUrl || '',
    brand_terms_url: branding.termsUrl || ''
  };
}

export async function routeContactEmails({
  sendEmail,
  sesClient,
  fromEmail,
  site,
  payload,
  notificationTemplate,
  confirmationTemplate,
  logger
}) {
  const templateData = buildTemplateData({ site, payload });
  const replyTo = site.email.replyToFromForm && payload.email ? [payload.email] : [];
  const senderAddress = site.email.from || fromEmail;

  await sendEmail({
    sesClient,
    fromEmail: senderAddress,
    to: site.email.to,
    cc: site.email.cc,
    replyTo,
    templateName: site.email.notificationTemplate || notificationTemplate,
    templateData
  });

  const confirmationEnabled = site.email.confirmation?.enabled === true;
  if (confirmationEnabled && payload.email) {
    const supportAddress = site.branding?.supportEmail || site.email.to[0];

    await sendEmail({
      sesClient,
      fromEmail: senderAddress,
      to: [payload.email],
      replyTo: [supportAddress],
      templateName: site.email.confirmationTemplate || confirmationTemplate,
      templateData
    });
  }

  if (logger) {
    logger.log(
      JSON.stringify({
        severity: 'INFO',
        service: 'contact-form',
        event: 'contact_emails_sent',
        site_id: site.id,
        notification_to: site.email.to.length,
        notification_cc: (site.email.cc || []).length,
        confirmation: confirmationEnabled ? 'sent' : 'skipped'
      })
    );
  }
}
