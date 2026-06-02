import {
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ForgotPasswordCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { ENV } from "./constants.js";
import { AppError, ERROR_CODES } from "./errors.js";

const client = new CognitoIdentityProviderClient({ region: ENV.AWS_REGION });

const mapCognitoError = (error) => {
  if (error?.name === "NotAuthorizedException") {
    return new AppError(ERROR_CODES.INVALID_CREDENTIALS, "Credenciales inválidas.", 401);
  }
  if (error?.name === "UserNotFoundException") {
    return new AppError(ERROR_CODES.USER_NOT_FOUND, "Usuario no encontrado.", 404);
  }
  if (error?.name === "UserNotConfirmedException") {
    return new AppError(ERROR_CODES.USER_NOT_CONFIRMED, "El usuario no ha sido confirmado.", 403);
  }
  if (error?.name === "CodeMismatchException") {
    return new AppError(ERROR_CODES.INVALID_CODE, "El código de recuperación es inválido.", 400);
  }
  if (error?.name === "ExpiredCodeException") {
    return new AppError(ERROR_CODES.EXPIRED_CODE, "El código de recuperación expiró.", 400);
  }
  if (error?.name === "InvalidPasswordException") {
    return new AppError(ERROR_CODES.PASSWORD_POLICY_ERROR, "La nueva contraseña no cumple la política requerida.", 400);
  }
  return new AppError(ERROR_CODES.AUTH_PROVIDER_ERROR, "Error en el proveedor de autenticación.", 502);
};

export const loginWithCognito = async ({ cedula, password }) => {
  try {
    const result = await client.send(new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: ENV.COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: cedula,
        PASSWORD: password
      }
    }));
    const auth = result.AuthenticationResult || {};
    return {
      accessToken: auth.AccessToken,
      idToken: auth.IdToken,
      refreshToken: auth.RefreshToken,
      expiresIn: auth.ExpiresIn,
      tokenType: auth.TokenType
    };
  } catch (error) {
    throw mapCognitoError(error);
  }
};

export const startForgotPassword = async ({ cedula }) => {
  try {
    await client.send(new ForgotPasswordCommand({
      ClientId: ENV.COGNITO_CLIENT_ID,
      Username: cedula
    }));
  } catch (error) {
    throw mapCognitoError(error);
  }
};

export const confirmForgotPassword = async ({ cedula, code, newPassword }) => {
  try {
    await client.send(new ConfirmForgotPasswordCommand({
      ClientId: ENV.COGNITO_CLIENT_ID,
      Username: cedula,
      ConfirmationCode: code,
      Password: newPassword
    }));
  } catch (error) {
    throw mapCognitoError(error);
  }
};

export const logoutFromCognito = async ({ accessToken }) => {
  try {
    await client.send(new GlobalSignOutCommand({ AccessToken: accessToken }));
  } catch (error) {
    throw mapCognitoError(error);
  }
};
