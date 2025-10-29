import { APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda';

import { fetchToken } from '../lib/vleTokens';
import { VLE_TOKEN_CHECK } from '../lib/env';

export const handler = async (event: APIGatewayRequestAuthorizerEventV2) => {
  if (!VLE_TOKEN_CHECK) {
    return { isAuthorized: true };
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      isAuthorized: false,
      context: { reason: 'MISSING_TOKEN' }
    };
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return {
      isAuthorized: false,
      context: { reason: 'MISSING_TOKEN' }
    };
  }

  const record = await fetchToken(token);
  if (!record || record.type !== 'long') {
    console.warn('VLE authorizer rejected request', {
      reason: 'INVALID_TOKEN',
      token,
      path: event.requestContext.http?.path
    });
    return {
      isAuthorized: false,
      context: { reason: 'INVALID_TOKEN' }
    };
  }

  return {
    isAuthorized: true,
    context: { reason: 'AUTHORIZED', parentToken: record.parentToken ?? '' }
  };
};
