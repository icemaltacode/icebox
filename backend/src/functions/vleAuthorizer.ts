import { APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda';

const getHeader = (headers: Record<string, string | undefined>, key: string): string | undefined => {
  const foundKey = Object.keys(headers).find((headerKey) => headerKey.toLowerCase() === key.toLowerCase());
  return foundKey ? headers[foundKey] : undefined;
};

const parseAllowedReferrers = (): string[] => {
  const raw = process.env.VLE_ALLOWED_REFERRERS ?? '';
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const isCheckEnabled = () => (process.env.VLE_REFERRER_CHECK_ENABLED ?? '').toLowerCase() === 'true';

const isMatch = (value: string | undefined, allowed: string[]): boolean => {
  if (!value) {
    return false;
  }
  return allowed.some((allowedValue) => value.startsWith(allowedValue));
};

export const handler = async (event: APIGatewayRequestAuthorizerEventV2) => {
  if (!isCheckEnabled()) {
    return { isAuthorized: true };
  }

  const headers = event.headers ?? {};
  const allowedReferrers = parseAllowedReferrers();

  const referer = getHeader(headers, 'referer');
  const origin = getHeader(headers, 'origin');

  const authorized = isMatch(referer, allowedReferrers) || isMatch(origin, allowedReferrers);

  if (!authorized) {
    console.warn('VLE authorizer rejected request', {
      referer,
      origin,
      path: event.requestContext.http?.path,
      sourceIp: event.requestContext.http?.sourceIp
    });
  }

  return {
    isAuthorized: authorized,
    context: {
      reason: authorized ? 'AUTHORIZED' : 'INVALID_REFERRER'
    }
  };
};
