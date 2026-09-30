import { ENV } from "./constants.js";
import { AppError, ERROR_CODES } from "./errors.js";
import { logger } from "./logger.js";

const TOKEN_REFRESH_MARGIN_MS = 60_000;
const CATALOG_CACHE_TTL_MS = 5 * 60_000;

let tokenCache = {
  token: "",
  expiresAt: 0
};

const catalogCache = new Map();

const compactText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeId = (value) => {
  const id = compactText(value);
  return id || null;
};

const readNumericStatus = (payload, fallback = 0) => {
  const status = Number(payload?.status ?? payload?.statusCode ?? fallback);
  return Number.isInteger(status) ? status : fallback;
};

const readProviderCode = (payload) =>
  compactText(payload?.error_code ?? payload?.errorCode ?? payload?.code).toUpperCase();

const isAuthFailure = (status, payload) => {
  const providerStatus = readNumericStatus(payload, status);
  const providerCode = readProviderCode(payload);
  return (
    status === 401 ||
    status === 403 ||
    providerStatus === 401 ||
    providerStatus === 403 ||
    providerCode.includes("TOKEN") ||
    providerCode.includes("AUTH")
  );
};

const isDisabled = (item = {}) => {
  if (item.activo === false || item.habilitado === false || item.enabled === false) return true;
  if (Number(item.activo) === 0 || Number(item.habilitado) === 0 || Number(item.enabled) === 0) {
    return true;
  }

  const status = compactText(item.estado ?? item.status).toLowerCase();
  return ["inactivo", "inactive", "disabled", "deshabilitado", "bloqueado"].includes(status);
};

const extractCollection = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const candidates = [
    payload.data,
    payload.result,
    payload.results,
    payload.items,
    payload.especialidades,
    payload.especialistas,
    payload.sedes
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === "object") {
      const nested = extractCollection(candidate);
      if (nested.length > 0) return nested;
    }
  }

  return [];
};

const normalizeCitaTipo = (item = {}) => {
  const id = normalizeId(item.id ?? item.cita_tipo_id ?? item.citas_tipos_id);
  if (!id || isDisabled(item)) return null;

  return {
    id,
    nombre: compactText(item.nombre ?? item.name ?? item.tipo),
    tipo: compactText(item.tipo ?? item.nombre ?? item.name)
  };
};

export const normalizeSoftwareMedicoSpecialist = (item = {}) => {
  const id = normalizeId(item.id ?? item.especialista_id ?? item.medico_id);
  const firstName = compactText(item.first_name ?? item.nombre ?? item.nombres);
  if (!id || !firstName || isDisabled(item)) return null;

  return {
    id,
    first_name: firstName,
    last_name: compactText(item.last_name ?? item.apellidos)
  };
};

const normalizeSpecialists = (items = []) => {
  const unique = new Map();

  items.forEach((item) => {
    const specialist = normalizeSoftwareMedicoSpecialist(item);
    if (!specialist) return;
    const key = specialist.id || `${specialist.first_name}|${specialist.last_name}`.toLowerCase();
    if (!unique.has(key)) unique.set(key, specialist);
  });

  return Array.from(unique.values()).sort((a, b) =>
    `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, "es")
  );
};

export const normalizeSoftwareMedicoSpecialties = (payload) => {
  const unique = new Map();

  extractCollection(payload).forEach((item = {}) => {
    const id = normalizeId(item.id ?? item.especialidad_id);
    const nombre = compactText(item.nombre ?? item.name ?? item.especialidad);
    if (!id || !nombre || isDisabled(item)) return;

    const specialists = normalizeSpecialists(
      item.especialistas ?? item.medicos ?? item.profesionales ?? []
    );
    const citaTipos = (item.cita_tipos ?? item.tipos_cita ?? [])
      .map(normalizeCitaTipo)
      .filter(Boolean);

    unique.set(id, {
      id,
      nombre,
      codigo: compactText(item.codigo),
      cita_tipos: citaTipos,
      especialistas: specialists
    });
  });

  return Array.from(unique.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
};

const readJwtExpiration = (token) => {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split(".")[1], "base64url").toString("utf8"));
    return Number(payload.exp) * 1000;
  } catch {
    return 0;
  }
};

const extractToken = (payload) => {
  if (typeof payload === "string") return compactText(payload);
  if (!payload || typeof payload !== "object") return "";

  const direct =
    payload.token ??
    payload.access_token ??
    payload.accessToken ??
    payload.jwt ??
    payload.authorization;
  if (direct) return compactText(String(direct).replace(/^Bearer\s+/i, ""));
  return extractToken(payload.data ?? payload.result);
};

const providerError = (status, payload, path) => {
  const providerStatus = readNumericStatus(payload, status);
  const providerCode = readProviderCode(payload);

  logger.warn("Software Medico request rejected", {
    path,
    providerStatus,
    providerCode
  });

  if ([400, 422].includes(providerStatus)) {
    return new AppError(
      ERROR_CODES.SOFTWARE_MEDICO_VALIDATION_ERROR,
      "Software Medico rechazo los parametros de la consulta.",
      422
    );
  }
  if (providerStatus === 404) {
    return new AppError(
      ERROR_CODES.NOT_FOUND,
      "No se encontro la informacion solicitada en Software Medico.",
      404
    );
  }
  if (path === "auth/login" || isAuthFailure(status, payload)) {
    return new AppError(
      ERROR_CODES.SOFTWARE_MEDICO_AUTH_ERROR,
      "No fue posible autenticar el backend con Software Medico.",
      502
    );
  }

  return new AppError(
    ERROR_CODES.SOFTWARE_MEDICO_UNAVAILABLE,
    "Software Medico no esta disponible temporalmente.",
    503
  );
};

const parseResponse = async (response, path) => {
  const raw = await response.text();
  if (!raw) {
    if (!response.ok) throw providerError(response.status, {}, path);
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError(
      ERROR_CODES.SOFTWARE_MEDICO_RESPONSE_ERROR,
      "Software Medico devolvio una respuesta no valida.",
      502
    );
  }
};

const fetchProvider = async (path, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENV.SOFTWARE_MEDICO_TIMEOUT_MS);
  const url = new URL(path, `${ENV.SOFTWARE_MEDICO_BASE_URL.replace(/\/+$/, "")}/`);

  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    const payload = await parseResponse(response, path);
    return { response, payload };
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.warn("Software Medico connection failed", {
      path,
      errorName: error?.name,
      errorMessage: error?.message
    });
    throw new AppError(
      ERROR_CODES.SOFTWARE_MEDICO_UNAVAILABLE,
      "No fue posible conectar con Software Medico.",
      503
    );
  } finally {
    clearTimeout(timeout);
  }
};

export const isSoftwareMedicoConfigured = () =>
  Boolean(ENV.SOFTWARE_MEDICO_USERNAME && ENV.SOFTWARE_MEDICO_PASSWORD);

const authenticate = async () => {
  if (!isSoftwareMedicoConfigured()) {
    throw new AppError(
      ERROR_CODES.SOFTWARE_MEDICO_CONFIGURATION_ERROR,
      "La integracion con Software Medico no tiene credenciales configuradas.",
      503
    );
  }

  const { response, payload } = await fetchProvider("auth/login", {
    method: "POST",
    body: {
      usuario: ENV.SOFTWARE_MEDICO_USERNAME,
      clave: ENV.SOFTWARE_MEDICO_PASSWORD
    }
  });

  const token = extractToken(payload);
  if (!response.ok || payload?.success === false || !token) {
    throw providerError(response.status, payload, "auth/login");
  }

  tokenCache = {
    token,
    expiresAt:
      readJwtExpiration(token) ||
      Date.now() + ENV.SOFTWARE_MEDICO_TOKEN_TTL_SECONDS * 1000
  };

  return token;
};

const getToken = async () => {
  if (
    tokenCache.token &&
    tokenCache.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()
  ) {
    return tokenCache.token;
  }
  return authenticate();
};

const request = async (path, options = {}) => {
  let token = await getToken();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { response, payload } = await fetchProvider(path, {
      ...options,
      token
    });

    if (isAuthFailure(response.status, payload) && attempt === 0) {
      tokenCache = { token: "", expiresAt: 0 };
      token = await authenticate();
      continue;
    }

    if (!response.ok || payload?.success === false) {
      throw providerError(response.status, payload, path);
    }

    return payload;
  }

  throw new AppError(
    ERROR_CODES.SOFTWARE_MEDICO_AUTH_ERROR,
    "No fue posible autenticar el backend con Software Medico.",
    502
  );
};

const cachedRequest = async (key, load) => {
  const cached = catalogCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = await load();
  catalogCache.set(key, {
    value,
    expiresAt: Date.now() + CATALOG_CACHE_TTL_MS
  });
  return value;
};

export const listSoftwareMedicoSpecialties = () =>
  cachedRequest("especialidades", async () =>
    normalizeSoftwareMedicoSpecialties(await request("especialidad"))
  );

export const listSoftwareMedicoAppointmentTypes = () =>
  cachedRequest("cita_tipos", async () =>
    extractCollection(await request("cita_tipo"))
      .map(normalizeCitaTipo)
      .filter(Boolean)
  );

export const listSoftwareMedicoSpecialists = async (especialidadId) => {
  const id = normalizeId(especialidadId);
  if (!id || !/^\d+$/.test(id)) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "El parametro especialidadId es obligatorio y debe ser un identificador numerico.",
      400
    );
  }
  const specialties = await listSoftwareMedicoSpecialties();
  const specialty = specialties.find((item) => item.id === id);
  if (!specialty) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      "No se encontro la especialidad solicitada.",
      404
    );
  }
  return {
    specialty,
    specialists: specialty.especialistas
  };
};

export const listSoftwareMedicoSites = () =>
  cachedRequest("sedes", async () => {
    const payload = await request("centro_medico_sede");
    return extractCollection(payload)
      .filter((item) => !isDisabled(item))
      .map((item) => ({
        id: normalizeId(item.id ?? item.centro_medico_sede_id),
        nombre: compactText(item.sede ?? item.nombre ?? item.name)
      }))
      .filter((item) => item.id);
  });

export const getSoftwareMedicoAvailability = (params) =>
  request("agenda_disponible", {
    query: {
      especialidad_id: params.especialidadId,
      citas_tipos_id: params.citaTipoId,
      centro_medico_sede_id: params.sedeId,
      especialista_id: params.medicoId,
      fecha: params.fecha
    }
  });

export const resetSoftwareMedicoCachesForTests = () => {
  tokenCache = { token: "", expiresAt: 0 };
  catalogCache.clear();
};
