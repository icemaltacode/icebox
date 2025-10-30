import { APIGatewayProxyHandlerV2 } from 'aws-lambda';

import { deleteToken, fetchToken, generateToken, storeToken } from '../lib/vleTokens';
import { VLE_TOKEN_CHECK } from '../lib/env';

const LONG_TTL_SECONDS = 60 * 60; // 1 hour
const ALLOWED_ORIGIN = 'https://icebox.icecampus.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization'
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
    };
  }

  if (!VLE_TOKEN_CHECK) {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ token: 'dev-long-token' })
    };
  }

  const originHeader = event.headers?.origin || event.headers?.Origin;
  if (originHeader !== ALLOWED_ORIGIN) {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Forbidden' })
    };
  }

  let payload: { token?: string } = {};
  try {
    payload = JSON.parse(event.body ?? '{}');
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Invalid JSON body' })
    };
  }

  const suppliedToken = payload.token;
  if (!suppliedToken) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'token is required' })
    };
  }

  const record = await fetchToken(suppliedToken);

  if (!record) {
    console.warn('VLE token exchange failed: token not found', {
      suppliedToken
    });
  }

  if (!record || record.type !== 'short') {
    return {
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Invalid or expired token' })
    };
  }

  await deleteToken(suppliedToken);

  const longToken = generateToken();
  await storeToken(longToken, 'long', LONG_TTL_SECONDS, { parentToken: suppliedToken });

  console.log('Issued long VLE token', {
    longToken,
    parentToken: suppliedToken,
    ttlSeconds: LONG_TTL_SECONDS
  });

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ token: longToken })
  };
};
