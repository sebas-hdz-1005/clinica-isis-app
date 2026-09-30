import { ENV, STATUS } from "./constants.js";
import { getItem, queryItems, updateItem } from "./dynamodb.js";
import { AppError, ERROR_CODES } from "./errors.js";
import { findUserProfileByCedula } from "./users-service.js";

const GENERAL_TERMS =
  "No se pueden realizar todos los procedimientos en un solo día. Los beneficios utilizados permanecen inactivos hasta nueva indicación de Clínica Isis.";

export const GLOBAL_BENEFITS = Object.freeze([
  {
    benefitId: "limpiezas-faciales-profundas",
    title: "2 limpiezas faciales profundas",
    description: "Incluye dos limpiezas faciales profundas.",
    type: "GIFT",
    includedUses: 2,
    durationMinutes: 30,
    discountPercentage: null,
    status: STATUS.ACTIVE,
    image: null,
    validUntil: null,
    terms: GENERAL_TERMS
  },
  {
    benefitId: "limpiezas-dentales-profundas",
    title: "2 limpiezas dentales profundas",
    description: "Incluye dos limpiezas dentales profundas.",
    type: "GIFT",
    includedUses: 2,
    durationMinutes: 60,
    discountPercentage: null,
    status: STATUS.ACTIVE,
    image: null,
    validUntil: null,
    terms: GENERAL_TERMS
  },
  {
    benefitId: "masajes-relajacion-completos",
    title: "2 masajes de relajación completos",
    description: "Incluye dos masajes de relajación completos.",
    type: "GIFT",
    includedUses: 2,
    durationMinutes: 60,
    discountPercentage: null,
    status: STATUS.ACTIVE,
    image: null,
    validUntil: null,
    terms: GENERAL_TERMS
  },
  {
    benefitId: "descuento-consulta-medicina-general",
    title: "50% de descuento en consulta de medicina general",
    description: "Descuento aplicable a una consulta de medicina general.",
    type: "DISCOUNT",
    includedUses: 1,
    durationMinutes: null,
    discountPercentage: 50,
    status: STATUS.ACTIVE,
    image: null,
    validUntil: null,
    terms: GENERAL_TERMS
  },
  {
    benefitId: "descuento-consulta-medicina-especializada",
    title: "15% de descuento en medicina especializada",
    description:
      "Aplica en consultas de otorrinolaringología, ginecología, nutrición y dietética, e incluye un control.",
    type: "DISCOUNT",
    includedUses: 1,
    durationMinutes: null,
    discountPercentage: 15,
    status: STATUS.ACTIVE,
    image: null,
    validUntil: null,
    terms: GENERAL_TERMS
  },
  {
    benefitId: "descuento-ginecologia-ecografia",
    title: "15% de descuento en consulta ginecológica con ecografía",
    description:
      "Aplica con ecografía mamaria, ginecológica, transvaginal u obstétrica.",
    type: "DISCOUNT",
    includedUses: 1,
    durationMinutes: null,
    discountPercentage: 15,
    status: STATUS.ACTIVE,
    image: null,
    validUntil: null,
    terms: GENERAL_TERMS
  },
  {
    benefitId: "descuento-ginecologia-citologia",
    title: "15% de descuento en consulta ginecológica con citología",
    description: "Aplica a consulta ginecológica con citología cervicouterina.",
    type: "DISCOUNT",
    includedUses: 1,
    durationMinutes: null,
    discountPercentage: 15,
    status: STATUS.ACTIVE,
    image: null,
    validUntil: null,
    terms: GENERAL_TERMS
  },
  {
    benefitId: "descuento-electrocardiograma",
    title: "50% de descuento en electrocardiograma",
    description: "Descuento aplicable al servicio de electrocardiograma.",
    type: "DISCOUNT",
    includedUses: 1,
    durationMinutes: null,
    discountPercentage: 50,
    status: STATUS.ACTIVE,
    image: null,
    validUntil: null,
    terms: GENERAL_TERMS
  },
  {
    benefitId: "descuento-camara-hiperbarica",
    title: "10% de descuento en cámara hiperbárica",
    description: "Descuento aplicable a una sesión de cámara hiperbárica.",
    type: "DISCOUNT",
    includedUses: 1,
    durationMinutes: null,
    discountPercentage: 10,
    status: STATUS.ACTIVE,
    image: null,
    validUntil: null,
    terms: GENERAL_TERMS
  },
  {
    benefitId: "descuento-farmacia",
    title: "5% de descuento en farmacia",
    description: "Aplica en insumos, medicamentos y productos de farmacia.",
    type: "DISCOUNT",
    includedUses: 1,
    durationMinutes: null,
    discountPercentage: 5,
    status: STATUS.ACTIVE,
    image: null,
    validUntil: null,
    terms: GENERAL_TERMS
  },
  {
    benefitId: "tarifas-especiales-estetica",
    title: "Tarifas especiales Isis en estética",
    description: "Tarifas especiales para consultas y procedimientos estéticos.",
    type: "SPECIAL_RATE",
    includedUses: 1,
    durationMinutes: null,
    discountPercentage: null,
    status: STATUS.ACTIVE,
    image: null,
    validUntil: null,
    terms: GENERAL_TERMS
  }
]);

export const getGlobalBenefit = (benefitId) =>
  GLOBAL_BENEFITS.find((benefit) => benefit.benefitId === String(benefitId || "").trim()) || null;

export const buildUserBenefits = (catalog, states = []) => {
  const statesByBenefit = new Map(
    states.map((state) => [
      state.benefitId || String(state.SK || "").replace(/^BENEFIT#/, ""),
      state
    ])
  );

  return catalog.map((benefit) => {
    const state = statesByBenefit.get(benefit.benefitId);
    const active = state?.status !== STATUS.INACTIVE;

    return {
      ...benefit,
      active,
      userStatus: active ? STATUS.ACTIVE : STATUS.INACTIVE,
      inactiveAt: state?.inactiveAt || null,
      inactiveBy: state?.inactiveBy || null,
      reactivatedAt: state?.reactivatedAt || null,
      updatedAt: state?.updatedAt || null
    };
  });
};

export const listUserBenefitStates = async (userId) => {
  const result = await queryItems({
    TableName: ENV.BENEFITS_TABLE,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: {
      ":pk": `USER#${userId}`,
      ":prefix": "BENEFIT#"
    }
  });

  return result.Items || [];
};

export const listAvailableBenefitsForUser = async (userId) => {
  const benefits = buildUserBenefits(GLOBAL_BENEFITS, await listUserBenefitStates(userId));

  return benefits
    .filter((benefit) => benefit.active && benefit.status === STATUS.ACTIVE)
    .map(({ active, userStatus, inactiveAt, inactiveBy, reactivatedAt, updatedAt, ...benefit }) => ({
      ...benefit,
      assignedAt: null,
      viewed: false
    }));
};

export const getUserBenefitsByCedula = async (cedula) => {
  const profile = await findUserProfileByCedula(cedula);
  if (!profile) {
    throw new AppError(ERROR_CODES.USER_NOT_FOUND, "Usuario no encontrado.", 404);
  }

  const userId = String(profile.PK || "").replace(/^USER#/, "");
  const benefits = buildUserBenefits(GLOBAL_BENEFITS, await listUserBenefitStates(userId));

  return {
    user: {
      userId,
      cedula: profile.cedula,
      documentType: profile.documentType || null,
      name: profile.name || null,
      email: profile.email || null,
      phone: profile.phone || null,
      status: profile.status || STATUS.INACTIVE
    },
    summary: {
      total: benefits.length,
      active: benefits.filter((benefit) => benefit.active).length,
      inactive: benefits.filter((benefit) => !benefit.active).length
    },
    benefits
  };
};

export const setUserBenefitActive = async ({
  userId,
  benefitId,
  active,
  updatedBy
}) => {
  const normalizedUserId = String(userId || "").trim();
  const benefit = getGlobalBenefit(benefitId);

  if (!normalizedUserId || !benefit || typeof active !== "boolean") {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "userId, benefitId y active son obligatorios.",
      400
    );
  }

  const profile = await getItem(ENV.USERS_TABLE, {
    PK: `USER#${normalizedUserId}`,
    SK: "PROFILE"
  });
  if (!profile) {
    throw new AppError(ERROR_CODES.USER_NOT_FOUND, "Usuario no encontrado.", 404);
  }

  const now = new Date().toISOString();
  const actor = String(updatedBy || "").trim() || "dashboard";
  const auditSet = active
    ? "reactivatedAt = :updatedAt, reactivatedBy = :updatedBy"
    : "inactiveAt = :updatedAt, inactiveBy = :updatedBy";
  const auditRemove = active
    ? "inactiveAt, inactiveBy"
    : "reactivatedAt, reactivatedBy";

  const state = await updateItem({
    TableName: ENV.BENEFITS_TABLE,
    Key: {
      PK: `USER#${normalizedUserId}`,
      SK: `BENEFIT#${benefit.benefitId}`
    },
    UpdateExpression:
      `SET benefitId = :benefitId, #status = :status, active = :active, ` +
      `updatedAt = :updatedAt, updatedBy = :updatedBy, notified = :notified, ${auditSet} ` +
      `REMOVE ${auditRemove}`,
    ExpressionAttributeNames: {
      "#status": "status"
    },
    ExpressionAttributeValues: {
      ":benefitId": benefit.benefitId,
      ":status": active ? STATUS.ACTIVE : STATUS.INACTIVE,
      ":active": active,
      ":updatedAt": now,
      ":updatedBy": actor,
      ":notified": true
    },
    ReturnValues: "ALL_NEW"
  });

  return buildUserBenefits([benefit], [state])[0];
};
