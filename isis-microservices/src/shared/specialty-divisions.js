// Especialidades de Software Medico que se ofrecen divididas en el agendamiento.
// Cada division es una especialidad virtual con su propia configuracion
// (activa, medicos, dias, rangos, precio) pero consulta y bloquea la misma
// agenda de la especialidad real: un horario tomado en una division deja de
// estar disponible en las demas.
// Los ids son numericos porque los contratos publicos (preagendamiento,
// agenda disponible) validan especialidades_id como entero positivo.
export const SPECIALTY_DIVISIONS = {
  "172": [
    { id: "917201", nombre: "CIRUGIA PLASTICA FACIAL (*VALORACION)" },
    { id: "917202", nombre: "CIRUGIA PLASTICA MAMARIAS (*VALORACION)" },
    { id: "917203", nombre: "CIRUGIA PLASTICA CORPORAL (*VALORACION)" }
  ]
};

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
