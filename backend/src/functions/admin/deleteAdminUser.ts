import { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider';

import { getCognitoClient } from '../../lib/aws';
import { ADMIN_USER_POOL_ID } from '../../lib/env';
import {
  AdminAuthConfigurationError,
  requireAdminClaims,
  UnauthorizedError
} from '../../lib/adminAuth';

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

  const cognito = getCognitoClient();

  try {
    await cognito.send(
      new AdminDeleteUserCommand({
        UserPoolId: ADMIN_USER_POOL_ID,
        Username: username
      })
    );
  } catch (error) {
    console.error('Failed to delete admin user', { error, username });
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to delete admin user' })
    };
  }

  return {
    statusCode: 204,
    body: ''
  };
};
