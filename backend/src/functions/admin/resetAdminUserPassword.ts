import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import {
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  UserNotFoundException
} from '@aws-sdk/client-cognito-identity-provider';
import { SendEmailCommand } from '@aws-sdk/client-ses';

import { getCognitoClient, getSesClient } from '../../lib/aws';
import { ADMIN_PORTAL_URL, ADMIN_USER_POOL_ID, SES_SOURCE_EMAIL } from '../../lib/env';
import {
  AdminAuthConfigurationError,
  requireAdminClaims,
  UnauthorizedError
} from '../../lib/adminAuth';
import { buildAdminResetPasswordEmail } from '../../lib/emailTemplates';
import { generateTemporaryPassword } from '../../lib/password';

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

  if (!SES_SOURCE_EMAIL) {
    console.error('SES_SOURCE_EMAIL is not configured, cannot send reset email');
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Email delivery is not configured' })
    };
  }

  const cognito = getCognitoClient();
  const ses = getSesClient();

  let userRecord;

  try {
    const response = await cognito.send(
      new AdminGetUserCommand({
        UserPoolId: ADMIN_USER_POOL_ID,
        Username: username
      })
    );
    userRecord = response;
  } catch (error) {
    if (error instanceof UserNotFoundException) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Admin user not found' })
      };
    }
    console.error('Failed to fetch admin user before reset', { error, username });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to reset admin password' })
    };
  }

  const attributes = userRecord.UserAttributes ?? [];
  const email = attributes.find((attr) => attr.Name === 'email')?.Value;
  const givenName = attributes.find((attr) => attr.Name === 'given_name')?.Value ?? '';
  const familyName = attributes.find((attr) => attr.Name === 'family_name')?.Value ?? '';
  const inferredName = `${givenName} ${familyName}`.replace(/\s+/g, ' ').trim();
  const nameAttribute = attributes.find((attr) => attr.Name === 'name')?.Value;
  const name = nameAttribute ?? (inferredName ? inferredName : undefined);

  if (!email) {
    console.error('Cannot reset admin password because email attribute is missing', { username });
    return {
      statusCode: 422,
      body: JSON.stringify({ message: 'Admin user does not have an email address' })
    };
  }

  const temporaryPassword = generateTemporaryPassword();

  try {
    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: ADMIN_USER_POOL_ID,
        Username: username,
        Password: temporaryPassword,
        Permanent: false
      })
    );
  } catch (error) {
    console.error('Failed to reset admin user password', { error, username });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to reset admin password' })
    };
  }

  const emailContent = buildAdminResetPasswordEmail({
    inviteeEmail: email,
    inviteeName: name,
    temporaryPassword,
    portalUrl: ADMIN_PORTAL_URL
  });

  try {
    await ses.send(
      new SendEmailCommand({
        Source: SES_SOURCE_EMAIL,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: emailContent.subject },
          Body: {
            Html: {
              Charset: 'UTF-8',
              Data: emailContent.html
            }
          }
        }
      })
    );
  } catch (error) {
    console.error('Failed to send admin reset password email', { error, username, email });
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to send reset email. Password was updated; contact support for assistance.'
      })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      username,
      email,
      message: 'Password reset email sent'
    })
  };
};
