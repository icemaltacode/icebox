import { APIGatewayProxyEventHeaders } from 'aws-lambda';
import { createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose';

import {
  ADMIN_USER_POOL_AUDIENCE,
  ADMIN_USER_POOL_CLIENT_ID,
  ADMIN_USER_POOL_ID,
  ADMIN_USER_POOL_REGION
} from './env';

const BEARER_PREFIX = 'bearer ';

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class AdminAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminAuthConfigurationError';
  }
}

export type AdminClaims = JWTPayload & {
  email?: string;
  name?: string;
  'cognito:username'?: string;
};

const getAuthorizationHeader = (headers?: APIGatewayProxyEventHeaders): string => {
  const headerValue = headers?.authorization ?? headers?.Authorization;
  if (!headerValue) {
    throw new UnauthorizedError('Missing Authorization header');
  }
  return headerValue;
};

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

const getRemoteJwks = () => {
  if (!ADMIN_USER_POOL_ID || !ADMIN_USER_POOL_CLIENT_ID) {
    throw new AdminAuthConfigurationError('Admin authentication is not configured');
  }
  if (!jwks) {
    const issuerRoot = `https://cognito-idp.${ADMIN_USER_POOL_REGION}.amazonaws.com/${ADMIN_USER_POOL_ID}`;
    jwks = createRemoteJWKSet(new URL(`${issuerRoot}/.well-known/jwks.json`));
  }
  return jwks;
};

const verifyAdminToken = async (token: string): Promise<AdminClaims> => {
  const issuer = `https://cognito-idp.${ADMIN_USER_POOL_REGION}.amazonaws.com/${ADMIN_USER_POOL_ID}`;
  const audience = ADMIN_USER_POOL_AUDIENCE ?? ADMIN_USER_POOL_CLIENT_ID;
  const { payload } = await jwtVerify(token, getRemoteJwks(), {
    issuer,
    audience
  });

  const tokenUse = payload.token_use;
  if (tokenUse !== 'id' && tokenUse !== 'access') {
    throw new UnauthorizedError('Unsupported token type');
  }

  return payload as AdminClaims;
};

export const requireAdminClaims = async (
  headers?: APIGatewayProxyEventHeaders
): Promise<AdminClaims> => {
  const authorization = getAuthorizationHeader(headers);
  const normalized = authorization.trim();
  const prefix = normalized.slice(0, BEARER_PREFIX.length).toLowerCase();
  if (prefix !== BEARER_PREFIX) {
    throw new UnauthorizedError('Authorization header must use Bearer scheme');
  }
  const token = normalized.slice(BEARER_PREFIX.length).trim();
  if (!token) {
    throw new UnauthorizedError('Bearer token missing');
  }

  try {
    return await verifyAdminToken(token);
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof AdminAuthConfigurationError) {
      throw error;
    }
    console.error('Failed to verify admin token', { error: (error as Error).message });
    throw new UnauthorizedError();
  }
};
