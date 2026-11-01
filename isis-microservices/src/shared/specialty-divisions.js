// Especialidades de Software Medico que se ofrecen divididas en el agendamiento.
// Cada division es una especialidad virtual con su propia configuracion
// (activa, medicos, dias, rangos, precio) pero consulta y bloquea la misma
// agenda de la especialidad real: un horario tomado en una division deja de
// estar disponible en las demas.
// Los ids son numericos porque los contratos publicos (preagendamiento,
// agenda disponible) validan especialidades_id como entero positivo.
export const SPECIALTY_DIVISIONS = {
  "168": [
    { id: "916801", nombre: "COSMETOLOGIA CORPORAL (VALORACION)" },
    { id: "916802", nombre: "COSMETOLOGIA FACIAL (VALORACION)" }
  ],
  "172": [
    { id: "917201", nombre: "CIRUGIA PLASTICA FACIAL (VALORACION)" },
    { id: "917202", nombre: "CIRUGIA PLASTICA MAMARIAS (VALORACION)" },
    { id: "917203", nombre: "CIRUGIA PLASTICA CORPORAL (VALORACION)" }
  ]
};

// Orden en que el catalogo de especialidades sale en los endpoints. Las
// especialidades que no estan en la lista van al final, en orden alfabetico.
export const SPECIALTY_CATALOG_ORDER = [
  "1", // Medicina General
  "177", // Ginecologia
  "175", // Otorrinolaringologia
  "176", // Nutricion y Dietetica
  "167", // Medicina Interna
  "97", // Odontologia
  "174", // Odontopediatria
  "178", // Ortodoncia
  "916801", // Cosmetologia Corporal
  "916802", // Cosmetologia Facial
  "94", // Medicina Estetica
  "917201", // Cirugia Plastica Facial
  "917203", // Cirugia Plastica Corporal
  "917202" // Cirugia Plastica Mamarias
];

const catalogPosition = (specialty) => {
  const index = SPECIALTY_CATALOG_ORDER.indexOf(String(specialty.id));
  return index === -1 ? SPECIALTY_CATALOG_ORDER.length : index;
};

export const sortSpecialtiesForCatalog = (specialties = []) =>
  [...specialties].sort(
    (left, right) =>
      catalogPosition(left) - catalogPosition(right) ||
      String(left.nombre).localeCompare(String(right.nombre), "es")
  );

export const expandSpecialtyDivisions = (specialties = []) =>
  specialties.flatMap((specialty) => {
    const divisions = SPECIALTY_DIVISIONS[String(specialty.id)];
    if (!divisions) return [specialty];

    return divisions.map((division) => ({
      ...specialty,
      id: division.id,
      nombre: division.nombre,
      providerSpecialtyId: String(specialty.id),
      especialistas: [...(specialty.especialistas || [])],
      cita_tipos: [...(specialty.cita_tipos || [])]
    }));
  });

export const resolveProviderSpecialtyId = (specialty = {}) =>
  String(specialty.providerSpecialtyId || specialty.id);

// Una division que aun no se ha guardado desde Agenda activa hereda la
// configuracion de su especialidad real, para que no desaparezca del
// agendamiento al publicarse. Al guardar, el dashboard escribe los medicos de
// cada especialidad y la division pasa a tener configuracion propia.
export const inheritSpecialtyDivisionsConfig = (config) => {
  const medicos = { ...config.medicosActivosPorEspecialidad };
  const dias = { ...config.diasActivosPorEspecialidad };
  const rangos = { ...config.rangosActivosPorMedico };
  const activas = config.especialidadesActivas
    ? [...config.especialidadesActivas]
    : null;

  Object.entries(SPECIALTY_DIVISIONS).forEach(([providerId, divisions]) => {
    divisions.forEach(({ id }) => {
      if (medicos[id] !== undefined || dias[id] !== undefined) return;

      if (medicos[providerId] !== undefined) medicos[id] = [...medicos[providerId]];
      if (dias[providerId] !== undefined) dias[id] = [...dias[providerId]];
      if (rangos[providerId] !== undefined) rangos[id] = { ...rangos[providerId] };
      if (activas && activas.includes(providerId) && !activas.includes(id)) {
        activas.push(id);
      }
    });
  });

  return {
    ...config,
    especialidadesActivas: activas,
    medicosActivosPorEspecialidad: medicos,
    diasActivosPorEspecialidad: dias,
    rangosActivosPorMedico: rangos
  };
};
