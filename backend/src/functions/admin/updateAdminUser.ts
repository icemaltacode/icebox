import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';

import { getCognitoClient } from '../../lib/aws';
import { ADMIN_USER_POOL_ID } from '../../lib/env';
import {
  AdminAuthConfigurationError,
  requireAdminClaims,
  UnauthorizedError
} from '../../lib/adminAuth';
import { ValidationError } from '../../lib/errors';

type UpdateAdminUserPayload = {
  name?: string;
  givenName?: string;
  familyName?: string;
};

const sanitizeString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const parsePayload = (raw: unknown): UpdateAdminUserPayload => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('Request body must be a JSON object');
  }

  const data = raw as Record<string, unknown>;
  const payload: UpdateAdminUserPayload = {
    name: sanitizeString(data.name),
    givenName: sanitizeString(data.givenName),
    familyName: sanitizeString(data.familyName)
  };

  if (!payload.name && !payload.givenName && !payload.familyName) {
    throw new ValidationError('Provide at least one attribute to update');
  }

  return payload;
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

  const username = event.pathParameters?.username;
  if (!username) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'username path parameter is required' })
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Request body is required' })
    };
  }

  let payload: UpdateAdminUserPayload;
  try {
    payload = parsePayload(JSON.parse(event.body));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Request body must be valid JSON' })
      };
    }
    if (error instanceof ValidationError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: error.message })
      };
    }
    throw error;
  }

  const attributes = [];
  if (payload.name) {
    attributes.push({ Name: 'name', Value: payload.name });
  }
  if (payload.givenName) {
    attributes.push({ Name: 'given_name', Value: payload.givenName });
  }
  if (payload.familyName) {
    attributes.push({ Name: 'family_name', Value: payload.familyName });
  }

  const cognito = getCognitoClient();

  try {
    await cognito.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: ADMIN_USER_POOL_ID,
        Username: username,
        UserAttributes: attributes
      })
    );
  } catch (error) {
    console.error('Failed to update admin user attributes', { error, username });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to update admin user attributes' })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      username,
      updated: {
        name: payload.name ?? null,
        givenName: payload.givenName ?? null,
        familyName: payload.familyName ?? null
      }
    })
  };
};
