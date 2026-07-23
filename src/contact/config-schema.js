export const routingConfigSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['version', 'sites'],
  additionalProperties: false,
  properties: {
    version: { type: 'string', minLength: 1 },
    service: { type: 'string' },
    defaultPolicy: {
      type: 'object',
      additionalProperties: false,
      properties: {
        allowCredentials: { type: 'boolean', default: false },
        allowedMethods: {
          type: 'array',
          items: { type: 'string' },
          default: ['POST', 'OPTIONS']
        },
        allowedHeaders: {
          type: 'array',
          items: { type: 'string' },
          default: ['Content-Type']
        },
        maxBodyKb: { type: 'integer', minimum: 1, default: 64 },
        rateLimit: {
          type: 'object',
          additionalProperties: false,
          properties: {
            enabled: { type: 'boolean', default: false },
            windowSeconds: { type: 'integer', minimum: 1, default: 60 },
            maxRequests: { type: 'integer', minimum: 1, default: 20 }
          }
        }
      }
    },
    sites: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'originRules', 'email'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1 },
          enabled: { type: 'boolean', default: true },
          description: { type: 'string' },
          originRules: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['type', 'value'],
              additionalProperties: false,
              properties: {
                type: { type: 'string', enum: ['exact', 'regex'] },
                value: { type: 'string', minLength: 1 }
              }
            }
          },
          allowedMethods: { type: 'array', items: { type: 'string' } },
          email: {
            type: 'object',
            required: ['to'],
            additionalProperties: false,
            properties: {
              from: { type: 'string', format: 'email' },
              to: {
                type: 'array',
                minItems: 1,
                items: { type: 'string', format: 'email' }
              },
              cc: {
                type: 'array',
                items: { type: 'string', format: 'email' },
                default: []
              },
              replyToFromForm: { type: 'boolean', default: true },
              notificationTemplate: { type: 'string' },
              confirmationTemplate: { type: 'string' },
              confirmation: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  enabled: { type: 'boolean', default: false },
                  subject: { type: 'string' }
                }
              }
            }
          },
          formPolicy: {
            type: 'object',
            additionalProperties: false,
            properties: {
              requiredFields: {
                type: 'array',
                items: { type: 'string' },
                default: ['name', 'email', 'message']
              },
              allowedFields: {
                type: 'array',
                items: { type: 'string' }
              },
              maxMessageLength: { type: 'integer', minimum: 1, default: 5000 },
              honeypotFields: {
                type: 'array',
                items: { type: 'string' },
                default: []
              }
            }
          },
          security: {
            type: 'object',
            additionalProperties: false,
            properties: {
              clientKeyRequired: { type: 'boolean', default: false },
              clientKeyHeader: { type: 'string', default: 'X-Contact-Client-Key' },
              clientKeyHash: { type: ['string', 'null'], default: null },
              captchaRequired: { type: 'boolean', default: true }
            }
          },
          branding: {
            type: 'object',
            additionalProperties: false,
            properties: {
              siteName: { type: 'string' },
              companyName: { type: 'string' },
              domain: { type: 'string' },
              url: { type: 'string' },
              supportEmail: { type: 'string', format: 'email' },
              teamName: { type: 'string' },
              privacyUrl: { type: 'string' },
              termsUrl: { type: 'string' }
            }
          }
        }
      }
    }
  }
};
