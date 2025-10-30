import { APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda';

import { fetchToken } from '../lib/vleTokens';
import { VLE_TOKEN_CHECK } from '../lib/env';

export const handler = async (event: APIGatewayRequestAuthorizerEventV2) => {
  if (!VLE_TOKEN_CHECK) {
    return { isAuthorized: true };
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    console.warn('VLE authorizer missing token', {
      path: event.requestContext.http?.path,
      headersPresent: Boolean(event.headers)
    });
    return {
      isAuthorized: false,
      context: { reason: 'MISSING_TOKEN' }
    };
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    console.warn('VLE authorizer empty token', {
      path: event.requestContext.http?.path
    });
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
      path: event.requestContext.http?.path,
      record
    });
    return {
      isAuthorized: false,
      context: { reason: 'INVALID_TOKEN' }
    };
  }

  console.info('VLE authorizer allowed request', {
    path: event.requestContext.http?.path,
    token
  });

  return {
    isAuthorized: true,
    context: {
      reason: 'AUTHORIZED',
      parentToken: record.parentToken ?? '',
      tokenType: record.type,
      issuedAt: String(record.createdAt ?? ''),
      token: record.token
    }
  };
};
