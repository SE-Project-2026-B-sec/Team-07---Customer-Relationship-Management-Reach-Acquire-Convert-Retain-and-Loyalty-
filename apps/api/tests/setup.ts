// Loads apps/api/.env (DATABASE_URL) and makes sure tests never run without a JWT secret.
import 'dotenv/config';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-only-secret-at-least-16-chars';
process.env.JWT_EXPIRES_IN ??= '60m';
