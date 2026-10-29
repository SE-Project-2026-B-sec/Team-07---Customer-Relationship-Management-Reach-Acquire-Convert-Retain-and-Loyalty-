import pino from 'pino';

// Structured JSON logs. Never log passwords, tokens or full personal data (CRM-SR-002).
export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash'],
});
