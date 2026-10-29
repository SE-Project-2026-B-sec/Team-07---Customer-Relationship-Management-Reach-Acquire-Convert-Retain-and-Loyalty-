import type { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { AppError } from '../../common/errors';
import { findUserByEmail, findUserById } from './auth.repository';
import type { LoginInput } from './auth.schema';

export interface AuthUser {
  id: string;
  role: Role;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface TokenPayload {
  sub: string;
  role: Role;
}

// Used when the email is unknown, so a wrong email takes as long as a wrong password
// (stops attackers finding out which emails exist).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const INVALID = () => new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET must be set and at least 16 characters long');
  }
  return secret;
}

export function signToken(user: AuthUser): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? '60m') as SignOptions['expiresIn'];
  return jwt.sign({ role: user.role }, jwtSecret(), { subject: user.id, expiresIn });
}

/** Returns the user in the token, or throws 401 if it is missing, expired or tampered with. */
export function verifyToken(token: string): AuthUser {
  try {
    const payload = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] }) as TokenPayload;
    return { id: payload.sub, role: payload.role };
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Please log in again');
  }
}

/** CRM-F-001: check email + password and issue a JWT. Same error for every failure (CRM-SR-002). */
export async function login({ email, password }: LoginInput) {
  const user = await findUserByEmail(email);
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk || !user.isActive) throw INVALID();

  const publicUser: PublicUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
  return { token: signToken(user), user: publicUser };
}

export async function getCurrentUser(id: string): Promise<PublicUser> {
  const user = await findUserById(id);
  if (!user || !user.isActive) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Please log in again');
  }
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
