import pino from 'pino';

/** Log fields that are always replaced with "[Redacted]" (CRM-SR-002). Exported for TC-SEC-02. */
export const LOG_REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.passwordHash',
];

// Structured JSON logs. Never log passwords, tokens or full personal data (CRM-SR-002).
export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  redact: LOG_REDACT,
});
