import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);
const CONFIGURED_DEFAULT_MONTH = process.env.NEXT_PUBLIC_DEFAULT_APPOINTMENTS_MONTH || '';
const DEFAULT_MONTH =
  /^\d{4}-\d{2}$/.test(CONFIGURED_DEFAULT_MONTH) && CONFIGURED_DEFAULT_MONTH >= CURRENT_MONTH
    ? CONFIGURED_DEFAULT_MONTH
    : CURRENT_MONTH;

function getApiBaseUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!baseUrl) {
    throw new Error('Falta NEXT_PUBLIC_API_BASE_URL en el frontend.');
  }

  return baseUrl;
}

function readSavedCedula() {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem('clinica-isis-cedula') || '';
}

function formatDateTime(date, time) {
  if (!date || !time) {
    return '';
  }

  return `${date} ${time}`;
}

function formatAppointmentStatus(status) {
  if (status === 'prebooked' || status === 'preagendada') {
    return 'Preagendada';
  }

  if (status === 'booked' || status === 'agendada') {
    return 'Agendada';
  }

  if (status === 'cancelled' || status === 'cancelada') {
    return 'Cancelada';
  }

  if (status === 'rejected' || status === 'rechazada') {
    return 'Rechazada';
  }

  return status || 'Sin estado';
}

export default function CitasPage() {
  const [cedula, setCedula] = useState('');
  const [patientData, setPatientData] = useState(null);
  const [patientLoading, setPatientLoading] = useState(false);
  const [month, setMonth] = useState(DEFAULT_MONTH);
  const [specialty, setSpecialty] = useState('');
  const [specialist, setSpecialist] = useState('');
  const [date, setDate] = useState('');
  const [availability, setAvailability] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [error, setError] = useState('');
  const [bookingSlotId, setBookingSlotId] = useState('');

  useEffect(() => {
    const savedCedula = readSavedCedula();
    if (savedCedula) {
      setCedula(savedCedula);
      loadPatientAppointments(savedCedula);
    }
  }, []);

  const nextAppointment = useMemo(() => patientData?.upcomingAppointments?.[0] || null, [patientData]);
  const nextPrebookedAppointment = useMemo(
    () => patientData?.upcomingPrebookedAppointments?.[0] || null,
    [patientData]
  );

  async function loadPatientAppointments(targetCedula) {
    const normalizedCedula = targetCedula.trim();

    if (!normalizedCedula) {
      setError('Ingresa una cédula para consultar las citas.');
      return;
    }

    setPatientLoading(true);
    setError('');
    setActionMessage('');

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/appointments/patient?cedula=${encodeURIComponent(normalizedCedula)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No fue posible consultar las citas del paciente.');
      }

      setPatientData(data);
      window.localStorage.setItem('clinica-isis-cedula', normalizedCedula);
    } catch (requestError) {
      setPatientData(null);
      setError(requestError.message);
    } finally {
      setPatientLoading(false);
    }
  }

  async function loadAvailability(event) {
    event.preventDefault();
    setAvailabilityLoading(true);
    setError('');
    setActionMessage('');

    try {
      const params = new URLSearchParams({ month, includeSlots: 'true' });
      if (specialty) {
        params.set('specialty', specialty);
      }
      if (specialist) {
        params.set('specialist', specialist);
      }
      if (date) {
        params.set('date', date);
      }

      const response = await fetch(`${getApiBaseUrl()}/appointments/availability?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No fue posible consultar disponibilidad.');
      }

      setAvailability(data.slots || []);
    } catch (requestError) {
      setAvailability([]);
      setError(requestError.message);
    } finally {
      setAvailabilityLoading(false);
    }
  }

  async function bookAppointment(slot) {
    const normalizedCedula = cedula.trim();

    if (!normalizedCedula) {
      setError('Ingresa una cédula antes de agendar.');
      return;
    }

    if (!slot.specialtyId) {
      setError('Este horario no tiene una especialidad identificada. Actualiza la disponibilidad e intenta de nuevo.');
      return;
    }

    setBookingSlotId(slot.slotId);
    setError('');
    setActionMessage('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/preagendamiento`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tipo_documento: 'CC',
          numero_documento: normalizedCedula,
          tipo: Number(slot.tipo || 1),
          fecha_estimada: slot.date,
          hora_estimada: `${slot.startTime}${String(slot.startTime).length === 5 ? ':00' : ''}`,
          especialidades_id: Number(slot.specialtyId),
          consultorios_id: Number(slot.consultoriosId || slot.consultorios_id || 1),
          observacion_solicitud: 'Paciente solicita preagendamiento desde Mis citas'
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No fue posible agendar la cita.');
      }

      setActionMessage(
        data.message ||
          'Tu cita quedo preagendada y pronto personal de Clinica Isis se estara contactando para confirmarla.'
      );
      await Promise.all([loadPatientAppointments(normalizedCedula), refreshAvailability()]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBookingSlotId('');
    }
  }

  async function refreshAvailability() {
    const params = new URLSearchParams({ month, includeSlots: 'true' });
    if (specialty) {
      params.set('specialty', specialty);
    }
    if (specialist) {
      params.set('specialist', specialist);
    }
    if (date) {
      params.set('date', date);
    }

    const response = await fetch(`${getApiBaseUrl()}/appointments/availability?${params.toString()}`);
    const data = await response.json();
    if (response.ok) {
      setAvailability(data.slots || []);
    }
  }

  return (
    <main className="page">
      <section className="card appointments-shell">
        <div className="appointments-topbar">
          <div>
            <p className="eyebrow">Clinica ISIS</p>
            <h1>Agendamiento de citas</h1>
            <p className="lead">
              Consulta citas previas, revisa disponibilidad mensual y deja preagendado el horario que siga libre.
            </p>
          </div>
          <Link className="ghost-link" href="/">
            Volver a validación
          </Link>
        </div>

        <div className="appointments-grid">
          <section className="appointments-panel">
            <h2>Paciente</h2>
            <label htmlFor="cedula-citas">Cédula</label>
            <input
              id="cedula-citas"
              value={cedula}
              onChange={(event) => setCedula(event.target.value)}
              placeholder="Ingresa la cédula"
            />
            <button type="button" onClick={() => loadPatientAppointments(cedula)} disabled={patientLoading}>
              {patientLoading ? 'Consultando...' : 'Ver mis citas'}
            </button>

            {nextAppointment ? (
              <div className="status-card">
                <p className="status-label">Próxima cita</p>
                <strong>
                  {nextAppointment.specialty} con {nextAppointment.specialist}
                </strong>
                <span>{formatDateTime(nextAppointment.date, nextAppointment.startTime)}</span>
                <span>{formatAppointmentStatus(nextAppointment.status || nextAppointment.appointmentStatus)}</span>
              </div>
            ) : null}

            {!nextAppointment && nextPrebookedAppointment ? (
              <div className="status-card">
                <p className="status-label">Preagenda pendiente</p>
                <strong>
                  {nextPrebookedAppointment.specialty} con {nextPrebookedAppointment.specialist}
                </strong>
                <span>{formatDateTime(nextPrebookedAppointment.date, nextPrebookedAppointment.startTime)}</span>
                <span>{formatAppointmentStatus(nextPrebookedAppointment.status || nextPrebookedAppointment.appointmentStatus)}</span>
              </div>
            ) : null}

            {patientData ? (
              <div className="appointments-list">
                <h3>Próximas</h3>
                {patientData.upcomingAppointments.length ? (
                  patientData.upcomingAppointments.map((appointment) => (
                    <article key={appointment.appointmentId} className="appointment-item">
                      <strong>{appointment.specialty}</strong>
                      <span>{appointment.specialist}</span>
                      <span>{formatDateTime(appointment.date, appointment.startTime)}</span>
                      <span>Estado: {formatAppointmentStatus(appointment.status || appointment.appointmentStatus)}</span>
                      {appointment.patientMessage ? <span>{appointment.patientMessage}</span> : null}
                    </article>
                  ))
                ) : (
                  <p className="empty-state">No hay citas próximas registradas.</p>
                )}

                <h3>Preagendadas pendientes</h3>
                {patientData.upcomingPrebookedAppointments?.length ? (
                  patientData.upcomingPrebookedAppointments.map((appointment) => (
                    <article key={appointment.appointmentId} className="appointment-item">
                      <strong>{appointment.specialty}</strong>
                      <span>{appointment.specialist}</span>
                      <span>{formatDateTime(appointment.date, appointment.startTime)}</span>
                      <span>Estado: {formatAppointmentStatus(appointment.status || appointment.appointmentStatus)}</span>
                      {appointment.patientMessage ? <span>{appointment.patientMessage}</span> : null}
                    </article>
                  ))
                ) : (
                  <p className="empty-state">No hay preagendas pendientes.</p>
                )}

                <h3>Historial visible</h3>
                {patientData.pastAppointments.length ? (
                  patientData.pastAppointments.map((appointment) => (
                    <article key={appointment.appointmentId} className="appointment-item muted-item">
                      <strong>{appointment.specialty}</strong>
                      <span>{appointment.specialist}</span>
                      <span>{formatDateTime(appointment.date, appointment.startTime)}</span>
                      <span>Estado: {formatAppointmentStatus(appointment.status || appointment.appointmentStatus)}</span>
                    </article>
                  ))
                ) : (
                  <p className="empty-state">No hay citas previas en el historial consultado.</p>
                )}
              </div>
            ) : null}
          </section>

          <section className="appointments-panel">
            <h2>Disponibilidad</h2>
            <form className="filters-form" onSubmit={loadAvailability}>
              <label htmlFor="month">Mes</label>
              <input id="month" value={month} onChange={(event) => setMonth(event.target.value)} placeholder="YYYY-MM" />

              <label htmlFor="specialty">Especialidad</label>
              <input
                id="specialty"
                value={specialty}
                onChange={(event) => setSpecialty(event.target.value)}
                placeholder="Ej. Cardiología"
              />

              <label htmlFor="specialist">Especialista</label>
              <input
                id="specialist"
                value={specialist}
                onChange={(event) => setSpecialist(event.target.value)}
                placeholder="Ej. Dra. Ana Pérez"
              />

              <label htmlFor="date">Fecha</label>
              <input id="date" value={date} onChange={(event) => setDate(event.target.value)} placeholder="YYYY-MM-DD" />

              <button type="submit" disabled={availabilityLoading}>
                {availabilityLoading ? 'Buscando...' : 'Consultar disponibilidad'}
              </button>
            </form>

            {error ? <p className="error">{error}</p> : null}
            {actionMessage ? <p className="success">{actionMessage}</p> : null}

            <div className="slots-list">
              {availability.length ? (
                availability.map((slot) => (
                  <article key={slot.slotId} className="slot-item">
                    <div>
                      <strong>{slot.specialty}</strong>
                      <p>{slot.specialist}</p>
                      <span>
                        {slot.date} · {slot.startTime} a {slot.endTime}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => bookAppointment(slot)}
                      disabled={bookingSlotId === slot.slotId}
                    >
                      {bookingSlotId === slot.slotId ? 'Preagendando...' : 'Preagendar'}
                    </button>
                  </article>
                ))
              ) : (
                <p className="empty-state">Consulta un mes para ver los slots disponibles.</p>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
