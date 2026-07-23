/**
 * @typedef {'exact' | 'regex'} OriginRuleType
 */

/**
 * @typedef {Object} OriginRule
 * @property {OriginRuleType} type
 * @property {string} value Exact origin string (type=exact) or an anchored ^...$ regex (type=regex).
 * @property {RegExp} [_regex] Compiled regex attached during validation (regex rules only).
 */

/**
 * @typedef {Object} RateLimitPolicy
 * @property {boolean} enabled
 * @property {number} windowSeconds
 * @property {number} maxRequests
 */

/**
 * @typedef {Object} DefaultPolicy
 * @property {boolean} allowCredentials
 * @property {string[]} allowedMethods
 * @property {string[]} allowedHeaders
 * @property {number} maxBodyKb
 * @property {RateLimitPolicy} [rateLimit]
 */

/**
 * @typedef {Object} ConfirmationPolicy
 * @property {boolean} enabled
 * @property {string} [subject]
 */

/**
 * @typedef {Object} EmailPolicy
 * @property {string[]} to
 * @property {string[]} cc
 * @property {boolean} replyToFromForm
 * @property {string} [notificationTemplate]
 * @property {string} [confirmationTemplate]
 * @property {ConfirmationPolicy} [confirmation]
 */

/**
 * @typedef {Object} FormPolicy
 * @property {string[]} requiredFields
 * @property {string[]} allowedFields
 * @property {number} maxMessageLength
 * @property {string[]} honeypotFields
 */

/**
 * @typedef {Object} SecurityPolicy
 * @property {boolean} clientKeyRequired
 * @property {string} clientKeyHeader
 * @property {string | null} clientKeyHash sha256 hex of the expected client key.
 * @property {boolean} captchaRequired
 */

/**
 * @typedef {Object} Branding
 * @property {string} [siteName]
 * @property {string} [companyName]
 * @property {string} [domain]
 * @property {string} [url]
 * @property {string} [supportEmail]
 * @property {string} [teamName]
 * @property {string} [privacyUrl]
 * @property {string} [termsUrl]
 */

/**
 * @typedef {Object} SiteConfig
 * @property {string} id
 * @property {boolean} enabled
 * @property {string} [description]
 * @property {OriginRule[]} originRules
 * @property {string[]} [allowedMethods]
 * @property {EmailPolicy} email
 * @property {FormPolicy} [formPolicy]
 * @property {SecurityPolicy} [security]
 * @property {Branding} [branding]
 */

/**
 * @typedef {Object} RoutingConfig
 * @property {string} version
 * @property {string} [service]
 * @property {DefaultPolicy} [defaultPolicy]
 * @property {SiteConfig[]} sites
 */

export {};
