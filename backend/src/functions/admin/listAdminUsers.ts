import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';

import { getCognitoClient } from '../../lib/aws';
import { ADMIN_USER_POOL_ID } from '../../lib/env';
import {
  AdminAuthConfigurationError,
  requireAdminClaims,
  UnauthorizedError
} from '../../lib/adminAuth';
import { ValidationError } from '../../lib/errors';

const MAX_PAGE_SIZE = 60;
const DEFAULT_PAGE_SIZE = 20;

type AdminUserSummary = {
  username: string;
  status: string | null;
  enabled: boolean;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  givenName?: string;
  familyName?: string;
  createdAt?: string;
  updatedAt?: string;
  lastModifiedAt?: string;
};

const mapUser = (user: Record<string, unknown>): AdminUserSummary => {
  const attributesArray = (user.Attributes as Array<{ Name?: string; Value?: string }>) ?? [];
  const attributes = attributesArray.reduce<Record<string, string>>((acc, attribute) => {
    if (attribute.Name && typeof attribute.Value === 'string') {
      acc[attribute.Name] = attribute.Value;
    }
    return acc;
  }, {});

  const toIso = (value: unknown) =>
    value instanceof Date ? value.toISOString() : undefined;

  return {
    username: (user.Username as string) ?? 'unknown',
    status: (user.UserStatus as string) ?? null,
    enabled: Boolean(user.Enabled),
    email: attributes.email,
    emailVerified: attributes.email_verified === 'true',
    name: attributes.name,
    givenName: attributes.given_name,
    familyName: attributes.family_name,
    createdAt: toIso(user.UserCreateDate),
    updatedAt: toIso(user.UserLastModifiedDate),
    lastModifiedAt: toIso(user.UserLastModifiedDate)
  };
};

const normalizePageSize = (value: string | undefined): number => {
  if (!value) {
    return DEFAULT_PAGE_SIZE;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new ValidationError('limit must be a positive integer');
  }
  return Math.min(parsed, MAX_PAGE_SIZE);
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    await requireAdminClaims(event.headers);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized' })
      };
    }
    if (error instanceof AdminAuthConfigurationError) {
      console.error('Admin authentication not configured', { message: error.message });
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Admin authentication is not configured' })
      };
    }
    throw error;
  }

  if (!ADMIN_USER_POOL_ID) {
    console.error('ADMIN_USER_POOL_ID is not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Admin user pool is not configured' })
    };
  }

  const query = event.queryStringParameters ?? {};
  let limit = DEFAULT_PAGE_SIZE;
  try {
    limit = normalizePageSize(query.limit);
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: error.message })
      };
    }
    throw error;
  }

  const paginationToken = query.nextToken;
  const search = query.search?.trim();
  const filterExpression =
    search && search.length >= 1 ? `email ^= "${search.replace(/"/g, '\\"')}"` : undefined;

  const cognito = getCognitoClient();

  try {
    const response = await cognito.send(
      new ListUsersCommand({
        UserPoolId: ADMIN_USER_POOL_ID,
        Limit: limit,
        PaginationToken: paginationToken,
        Filter: filterExpression
      })
    );

    const users = (response.Users ?? []).map((user) =>
      mapUser(user as unknown as Record<string, unknown>)
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        items: users,
        nextToken: response.PaginationToken ?? null,
        count: users.length
      })
    };
  } catch (error) {
    console.error('Failed to list admin users', { error });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to load admin users' })
    };
  }
};
