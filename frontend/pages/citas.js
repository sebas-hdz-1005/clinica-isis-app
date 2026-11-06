import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import SiteLayout from '../components/SiteLayout';

const SEARCH_WINDOW_DAYS = 14;
// Con "Cualquier profesional" se consulta la agenda de cada medico: ventana mas corta
// y pocas consultas a la vez para no saturar Software Medico.
const ANY_DOCTOR_WINDOW_DAYS = 7;
const ANY_DOCTOR_CONCURRENCY = 3;
const ANY_DOCTOR = { id: 'any' };
const SAVED_CEDULA_KEY = 'clinica-isis-cedula';
const STEPS = ['Especialidad', 'Médico y horario', 'Tus datos'];

function getApiBaseUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!baseUrl) {
    throw new Error('Falta NEXT_PUBLIC_API_BASE_URL en el frontend.');
  }

  return baseUrl;
}

async function requestJson(path, options) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || 'No fue posible completar la solicitud. Intenta de nuevo.');
  }

  return payload && typeof payload === 'object' && payload.success && 'data' in payload ? payload.data : payload;
}

// Fecha y hora actuales en Colombia, que es la zona de la agenda.
function bogotaNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );

  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDay(date, options = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat('es-CO', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

function formatTime(time) {
  const [hours = '00', minutes = '00'] = String(time || '').split(':');
  return new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(2000, 0, 1, Number(hours), Number(minutes))));
}

function agendaPath(specialtyId, doctorId, start, days) {
  const params = new URLSearchParams({
    especialidadId: specialtyId,
    medicoId: doctorId,
    fechaInicio: start,
    fechaFin: addDays(start, days - 1)
  });
  return `/api/agenda/disponible?${params.toString()}`;
}

function doctorName(doctor) {
  return [doctor?.first_name, doctor?.last_name].filter(Boolean).join(' ').trim() || 'Médico';
}

// Sin el paréntesis de la especialidad, para que quepa debajo de la hora.
function shortDoctorName(doctor) {
  return doctorName(doctor).replace(/\s*\([^)]*\)\s*$/, '');
}

function formatStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['prebooked', 'preagendada'].includes(value)) return { label: 'Por confirmar', tone: 'ui-chip-warn' };
  if (['booked', 'agendada'].includes(value)) return { label: 'Confirmada', tone: 'ui-chip-ok' };
  if (['cancelled', 'cancelada'].includes(value)) return { label: 'Cancelada', tone: '' };
  if (['rejected', 'rechazada'].includes(value)) return { label: 'Rechazada', tone: 'ui-chip-danger' };
  return { label: status || 'Sin estado', tone: '' };
}

function MyAppointments() {
  const [cedula, setCedula] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SAVED_CEDULA_KEY);
      if (saved) {
        setCedula(saved);
        load(saved);
      }
    } catch {
      // Sin almacenamiento local: el paciente consulta manualmente.
    }
  }, []);

  async function load(targetCedula) {
    const normalized = String(targetCedula || '').trim();
    if (!normalized) {
      setError('Ingresa tu cédula.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      setData(await requestJson(`/appointments/patient?cedula=${encodeURIComponent(normalized)}`));
      try {
        window.localStorage.setItem(SAVED_CEDULA_KEY, normalized);
      } catch {
        // Ignorado: recordar la cédula es solo una comodidad.
      }
    } catch (requestError) {
      setData(null);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  const upcoming = [...(data?.upcomingPrebookedAppointments || []), ...(data?.upcomingAppointments || [])].sort(
    (left, right) => `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`)
  );

  return (
    <section className="ui-card">
      <div className="ui-card-header">
        <div>
          <h2>Mis citas</h2>
          <p>Consulta tus citas con tu cédula.</p>
        </div>
      </div>
      <div className="ui-card-body booking-stack">
        <form
          className="booking-stack"
          onSubmit={(event) => {
            event.preventDefault();
            load(cedula);
          }}
        >
          <div className="ui-field">
            <label htmlFor="mis-citas-cedula">Cédula</label>
            <div className="ui-input-icon">
              <Icon name="idCard" />
              <input
                id="mis-citas-cedula"
                className="ui-input"
                inputMode="numeric"
                value={cedula}
                onChange={(event) => setCedula(event.target.value)}
                placeholder="Tu número de cédula"
              />
            </div>
          </div>
          <button type="submit" className="ui-btn ui-btn-secondary" disabled={loading}>
            {loading ? 'Consultando...' : 'Ver mis citas'}
          </button>
        </form>

        {error ? (
          <p className="ui-alert" role="alert">
            <Icon name="alert" />
            {error}
          </p>
        ) : null}

        {data ? (
          upcoming.length ? (
            <div className="booking-appointments">
              {upcoming.map((appointment) => {
                const status = formatStatus(appointment.status || appointment.appointmentStatus);
                return (
                  <article key={appointment.appointmentId} className="booking-appointment">
                    <strong>{appointment.specialty}</strong>
                    <span>{appointment.specialist}</span>
                    <span>
                      {formatDay(appointment.date, { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
                      {formatTime(appointment.startTime)}
                    </span>
                    <span className={`ui-chip ${status.tone}`}>{status.label}</span>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="ui-hint">No tienes citas próximas.</p>
          )
        ) : null}
      </div>
    </section>
  );
}

export default function CitasPage() {
  const [specialties, setSpecialties] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [specialtySearch, setSpecialtySearch] = useState('');
  const [specialty, setSpecialty] = useState(null);
  const [doctor, setDoctor] = useState(null);
  const [rangeStart, setRangeStart] = useState(() => bogotaNow().date);
  // Una entrada por medico consultado: { doctor, data }.
  const [agendaResults, setAgendaResults] = useState([]);
  const [agendaProgress, setAgendaProgress] = useState({ done: 0, total: 0 });
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaError, setAgendaError] = useState('');
  const [slot, setSlot] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [dateTouched, setDateTouched] = useState(false);
  const [patient, setPatient] = useState({ cedula: '', name: '', phone: '', email: '' });
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const step = !specialty ? 0 : !slot ? 1 : 2;
  const isAnyDoctor = doctor?.id === ANY_DOCTOR.id;
  const windowDays = isAnyDoctor ? ANY_DOCTOR_WINDOW_DAYS : SEARCH_WINDOW_DAYS;

  useEffect(() => {
    requestJson('/api/especialidades')
      .then((data) => setSpecialties((data.especialidades || []).filter((item) => item.medicos?.length)))
      .catch((error) => setCatalogError(error.message))
      .finally(() => setCatalogLoading(false));

    try {
      const saved = window.localStorage.getItem(SAVED_CEDULA_KEY);
      if (saved) {
        setPatient((current) => ({ ...current, cedula: saved }));
      }
    } catch {
      // Ignorado.
    }
  }, []);

  useEffect(() => {
    if (!specialty || !doctor) {
      setAgendaResults([]);
      return undefined;
    }

    let cancelled = false;
    const doctors = isAnyDoctor ? specialty.medicos : [doctor];
    const queue = [...doctors];
    let failures = 0;
    let lastError = '';

    setAgendaLoading(true);
    setAgendaError('');
    setAgendaResults([]);
    setAgendaProgress({ done: 0, total: doctors.length });
    setSlot(null);
    setDateTouched(false);

    // Los resultados se muestran a medida que llega cada agenda.
    const worker = async () => {
      while (queue.length && !cancelled) {
        const item = queue.shift();
        try {
          const data = await requestJson(agendaPath(specialty.id, item.id, rangeStart, windowDays));
          if (!cancelled) setAgendaResults((current) => [...current, { doctor: item, data }]);
        } catch (error) {
          failures += 1;
          lastError = error.message;
        }
        if (!cancelled) setAgendaProgress((current) => ({ ...current, done: current.done + 1 }));
      }
    };

    Promise.all(
      Array.from({ length: Math.min(ANY_DOCTOR_CONCURRENCY, doctors.length) }, () => worker())
    ).then(() => {
      if (cancelled) return;
      if (failures === doctors.length) setAgendaError(lastError);
      setAgendaLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [specialty, doctor, rangeStart]);

  const visibleSpecialties = useMemo(() => {
    const search = specialtySearch
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    return specialties.filter((item) =>
      item.nombre
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .includes(search)
    );
  }, [specialties, specialtySearch]);

  // Combina las agendas: por dia y hora, los medicos libres en el orden del catalogo.
  const availableDays = useMemo(() => {
    const now = bogotaNow();
    const order = new Map((specialty?.medicos || []).map((item, index) => [String(item.id), index]));
    const byDate = new Map();

    for (const { doctor: item, data } of agendaResults) {
      for (const day of data?.disponibilidad || []) {
        for (const hora of day.horarios) {
          if (day.fecha < now.date || (day.fecha === now.date && hora <= now.time)) continue;
          const times = byDate.get(day.fecha) || new Map();
          const options = times.get(hora) || [];
          options.push({ doctor: item, citaTipoId: data.cita_tipo_id, sedeId: data.sede_id });
          times.set(hora, options);
          byDate.set(day.fecha, times);
        }
      }
    }

    return Array.from(byDate.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([fecha, times]) => ({
        fecha,
        horarios: Array.from(times.entries())
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([hora, options]) => ({
            hora,
            options: options.sort(
              (left, right) => order.get(String(left.doctor.id)) - order.get(String(right.doctor.id))
            )
          }))
      }));
  }, [agendaResults, specialty]);

  useEffect(() => {
    // Mientras el paciente no elija un dia, se muestra siempre el primero disponible.
    if (!dateTouched || !availableDays.some((day) => day.fecha === selectedDate)) {
      setSelectedDate(availableDays[0]?.fecha || '');
    }
  }, [availableDays, selectedDate, dateTouched]);

  const selectedDay = availableDays.find((day) => day.fecha === selectedDate);

  function chooseSpecialty(item) {
    setSpecialty(item);
    setDoctor(item.medicos.length === 1 ? item.medicos[0] : ANY_DOCTOR);
    setRangeStart(bogotaNow().date);
    setSlot(null);
    setConfirmation('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetFlow() {
    setSpecialty(null);
    setDoctor(null);
    setSlot(null);
    setBookingError('');
    setConfirmation('');
  }

  async function submitBooking(event) {
    event.preventDefault();
    const cedula = patient.cedula.trim();

    if (!cedula) {
      setBookingError('Ingresa tu número de cédula.');
      return;
    }

    setBooking(true);
    setBookingError('');

    try {
      const data = await requestJson('/preagendamiento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo_documento: 'CC',
          numero_documento: cedula,
          tipo: Number(slot.citaTipoId || 1),
          consultorios_id: Number(slot.sedeId || 1),
          especialidades_id: Number(specialty.id),
          medico_id: Number(slot.doctor.id),
          fecha_estimada: slot.fecha,
          hora_estimada: `${slot.hora}:00`,
          observacion_solicitud: 'Solicitud desde el agendamiento web',
          patientName: patient.name.trim(),
          patientPhone: patient.phone.trim(),
          patientEmail: patient.email.trim()
        })
      });

      try {
        window.localStorage.setItem(SAVED_CEDULA_KEY, cedula);
      } catch {
        // Ignorado.
      }
      setConfirmation(
        data.message ||
          'Tu cita quedó preagendada. Pronto el equipo de Clínica Isis te contactará para confirmarla.'
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (requestError) {
      setBookingError(requestError.message);
    } finally {
      setBooking(false);
    }
  }

  function renderSteps() {
    return (
      <ol className="booking-steps">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={`booking-step ${index === step ? 'booking-step-active' : ''} ${index < step ? 'booking-step-done' : ''}`}
            aria-current={index === step ? 'step' : undefined}
          >
            <span className="booking-step-number">{index < step ? <Icon name="check" /> : index + 1}</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
    );
  }

  function renderSpecialtyStep() {
    return (
      <section className="ui-card">
        <div className="ui-card-header">
          <div>
            <h2>¿Qué especialidad necesitas?</h2>
            <p>Selecciona el servicio para ver médicos y horarios disponibles.</p>
          </div>
        </div>
        <div className="ui-card-body booking-stack">
          <div className="ui-input-icon">
            <Icon name="search" />
            <input
              className="ui-input"
              value={specialtySearch}
              onChange={(event) => setSpecialtySearch(event.target.value)}
              placeholder="Buscar especialidad"
              aria-label="Buscar especialidad"
            />
          </div>

          {catalogLoading ? <div className="ui-progress" /> : null}
          {catalogError ? (
            <p className="ui-alert" role="alert">
              <Icon name="alert" />
              {catalogError}
            </p>
          ) : null}

          {!catalogLoading && !catalogError ? (
            visibleSpecialties.length ? (
              <div className="booking-specialties">
                {visibleSpecialties.map((item) => (
                  <button key={item.id} type="button" className="booking-specialty" onClick={() => chooseSpecialty(item)}>
                    <span>
                      {item.nombre}
                      <small>
                        {item.medicos.length} {item.medicos.length === 1 ? 'profesional' : 'profesionales'}
                      </small>
                    </span>
                    <Icon name="chevronRight" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="ui-empty">
                <Icon name="search" />
                <p>No encontramos especialidades con ese nombre.</p>
              </div>
            )
          ) : null}
        </div>
      </section>
    );
  }

  function renderScheduleStep() {
    const today = bogotaNow().date;
    const rangeEnd = addDays(rangeStart, windowDays - 1);

    return (
      <section className="ui-card">
        <div className="ui-card-header">
          <div>
            <h2>{specialty.nombre}</h2>
            <p>Elige un horario disponible. Si no tienes preferencia, te mostramos el de todos los profesionales.</p>
          </div>
          <button type="button" className="ui-btn ui-btn-sm ui-btn-ghost" onClick={resetFlow}>
            <Icon name="arrowLeft" />
            Cambiar
          </button>
        </div>
        <div className="ui-card-body booking-stack">
          <div>
            <p className="booking-group-title">Profesional</p>
            <div className="booking-doctors" role="radiogroup" aria-label="Profesional">
              {specialty.medicos.length > 1 ? (
                <label className={`ui-chip-option ${isAnyDoctor ? 'ui-chip-option-active' : ''}`}>
                  <input
                    type="radio"
                    name="doctor"
                    checked={isAnyDoctor}
                    onChange={() => setDoctor(ANY_DOCTOR)}
                  />
                  Cualquier profesional
                </label>
              ) : null}
              {specialty.medicos.map((item) => (
                <label
                  key={item.id}
                  className={`ui-chip-option ${doctor?.id === item.id ? 'ui-chip-option-active' : ''}`}
                >
                  <input
                    type="radio"
                    name="doctor"
                    checked={doctor?.id === item.id}
                    onChange={() => setDoctor(item)}
                  />
                  {doctorName(item)}
                </label>
              ))}
            </div>
          </div>

          {doctor ? (
            <div>
              <div className="booking-toolbar">
                <p className="booking-group-title" style={{ margin: 0 }}>
                  Horarios del {formatDay(rangeStart, { day: 'numeric', month: 'short' })} al{' '}
                  {formatDay(rangeEnd, { day: 'numeric', month: 'short' })}
                </p>
                <div className="booking-doctors">
                  <button
                    type="button"
                    className="ui-btn ui-btn-sm ui-btn-secondary"
                    disabled={rangeStart <= today || agendaLoading}
                    onClick={() => setRangeStart((current) => {
                      const previous = addDays(current, -windowDays);
                      return previous < today ? today : previous;
                    })}
                  >
                    <Icon name="arrowLeft" />
                    Anteriores
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn-sm ui-btn-secondary"
                    disabled={agendaLoading}
                    onClick={() => setRangeStart((current) => addDays(current, windowDays))}
                  >
                    Siguientes
                    <Icon name="arrowRight" />
                  </button>
                </div>
              </div>

              {agendaLoading ? (
                <div className="booking-stack booking-agenda-loading">
                  <div className="ui-progress" />
                  <p className="ui-hint">
                    {isAnyDoctor
                      ? `Consultando agendas (${agendaProgress.done} de ${agendaProgress.total} profesionales)...`
                      : `Consultando la agenda de ${doctorName(doctor)}...`}
                  </p>
                </div>
              ) : null}

              {agendaError ? (
                <p className="ui-alert" role="alert">
                  <Icon name="alert" />
                  {agendaError}
                </p>
              ) : availableDays.length ? (
                <div className="booking-days">
                  <div className="booking-date-strip" role="tablist" aria-label="Días disponibles">
                    {availableDays.map((day) => (
                      <button
                        key={day.fecha}
                        type="button"
                        role="tab"
                        aria-selected={day.fecha === selectedDate}
                        className={`booking-date ${day.fecha === selectedDate ? 'booking-date-active' : ''}`}
                        onClick={() => {
                          setSelectedDate(day.fecha);
                          setDateTouched(true);
                        }}
                      >
                        <small>{formatDay(day.fecha, { weekday: 'short' })}</small>
                        <strong>{formatDay(day.fecha, { day: 'numeric' })}</strong>
                        <small>{formatDay(day.fecha, { month: 'short' })}</small>
                      </button>
                    ))}
                  </div>

                  {selectedDay ? (
                    <div className="booking-day">
                      <h4>
                        {formatDay(selectedDay.fecha)} · {selectedDay.horarios.length}{' '}
                        {selectedDay.horarios.length === 1 ? 'horario' : 'horarios'}
                      </h4>
                      <div className={`booking-times ${isAnyDoctor ? 'booking-times-detailed' : ''}`}>
                        {selectedDay.horarios.map(({ hora, options }) => (
                          <button
                            key={hora}
                            type="button"
                            className={`booking-time ${isAnyDoctor ? 'booking-time-detailed' : ''}`}
                            onClick={() => setSlot({ fecha: selectedDay.fecha, hora, ...options[0] })}
                          >
                            {formatTime(hora)}
                            {isAnyDoctor ? (
                              <small>
                                {options.length === 1
                                  ? shortDoctorName(options[0].doctor)
                                  : `${options.length} profesionales`}
                              </small>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : !agendaLoading ? (
                <div className="ui-empty">
                  <Icon name="calendar" />
                  <strong>Sin horarios en estas fechas</strong>
                  <p>
                    {isAnyDoctor
                      ? 'Prueba con las siguientes fechas.'
                      : 'Prueba con las siguientes fechas o elige otro profesional.'}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="ui-hint">Selecciona un profesional para ver su agenda.</p>
          )}
        </div>
      </section>
    );
  }

  function renderDetailsStep() {
    return (
      <form className="ui-card" onSubmit={submitBooking}>
        <div className="ui-card-header">
          <div>
            <h2>Tus datos</h2>
            <p>Los usamos para contactarte y confirmar la cita.</p>
          </div>
          <button type="button" className="ui-btn ui-btn-sm ui-btn-ghost" onClick={() => setSlot(null)}>
            <Icon name="arrowLeft" />
            Cambiar horario
          </button>
        </div>
        <div className="ui-card-body booking-stack">
          <div className="ui-field">
            <label htmlFor="booking-cedula">Cédula *</label>
            <input
              id="booking-cedula"
              className="ui-input"
              inputMode="numeric"
              required
              value={patient.cedula}
              onChange={(event) => setPatient((current) => ({ ...current, cedula: event.target.value }))}
            />
          </div>
          <div className="ui-field">
            <label htmlFor="booking-name">Nombre completo</label>
            <input
              id="booking-name"
              className="ui-input"
              autoComplete="name"
              value={patient.name}
              onChange={(event) => setPatient((current) => ({ ...current, name: event.target.value }))}
            />
          </div>
          <div className="booking-specialties" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div className="ui-field">
              <label htmlFor="booking-phone">Celular</label>
              <input
                id="booking-phone"
                className="ui-input"
                inputMode="tel"
                autoComplete="tel"
                value={patient.phone}
                onChange={(event) => setPatient((current) => ({ ...current, phone: event.target.value }))}
              />
            </div>
            <div className="ui-field">
              <label htmlFor="booking-email">Correo</label>
              <input
                id="booking-email"
                className="ui-input"
                type="email"
                autoComplete="email"
                value={patient.email}
                onChange={(event) => setPatient((current) => ({ ...current, email: event.target.value }))}
              />
            </div>
          </div>

          {bookingError ? (
            <p className="ui-alert" role="alert">
              <Icon name="alert" />
              {bookingError}
            </p>
          ) : null}

          <button type="submit" className="ui-btn ui-btn-lg ui-btn-block" disabled={booking}>
            {booking ? 'Enviando solicitud...' : 'Solicitar cita'}
          </button>
          <p className="ui-hint">
            La cita queda preagendada. El equipo de Clínica Isis te contactará para confirmarla.
          </p>
        </div>
      </form>
    );
  }

  function renderSummary() {
    if (!specialty) {
      return null;
    }

    return (
      <section className="ui-card">
        <div className="ui-card-header">
          <h2>Resumen</h2>
        </div>
        <dl className="ui-card-body booking-summary">
          <div>
            <dt>Especialidad</dt>
            <dd>{specialty.nombre}</dd>
          </div>
          <div>
            <dt>Profesional</dt>
            <dd>
              {slot ? doctorName(slot.doctor) : isAnyDoctor ? 'Cualquier profesional' : doctor ? doctorName(doctor) : 'Por elegir'}
            </dd>
          </div>
          <div>
            <dt>Fecha y hora</dt>
            <dd>{slot ? `${formatDay(slot.fecha)}, ${formatTime(slot.hora)}` : 'Por elegir'}</dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <SiteLayout title="Agendar cita">
      <div className="site-container">
        <div className="booking-head">
          <h1>Agenda tu cita</h1>
          <p>Elige la especialidad, el profesional y el horario que mejor te quede. Sin llamadas ni filas.</p>
        </div>

        <div className="booking-layout">
          <div>
            {confirmation ? (
              <section className="ui-card booking-success">
                <span className="booking-success-icon">
                  <Icon name="check" />
                </span>
                <h2>¡Solicitud enviada!</h2>
                <p>{confirmation}</p>
                {slot ? (
                  <p>
                    <strong>
                      {specialty.nombre} · {doctorName(slot.doctor)} · {formatDay(slot.fecha)}, {formatTime(slot.hora)}
                    </strong>
                  </p>
                ) : null}
                <button type="button" className="ui-btn ui-btn-secondary" onClick={resetFlow}>
                  Agendar otra cita
                </button>
              </section>
            ) : (
              <>
                {renderSteps()}
                {step === 0 ? renderSpecialtyStep() : null}
                {step === 1 ? renderScheduleStep() : null}
                {step === 2 ? renderDetailsStep() : null}
              </>
            )}
          </div>

          <aside className="booking-aside">
            {!confirmation ? renderSummary() : null}
            {/* Se vuelve a montar tras una solicitud para mostrar la cita nueva. */}
            <MyAppointments key={confirmation ? 'after-booking' : 'initial'} />
          </aside>
        </div>
      </div>
    </SiteLayout>
  );
}
