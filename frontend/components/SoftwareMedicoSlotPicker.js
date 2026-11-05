import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';

const WINDOW_DAYS = 14;

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_APPOINTMENTS_ADMIN_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;
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

function formatDay(date, options) {
  return new Intl.DateTimeFormat('es-CO', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

export function formatPickerTime(time) {
  const [hours = '00', minutes = '00'] = String(time || '').split(':');
  return new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(2000, 0, 1, Number(hours), Number(minutes))));
}

export function formatPickerDay(date) {
  return formatDay(date, { weekday: 'long', day: 'numeric', month: 'long' });
}

function doctorName(doctor) {
  return [doctor?.first_name, doctor?.last_name].filter(Boolean).join(' ').trim() || `Médico ${doctor?.id || ''}`;
}

/**
 * Selector de horario sobre la agenda real de Software Medico (/api/agenda/disponible).
 * Devuelve por onChange { especialidadId, medicoId, doctorName, fecha, hora, tipo, sedeId } o null.
 */
export default function SoftwareMedicoSlotPicker({ specialtyId, doctors, initialDoctorId, value, onChange, idPrefix }) {
  const [doctorId, setDoctorId] = useState(() =>
    doctors.some((doctor) => String(doctor.id) === String(initialDoctorId))
      ? String(initialDoctorId)
      : doctors.length === 1
        ? String(doctors[0].id)
        : ''
  );
  const [rangeStart, setRangeStart] = useState(() => bogotaNow().date);
  const [agenda, setAgenda] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  useEffect(() => {
    onChange(null);
    if (!specialtyId || !doctorId) {
      setAgenda(null);
      return undefined;
    }

    let cancelled = false;
    const params = new URLSearchParams({
      especialidadId: specialtyId,
      medicoId: doctorId,
      fechaInicio: rangeStart,
      fechaFin: addDays(rangeStart, WINDOW_DAYS - 1)
    });

    setLoading(true);
    setError('');
    fetch(`${getApiBaseUrl()}/api/agenda/disponible?${params.toString()}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.message || 'No fue posible consultar la agenda de Software Médico.');
        }
        if (!cancelled) setAgenda(payload);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setAgenda(null);
          setError(requestError.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // onChange se omite a proposito: solo se limpia la seleccion cuando cambia la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialtyId, doctorId, rangeStart]);

  const days = useMemo(() => {
    const now = bogotaNow();
    return (agenda?.disponibilidad || [])
      .map((day) => ({
        ...day,
        horarios: day.horarios.filter((hora) => day.fecha > now.date || (day.fecha === now.date && hora > now.time))
      }))
      .filter((day) => day.horarios.length);
  }, [agenda]);

  useEffect(() => {
    if (!days.some((day) => day.fecha === selectedDate)) {
      setSelectedDate(days[0]?.fecha || '');
    }
  }, [days, selectedDate]);

  const today = bogotaNow().date;
  const selectedDay = days.find((day) => day.fecha === selectedDate);
  const doctor = doctors.find((item) => String(item.id) === doctorId);

  if (!doctors.length) {
    return <p className="ui-hint">Esta especialidad no tiene médicos activos en Agenda activa.</p>;
  }

  return (
    <div className="admin-form">
      <div className="ui-field">
        <label htmlFor={`${idPrefix}-doctor`}>Profesional</label>
        <select
          id={`${idPrefix}-doctor`}
          className="ui-select"
          value={doctorId}
          onChange={(event) => setDoctorId(event.target.value)}
        >
          <option value="">Selecciona un profesional</option>
          {doctors.map((item) => (
            <option key={item.id} value={String(item.id)}>
              {doctorName(item)}
            </option>
          ))}
        </select>
      </div>

      {doctorId ? (
        <div className="admin-form">
          <div className="booking-toolbar" style={{ marginBottom: 0 }}>
            <span className="ui-hint">
              Del {formatDay(rangeStart, { day: 'numeric', month: 'short' })} al{' '}
              {formatDay(addDays(rangeStart, WINDOW_DAYS - 1), { day: 'numeric', month: 'short' })}
            </span>
            <div className="admin-toolbar-actions">
              <button
                type="button"
                className="ui-btn ui-btn-sm ui-btn-secondary"
                disabled={rangeStart <= today || loading}
                onClick={() =>
                  setRangeStart((current) => {
                    const previous = addDays(current, -WINDOW_DAYS);
                    return previous < today ? today : previous;
                  })
                }
              >
                <Icon name="arrowLeft" />
                Anteriores
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-sm ui-btn-secondary"
                disabled={loading}
                onClick={() => setRangeStart((current) => addDays(current, WINDOW_DAYS))}
              >
                Siguientes
                <Icon name="arrowRight" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="ui-progress" />
          ) : error ? (
            <p className="ui-alert" role="alert">
              <Icon name="alert" />
              {error}
            </p>
          ) : days.length ? (
            <>
              <div className="booking-date-strip" role="tablist" aria-label="Días disponibles">
                {days.map((day) => (
                  <button
                    key={day.fecha}
                    type="button"
                    role="tab"
                    aria-selected={day.fecha === selectedDate}
                    className={`booking-date ${day.fecha === selectedDate ? 'booking-date-active' : ''}`}
                    onClick={() => setSelectedDate(day.fecha)}
                  >
                    <small>{formatDay(day.fecha, { weekday: 'short' })}</small>
                    <strong>{formatDay(day.fecha, { day: 'numeric' })}</strong>
                    <small>{formatDay(day.fecha, { month: 'short' })}</small>
                  </button>
                ))}
              </div>
              {selectedDay ? (
                <div className="booking-times">
                  {selectedDay.horarios.map((hora) => {
                    const active = value?.fecha === selectedDay.fecha && value?.hora === hora;
                    return (
                      <button
                        key={hora}
                        type="button"
                        className={`booking-time ${active ? 'booking-time-active' : ''}`}
                        aria-pressed={active}
                        onClick={() =>
                          onChange({
                            especialidadId: String(specialtyId),
                            medicoId: doctorId,
                            doctorName: doctorName(doctor),
                            fecha: selectedDay.fecha,
                            hora,
                            tipo: agenda?.cita_tipo_id,
                            sedeId: agenda?.sede_id
                          })
                        }
                      >
                        {formatPickerTime(hora)}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : (
            <p className="ui-hint">No hay horarios disponibles en estas fechas. Prueba con las siguientes.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
