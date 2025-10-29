import { APIGatewayProxyHandlerV2 } from 'aws-lambda';

import { generateToken, storeToken } from '../lib/vleTokens';
import { VLE_TOKEN_CHECK } from '../lib/env';

const ALLOWED_ORIGIN = 'https://my.icecampus.com';
const SHORT_TTL_SECONDS = 15 * 60; // 15 minutes

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (!VLE_TOKEN_CHECK) {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ token: 'dev-token' })
    };
  }

  if (event.requestContext.http.method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
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

  const shortToken = generateToken();
  await storeToken(shortToken, 'short', SHORT_TTL_SECONDS);

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ token: shortToken })
  };
};
