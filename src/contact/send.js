import { SendEmailCommand } from '@aws-sdk/client-sesv2';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function optionalField(value) {
  return value && value.trim() ? value.trim() : 'Not provided';
}

export async function defaultSendEmail({
  sesClient,
  fromEmail,
  to,
  cc = [],
  replyTo = [],
  subject,
  text,
  html
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
        Simple: {
          Subject: { Data: subject },
          Body: {
            Text: { Data: text },
            Html: { Data: html }
          }
        }
      }
    })
  );
}

export function buildNotificationContent({ site, payload }) {
  const lines = [
    'New contact form submission',
    '',
    `Site: ${site.id}`,
    `Origin: ${payload.origin}`,
    `Request ID: ${payload.requestId}`,
    `Timestamp: ${payload.timestamp}`,
    '',
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Phone: ${optionalField(payload.phone)}`,
    `Organization: ${optionalField(payload.organization)}`,
    `Subject: ${optionalField(payload.subject)}`,
    '',
    'Message:',
    payload.message
  ];

  const text = lines.join('\n');
  const html = `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;line-height:1.5">
<p><strong>Site:</strong> ${escapeHtml(site.id)}<br>
<strong>Origin:</strong> ${escapeHtml(payload.origin)}<br>
<strong>Request ID:</strong> ${escapeHtml(payload.requestId)}<br>
<strong>Timestamp:</strong> ${escapeHtml(payload.timestamp)}</p>
<p><strong>Name:</strong> ${escapeHtml(payload.name)}<br>
<strong>Email:</strong> ${escapeHtml(payload.email)}<br>
<strong>Phone:</strong> ${escapeHtml(optionalField(payload.phone))}<br>
<strong>Organization:</strong> ${escapeHtml(optionalField(payload.organization))}<br>
<strong>Subject:</strong> ${escapeHtml(optionalField(payload.subject))}</p>
<p><strong>Message:</strong></p>
<pre style="white-space:pre-wrap">${escapeHtml(payload.message)}</pre>
</body></html>`;

  return { subject: `[${site.id}] New contact: ${optionalField(payload.subject)}`, text, html };
}

export async function routeContactEmails({
  sendEmail,
  sesClient,
  fromEmail,
  site,
  payload,
  logger
}) {
  const notification = buildNotificationContent({ site, payload });
  const replyTo = site.email.replyToFromForm && payload.email ? [payload.email] : [];

  await sendEmail({
    sesClient,
    fromEmail,
    to: site.email.to,
    cc: site.email.cc,
    replyTo,
    subject: notification.subject,
    text: notification.text,
    html: notification.html
  });

  const confirmationEnabled = site.email.confirmation?.enabled === true;
  if (confirmationEnabled && payload.email) {
    const siteName = site.branding?.siteName || site.id;
    const supportAddress = site.branding?.supportEmail || site.email.to[0];
    const subject = site.email.confirmation.subject || `Thanks for contacting ${siteName}`;
    const text = `Hello ${payload.name},\n\nThank you for contacting ${siteName}. We have received your message and will get back to you shortly.\n\nIf you need urgent help, reply to this email or contact ${supportAddress}.\n\n— ${siteName}`;
    const html = `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;line-height:1.5"><p>Hello ${escapeHtml(payload.name)},</p><p>Thank you for contacting ${escapeHtml(siteName)}. We have received your message and will get back to you shortly.</p><p>If you need urgent help, reply to this email or contact ${escapeHtml(supportAddress)}.</p><p>— ${escapeHtml(siteName)}</p></body></html>`;

    await sendEmail({
      sesClient,
      fromEmail,
      to: [payload.email],
      replyTo: [supportAddress],
      subject,
      text,
      html
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
