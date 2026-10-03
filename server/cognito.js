const crypto = require('crypto');
const {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const REGION = process.env.COGNITO_REGION;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET;

const client = REGION ? new CognitoIdentityProviderClient({ region: REGION }) : null;

function secretHash(username) {
  if (!CLIENT_SECRET) return undefined;
  return crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(username + CLIENT_ID)
    .digest('base64');
}

// Verifies an admin's username/password against the Cognito user pool.
// Resolves with the Cognito username on success; throws a user-facing
// Error (safe to show in the login form) on failure.
async function verifyCredentials(username, password) {
  if (!client || !USER_POOL_ID || !CLIENT_ID) {
    throw new Error('Cognito is not configured on the server.');
  }

  const authParameters = { USERNAME: username, PASSWORD: password };
  const hash = secretHash(username);
  if (hash) authParameters.SECRET_HASH = hash;

  let response;
  try {
    response = await client.send(
      new AdminInitiateAuthCommand({
        UserPoolId: USER_POOL_ID,
        ClientId: CLIENT_ID,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: authParameters,
      })
    );
  } catch (err) {
    if (err.name === 'NotAuthorizedException' || err.name === 'UserNotFoundException') {
      throw new Error('Invalid username or password.');
    }
    if (err.name === 'UserNotConfirmedException') {
      throw new Error('This account has not been confirmed yet.');
    }
    if (err.name === 'PasswordResetRequiredException') {
      throw new Error('This account requires a password reset in Cognito before logging in.');
    }
    throw new Error(`Cognito authentication failed: ${err.message}`);
  }

  if (response.ChallengeName) {
    throw new Error(
      `Additional verification is required (${response.ChallengeName}). Set a permanent password for this user via the AWS CLI or console before logging in.`
    );
  }

  return { username };
}

module.exports = { verifyCredentials };
