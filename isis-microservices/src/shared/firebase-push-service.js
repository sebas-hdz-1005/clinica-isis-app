import { GoogleAuth } from "google-auth-library";
import { ENV } from "./constants.js";
import { AppError, ERROR_CODES } from "./errors.js";

const FIREBASE_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

const getPrivateKey = () => String(ENV.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

const getFirebaseConfig = () => {
  const projectId = String(ENV.FIREBASE_PROJECT_ID || "").trim();
  const clientEmail = String(ENV.FIREBASE_CLIENT_EMAIL || "").trim();
  const privateKey = getPrivateKey();

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return { projectId, clientEmail, privateKey };
};

const getAccessToken = async (config) => {
  const auth = new GoogleAuth({
    credentials: {
      client_email: config.clientEmail,
      private_key: config.privateKey
    },
    scopes: [FIREBASE_SCOPE]
  });

  const token = await auth.getAccessToken();
  if (!token) {
    throw new AppError(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      "No fue posible obtener el access token de Firebase.",
      502
    );
  }

  return token;
};

const buildMessagePayload = ({
  title,
  body,
  type = "general",
  topic,
  token,
  data = {}
}) => ({
  message: {
    ...(topic ? { topic } : { token }),
    notification: { title, body },
    data: {
      type,
      click_action: "FLUTTER_NOTIFICATION_CLICK",
      ...Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, String(value ?? "")])
      )
    },
    android: {
      notification: {
        click_action: "FLUTTER_NOTIFICATION_CLICK",
        channel_id: "pedometer_channel"
      }
    }
  }
});

export const sendFirebasePush = async (input) => {
  const config = getFirebaseConfig();
  if (!config) {
    return { skipped: true, reason: "missing_firebase_configuration" };
  }

  const token = await getAccessToken(config);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildMessagePayload(input))
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AppError(
      ERROR_CODES.PUSH_NOTIFICATION_ERROR,
      "No fue posible enviar la notificacion push con Firebase.",
      502,
      payload
    );
  }

  return {
    skipped: false,
    provider: "fcm",
    response: payload
  };
};
