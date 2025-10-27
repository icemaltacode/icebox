import {
  AuthenticationDetails,
  CognitoRefreshToken,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession
} from 'amazon-cognito-identity-js';

const getRequiredEnv = (key: string): string => {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
};

const USER_POOL_ID = getRequiredEnv('VITE_ADMIN_USER_POOL_ID');
const CLIENT_ID = getRequiredEnv('VITE_ADMIN_USER_POOL_CLIENT_ID');

const pool = new CognitoUserPool({
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID
});

export type AdminSession = {
  username: string;
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
  name?: string;
};

type TokenPayload = {
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
};

const buildSession = (
  username: string,
  session: CognitoUserSession
): AdminSession => {
  const idToken = session.getIdToken();
  const accessToken = session.getAccessToken();
  const refreshToken = session.getRefreshToken();

  const payload =
    typeof idToken.decodePayload === 'function'
      ? (idToken.decodePayload() as TokenPayload)
      : ((idToken as unknown as { payload?: TokenPayload }).payload ?? {});

  const name =
    payload?.name ??
    (payload?.given_name && payload?.family_name
      ? `${payload.given_name} ${payload.family_name}`
      : payload?.given_name);

  return {
    username,
    idToken: idToken.getJwtToken(),
    accessToken: accessToken.getJwtToken(),
    refreshToken: refreshToken.getToken(),
    expiresAt: idToken.getExpiration() * 1000,
    email: payload?.email ?? username,
    name: name ?? undefined
  };
};

export type NewPasswordRequiredChallenge = {
  type: 'NEW_PASSWORD_REQUIRED';
  cognitoUser: CognitoUser;
  userAttributes: Record<string, unknown>;
  requiredAttributes: string[];
  username: string;
};

export type SignInSuccess = {
  type: 'SUCCESS';
  cognitoUser: CognitoUser;
  session: AdminSession;
};

export type SignInResult = SignInSuccess | NewPasswordRequiredChallenge;

export const signIn = async (username: string, password: string): Promise<SignInResult> => {
  const cognitoUser = new CognitoUser({
    Username: username,
    Pool: pool
  });

  const authenticationDetails = new AuthenticationDetails({
    Username: username,
    Password: password
  });

  return new Promise<SignInResult>((resolve, reject) => {
    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (session) => {
        resolve({
          type: 'SUCCESS',
          cognitoUser,
          session: buildSession(username, session)
        });
      },
      onFailure: (error) => {
        reject(error);
      },
      newPasswordRequired: (userAttributes, requiredAttributes) => {
        // Cognito returns these attributes and expects certain ones to be removed before submission.
        const sanitizedAttributes = { ...userAttributes };
        delete sanitizedAttributes.email_verified;
        delete sanitizedAttributes.email;
        delete sanitizedAttributes.phone_number;
        delete sanitizedAttributes.phone_number_verified;
        resolve({
          type: 'NEW_PASSWORD_REQUIRED',
          cognitoUser,
          userAttributes: sanitizedAttributes,
          requiredAttributes,
          username
        });
      }
    });
  });
};

export const completeNewPassword = async (
  challenge: NewPasswordRequiredChallenge,
  newPassword: string
): Promise<SignInSuccess> =>
  new Promise((resolve, reject) => {
    challenge.cognitoUser.completeNewPasswordChallenge(
      newPassword,
      challenge.userAttributes,
      {
        onSuccess: (session) => {
          resolve({
            type: 'SUCCESS',
            cognitoUser: challenge.cognitoUser,
            session: buildSession(challenge.username, session)
          });
        },
        onFailure: (error) => {
          reject(error);
        }
      }
    );
  });

export const refreshSession = async (
  username: string,
  refreshToken: string
): Promise<SignInSuccess> => {
  const cognitoUser = new CognitoUser({
    Username: username,
    Pool: pool
  });

  const token = new CognitoRefreshToken({ RefreshToken: refreshToken });

  return new Promise((resolve, reject) => {
    cognitoUser.refreshSession(token, (error, session) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        type: 'SUCCESS',
        cognitoUser,
        session: buildSession(username, session)
      });
    });
  });
};

export const signOut = (username: string) => {
  const cognitoUser = new CognitoUser({
    Username: username,
    Pool: pool
  });
  try {
    cognitoUser.signOut();
  } catch (error) {
    console.warn('Failed to sign out Cognito user', { error });
  }
};
