import { APIGatewayProxyHandlerV2 } from 'aws-lambda';

import { deleteToken, fetchToken, generateToken, storeToken } from '../lib/vleTokens';
import { VLE_TOKEN_CHECK } from '../lib/env';

const LONG_TTL_SECONDS = 60 * 60; // 1 hour

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!VLE_TOKEN_CHECK) {
    return {
      statusCode: 200,
      body: JSON.stringify({ token: 'dev-long-token' })
    };
  }

  let payload: { token?: string } = {};
  try {
    payload = JSON.parse(event.body ?? '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON body' }) };
  }

  const suppliedToken = payload.token;
  if (!suppliedToken) {
    return { statusCode: 400, body: JSON.stringify({ message: 'token is required' }) };
  }

  const record = await fetchToken(suppliedToken);

  if (!record || record.type !== 'short') {
    return { statusCode: 403, body: JSON.stringify({ message: 'Invalid or expired token' }) };
  }

  await deleteToken(suppliedToken);

  const longToken = generateToken();
  await storeToken(longToken, 'long', LONG_TTL_SECONDS, { parentToken: suppliedToken });

  return {
    statusCode: 200,
    body: JSON.stringify({ token: longToken })
  };
};
