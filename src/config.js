export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 8080),
    contractDocsSecret: env.CONTRACT_DOCS_SECRET || '',
    recaptchaSecret: env.RECAPTCHA_SECRET || '',
    recaptchaVerifyUrl: env.RECAPTCHA_VERIFY_URL || 'https://www.google.com/recaptcha/api/siteverify',
    awsRegion: env.AWS_REGION || 'us-east-1',
    awsAccessKeyId: env.AWS_ACCESS_KEY_ID || '',
    awsSecretAccessKey: env.AWS_SECRET_ACCESS_KEY || '',
    contactFromEmail: env.CONTACT_FROM_EMAIL || '',
    sesAdminTemplate: env.SES_ADMIN_TEMPLATE || 'contact-form-admin-notification-v2',
    sesConfirmationTemplate: env.SES_CONFIRMATION_TEMPLATE || 'contact-form-confirmation-v2',
    contactFormConfigSource: env.CONTACT_FORM_CONFIG_SOURCE || '',
    contactFormConfigSecretName: env.CONTACT_FORM_CONFIG_SECRET_NAME || 'contact-form-routing-config',
    contactFormConfigProjectId: env.CONTACT_FORM_CONFIG_PROJECT_ID || '',
    contactFormConfigFile: env.CONTACT_FORM_CONFIG_FILE || './config/contact-form-routing-config.json',
    contactFormConfigJson: env.CONTACT_FORM_CONFIG_JSON || ''
  };
}
