import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import {
  AdminCreateUserCommand,
  AdminCreateUserCommandInput,
  UsernameExistsException
} from '@aws-sdk/client-cognito-identity-provider';

import { getCognitoClient } from '../../lib/aws';
import { ADMIN_USER_POOL_ID } from '../../lib/env';
import {
  AdminAuthConfigurationError,
  requireAdminClaims,
  UnauthorizedError
} from '../../lib/adminAuth';
import { ValidationError } from '../../lib/errors';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

type InviteAdminUserPayload = {
  email: string;
  givenName?: string;
  familyName?: string;
  name?: string;
  resend?: boolean;
};

const parsePayload = (raw: unknown): InviteAdminUserPayload => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('Request body must be a JSON object');
  }

  const data = raw as Record<string, unknown>;
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (!email) {
    throw new ValidationError('email is required');
  }
  if (!emailPattern.test(email)) {
    throw new ValidationError('email must be a valid email address');
  }

  const givenName =
    typeof data.givenName === 'string' && data.givenName.trim() ? data.givenName.trim() : undefined;
  const familyName =
    typeof data.familyName === 'string' && data.familyName.trim()
      ? data.familyName.trim()
      : undefined;
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : undefined;
  const resend = Boolean(data.resend);

  return { email, givenName, familyName, name, resend };
};

const buildAttributes = (payload: InviteAdminUserPayload): AdminCreateUserCommandInput['UserAttributes'] => {
  const attributes: NonNullable<
    AdminCreateUserCommandInput['UserAttributes']
  > = [
    { Name: 'email', Value: payload.email },
    { Name: 'email_verified', Value: 'true' }
  ];

  if (payload.name) {
    attributes.push({ Name: 'name', Value: payload.name });
  }
  if (payload.givenName) {
    attributes.push({ Name: 'given_name', Value: payload.givenName });
  }
  if (payload.familyName) {
    attributes.push({ Name: 'family_name', Value: payload.familyName });
  }

  return attributes;
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

  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Request body is required' })
    };
  }

  let payload: InviteAdminUserPayload;
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

  const cognito = getCognitoClient();

  const params: AdminCreateUserCommandInput = {
    UserPoolId: ADMIN_USER_POOL_ID,
    Username: payload.email,
    UserAttributes: buildAttributes(payload),
    DesiredDeliveryMediums: ['EMAIL'],
    ForceAliasCreation: false
  };

  if (payload.resend) {
    params.MessageAction = 'RESEND';
  }

  try {
    const response = await cognito.send(new AdminCreateUserCommand(params));
    const userRecord = response.User ?? {};

    const summary = {
      username: payload.email,
      email: payload.email,
      status: (userRecord.UserStatus as string) ?? null,
      enabled: Boolean(userRecord.Enabled),
      createdAt: userRecord.UserCreateDate?.toISOString(),
      updatedAt: userRecord.UserLastModifiedDate?.toISOString()
    };

    return {
      statusCode: payload.resend ? 200 : 201,
      body: JSON.stringify(summary)
    };
  } catch (error) {
    if (error instanceof UsernameExistsException) {
      if (payload.resend) {
        console.warn('Attempted to resend invite for non-existing alias', { email: payload.email });
        return {
          statusCode: 404,
          body: JSON.stringify({ message: 'User already exists and cannot be re-invited automatically' })
        };
      }

      return {
        statusCode: 409,
        body: JSON.stringify({ message: 'An admin with that email already exists' })
      };
    }

    const errorName = (error as { name?: string }).name ?? 'UnknownError';
    if (errorName === 'InvalidParameterException') {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid request for Cognito user creation' })
      };
    }

    console.error('Failed to invite admin user', { error });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to invite admin user' })
    };
  }
};
