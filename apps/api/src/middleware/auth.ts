import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTPayload } from 'jose';
import { isPermission, type Permission } from '@tsm/shared';
import { env } from '../config/env';
import { AppError, forbidden } from '../lib/errors';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

export interface AuthContext {
  profileId: string;
  authUserId: string;
  email: string;
  fullName: string;
  permissions: ReadonlySet<Permission>;
  /** True when the user may see records of every branch. */
  allBranches: boolean;
  branchIds: readonly string[];
}

type Verifier = (token: string) => Promise<JWTPayload>;
let verifier: Verifier | undefined;

function getVerifier(): Verifier {
  if (verifier) return verifier;
  const { SUPABASE_JWT_SECRET, jwtIssuer } = env();
  const options = { issuer: jwtIssuer, audience: 'authenticated' };
  if (SUPABASE_JWT_SECRET) {
    const key = new TextEncoder().encode(SUPABASE_JWT_SECRET);
    verifier = async (token) =>
      (await jwtVerify(token, key, { ...options, algorithms: ['HS256'] })).payload;
  } else {
    const jwks = createRemoteJWKSet(new URL(`${jwtIssuer}/.well-known/jwks.json`));
    verifier = async (token) => (await jwtVerify(token, jwks, options)).payload;
  }
  return verifier;
}

/** Test hook: replace the token verifier. */
export function setTokenVerifierForTests(fn: Verifier | undefined) {
  verifier = fn;
}

const SESSION_EXPIRED = 'Your session has expired. Sign in again to continue.';
const SESSION_INVALID = 'Your session is no longer valid. Sign in again to continue.';

/** Load the application profile, roles, permissions and branch scope for an auth user. */
export async function loadAuthContext(authUserId: string): Promise<AuthContext> {
  const profile = await prisma.userProfile.findUnique({
    where: { authUserId },
    include: {
      roles: {
        include: { role: { include: { permissions: { select: { permissionKey: true } } } } },
      },
      branches: { where: { branch: { isActive: true } }, select: { branchId: true } },
    },
  });
  if (!profile) {
    throw new AppError(
      'ACCOUNT_INACTIVE',
      'Your sign-in worked, but your account has not been set up in this application. Contact your administrator.',
    );
  }
  if (!profile.isActive) {
    throw new AppError(
      'ACCOUNT_INACTIVE',
      'Your account has been deactivated. Contact your administrator if you believe this is a mistake.',
    );
  }
  const permissions = new Set<Permission>();
  for (const { role } of profile.roles) {
    for (const { permissionKey } of role.permissions) {
      if (isPermission(permissionKey)) permissions.add(permissionKey);
    }
  }
  return {
    profileId: profile.id,
    authUserId,
    email: profile.email,
    fullName: profile.fullName,
    permissions,
    allBranches: permissions.has('branches.all_access'),
    branchIds: profile.branches.map((b) => b.branchId),
  };
}

/**
 * Verifies the Supabase access token on every request and resolves the caller's
 * current permissions from the database, so role changes and deactivation take
 * effect immediately rather than when the token expires.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');

  let payload: JWTPayload;
  try {
    payload = await getVerifier()(token);
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) throw new AppError('SESSION_INVALID', SESSION_EXPIRED);
    if (err instanceof joseErrors.JOSEError) throw new AppError('SESSION_INVALID', SESSION_INVALID);
    logger.error({ err }, 'token verification failed unexpectedly');
    throw new AppError(
      'SERVICE_UNAVAILABLE',
      'We could not verify your session right now. Try again shortly.',
    );
  }
  if (!payload.sub || payload.role !== 'authenticated') {
    throw new AppError('SESSION_INVALID', SESSION_INVALID);
  }

  req.auth = await loadAuthContext(payload.sub);
  next();
}

export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
  return req.auth;
}

export const can = (ctx: AuthContext, permission: Permission) => ctx.permissions.has(permission);

/** Route guard: the caller must hold every listed permission. */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const ctx = getAuth(req);
    if (!permissions.every((p) => ctx.permissions.has(p))) throw forbidden();
    next();
  };
}

/** Route guard: the caller must hold at least one listed permission. */
export function requireAnyPermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const ctx = getAuth(req);
    if (!permissions.some((p) => ctx.permissions.has(p))) throw forbidden();
    next();
  };
}
