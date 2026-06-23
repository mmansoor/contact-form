export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 8080),
    serviceBaseUrl: env.SERVICE_BASE_URL || '',
    contactApiSecret: env.CONTACT_API_SECRET || '',
    contractDocsSecret: env.CONTRACT_DOCS_SECRET || '',
    recaptchaSecret: env.RECAPTCHA_SECRET || '',
    recaptchaVerifyUrl: env.RECAPTCHA_VERIFY_URL || 'https://www.google.com/recaptcha/api/siteverify',
    awsRegion: env.AWS_REGION || 'us-east-1',
    awsAccessKeyId: env.AWS_ACCESS_KEY_ID || '',
    awsSecretAccessKey: env.AWS_SECRET_ACCESS_KEY || '',
    contactFromEmail: env.CONTACT_FROM_EMAIL || '',
    contactToEmail: env.CONTACT_TO_EMAIL || '',
    contactToEmailDonorNode: env.CONTACT_TO_EMAIL_DONORNODE,
    contactToEmailCloudvantage: env.CONTACT_TO_EMAIL_CLOUDVANTAGE,
    contactToEmailWwt: env.CONTACT_TO_EMAIL_WWT,
    sesAdminTemplate: env.SES_ADMIN_TEMPLATE || 'contact-form-admin-notification-v2',
    sesConfirmationTemplate: env.SES_CONFIRMATION_TEMPLATE || 'contact-form-confirmation-v2',
    brandCompanyName: env.BRAND_COMPANY_NAME || 'Web Wire Technologies',
    brandSiteName: env.BRAND_SITE_NAME || 'WWT',
    brandDomain: env.BRAND_DOMAIN || 'wwt.co',
    brandUrl: env.BRAND_URL || 'https://wwt.co',
    brandSupportEmail: env.BRAND_SUPPORT_EMAIL || 'info@wwt.co',
    brandTeamName: env.BRAND_TEAM_NAME || 'Web Wire Technologies Team',
    brandPrivacyUrl: env.BRAND_PRIVACY_URL || 'https://wwt.co/privacy',
    brandTermsUrl: env.BRAND_TERMS_URL || 'https://wwt.co/terms'
  };
}
