import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import {
  AdminCreateUserCommand,
  AdminCreateUserCommandInput,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  UserNotFoundException,
  UsernameExistsException
} from '@aws-sdk/client-cognito-identity-provider';
import { SendEmailCommand } from '@aws-sdk/client-ses';

import { getCognitoClient, getSesClient } from '../../lib/aws';
import { ADMIN_PORTAL_URL, ADMIN_USER_POOL_ID, SES_SOURCE_EMAIL } from '../../lib/env';
import {
  AdminAuthConfigurationError,
  requireAdminClaims,
  UnauthorizedError
} from '../../lib/adminAuth';
import { ValidationError } from '../../lib/errors';
import { buildAdminInviteEmail } from '../../lib/emailTemplates';
import { generateTemporaryPassword } from '../../lib/password';

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

const formatSummary = (user: {
  Username?: string;
  UserStatus?: string;
  Enabled?: boolean;
  UserCreateDate?: Date;
  UserLastModifiedDate?: Date;
}) => ({
  username: user.Username ?? null,
  email: user.Username ?? null,
  status: (user.UserStatus as string) ?? null,
  enabled: Boolean(user.Enabled),
  createdAt: user.UserCreateDate?.toISOString() ?? null,
  updatedAt: user.UserLastModifiedDate?.toISOString() ?? null
});

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
  const temporaryPassword = generateTemporaryPassword();

  if (!SES_SOURCE_EMAIL) {
    console.error('SES_SOURCE_EMAIL is not configured, cannot send admin invite');
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Email delivery is not configured' })
    };
  }

  const emailPayload = buildAdminInviteEmail({
    inviteeEmail: payload.email,
    inviteeName: payload.name,
    temporaryPassword,
    portalUrl: ADMIN_PORTAL_URL
  });

  const ses = getSesClient();

  try {
    if (payload.resend) {
      try {
        await cognito.send(
          new AdminSetUserPasswordCommand({
            UserPoolId: ADMIN_USER_POOL_ID,
            Username: payload.email,
            Password: temporaryPassword,
            Permanent: false
          })
        );
      } catch (error) {
        if (error instanceof UserNotFoundException) {
          return {
            statusCode: 404,
            body: JSON.stringify({ message: 'Admin user was not found' })
          };
        }
        throw error;
      }
    } else {
      const params: AdminCreateUserCommandInput = {
        UserPoolId: ADMIN_USER_POOL_ID,
        Username: payload.email,
        UserAttributes: buildAttributes(payload),
        TemporaryPassword: temporaryPassword,
        DesiredDeliveryMediums: ['EMAIL'],
        ForceAliasCreation: false,
        MessageAction: 'SUPPRESS'
      };

      try {
        await cognito.send(new AdminCreateUserCommand(params));
      } catch (error) {
        if (error instanceof UsernameExistsException) {
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

        throw error;
      }
    }

    try {
      await ses.send(
        new SendEmailCommand({
          Source: SES_SOURCE_EMAIL,
          Destination: { ToAddresses: [payload.email] },
          Message: {
            Subject: { Data: emailPayload.subject },
            Body: {
              Html: {
                Charset: 'UTF-8',
                Data: emailPayload.html
              }
            }
          }
        })
      );
    } catch (error) {
      console.error('Failed to send admin invite email', { error, email: payload.email });
      if (!payload.resend) {
        try {
          await cognito.send(
            new AdminDeleteUserCommand({
              UserPoolId: ADMIN_USER_POOL_ID,
              Username: payload.email
            })
          );
        } catch (deleteError) {
          console.error('Failed to roll back Cognito user after email failure', {
            deleteError,
            email: payload.email
          });
        }
      }

      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Failed to send invite email' })
      };
    }

    let userSummary;
    if (payload.resend) {
      const getUser = await cognito.send(
        new AdminGetUserCommand({
          UserPoolId: ADMIN_USER_POOL_ID,
          Username: payload.email
        })
      );

      userSummary = formatSummary({
        Username: getUser.Username,
        UserStatus: getUser.UserStatus,
        Enabled: getUser.Enabled,
        UserCreateDate: getUser.UserCreateDate,
        UserLastModifiedDate: getUser.UserLastModifiedDate
      });
    } else {
      const getUser = await cognito.send(
        new AdminGetUserCommand({
          UserPoolId: ADMIN_USER_POOL_ID,
          Username: payload.email
        })
      );
      userSummary = formatSummary({
        Username: getUser.Username,
        UserStatus: getUser.UserStatus,
        Enabled: getUser.Enabled,
        UserCreateDate: getUser.UserCreateDate,
        UserLastModifiedDate: getUser.UserLastModifiedDate
      });
    }

    return {
      statusCode: payload.resend ? 200 : 201,
      body: JSON.stringify(userSummary)
    };
  } catch (error) {
    console.error('Failed to invite admin user', { error, email: payload.email, resend: payload.resend });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to invite admin user' })
    };
  }
};
