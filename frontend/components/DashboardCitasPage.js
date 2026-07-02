import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

const DEFAULT_MONTH =
  process.env.NEXT_PUBLIC_DEFAULT_APPOINTMENTS_MONTH ||
  new Date().toISOString().slice(0, 7);

const NAV_ITEMS = [
  { id: 'confirmaciones', label: 'Confirmar citas', description: 'Revisa, contacta y asigna horarios.' },
  { id: 'precios', label: 'Asignar precios', description: 'Define valores por especialidad.' },
  { id: 'alertas', label: 'Enviar alertas', description: 'Gestiona campanas push para pacientes.' },
  { id: 'agenda', label: 'Cargar agenda', description: 'Importa el archivo del mes y valida el resumen.' },
  { id: 'configuracion', label: 'Configuracion', description: 'Ajusta tiempos y notificaciones internas.' }
];

function getApiBaseUrl() {
  const baseUrl =
    process.env.NEXT_PUBLIC_APPOINTMENTS_ADMIN_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!baseUrl) {
    throw new Error('Falta NEXT_PUBLIC_API_BASE_URL en el frontend.');
  }

  return baseUrl;
}

function formatMoney(value, currency) {
  const numericValue = Number(value || 0);

  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currency || 'COP',
    maximumFractionDigits: 0
  }).format(numericValue);
}

function formatMonthLabel(month) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return 'agenda del mes seleccionado';
  }

  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  const label = new Intl.DateTimeFormat('es-CO', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);

  return `agenda de ${label}`;
}

function formatDateTimeLabel(date, startTime) {
  if (!date || !startTime) {
    return 'Horario pendiente';
  }

  const formattedDate = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${date}T00:00:00Z`));

  const [hours = '00', minutes = '00'] = String(startTime).split(':');
  const timeDate = new Date(Date.UTC(2000, 0, 1, Number(hours), Number(minutes)));
  const formattedTime = new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC'
  }).format(timeDate);

  return `${formattedDate}, ${formattedTime}`;
}

function buildSpecialties(dashboard) {
  return Array.isArray(dashboard?.specialties) ? dashboard.specialties : [];
}

export default function DashboardCitasPage({ homeHref = '/', showHomeLink = true }) {
  const [month, setMonth] = useState(DEFAULT_MONTH);
  const [activeSection, setActiveSection] = useState('confirmaciones');
  const [dashboard, setDashboard] = useState(null);
  const [settings, setSettings] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [campaign, setCampaign] = useState({
    title: '',
    message: '',
    type: 'agenda'
  });
  const [selectedSpecialtyKey, setSelectedSpecialtyKey] = useState('');
  const [pricingForm, setPricingForm] = useState({
    specialty: '',
    specialtyKey: '',
    appointmentCost: '',
    appointmentCurrency: 'COP'
  });
  const [settingsForm, setSettingsForm] = useState({
    appointmentCost: '',
    appointmentCurrency: 'COP',
    slotMinutes: 30,
    notificationEmail: 'notificacionesapp@clinicaisis.com',
    notificationsTopic: 'all_users'
  });
  const [slotFilters, setSlotFilters] = useState({
    specialtyKey: '',
    date: ''
  });
  const [assignForm, setAssignForm] = useState({
    slotId: '',
    cedula: '',
    patientName: '',
    patientEmail: '',
    patientPhone: ''
  });
  const [agendaFile, setAgendaFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [uploadingAgenda, setUploadingAgenda] = useState(false);
  const [submittingAssignment, setSubmittingAssignment] = useState(false);
  const [reviewingId, setReviewingId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const specialties = useMemo(() => buildSpecialties(dashboard), [dashboard]);
  const monthLabel = useMemo(() => formatMonthLabel(month), [month]);
  const pendingAppointments = dashboard?.pending?.appointments || [];
  const summary = dashboard?.summary;
  const imports = dashboard?.imports || [];

  useEffect(() => {
    loadAll(month);
  }, [month]);

  useEffect(() => {
    if (!specialties.length) {
      setSelectedSpecialtyKey('');
      setSlotFilters((current) => ({ ...current, specialtyKey: '' }));
      return;
    }

    if (!specialties.some((item) => item.specialtyKey === selectedSpecialtyKey)) {
      setSelectedSpecialtyKey(specialties[0].specialtyKey);
    }

    if (!specialties.some((item) => item.specialtyKey === slotFilters.specialtyKey)) {
      setSlotFilters((current) => ({ ...current, specialtyKey: specialties[0].specialtyKey }));
    }
  }, [specialties, selectedSpecialtyKey, slotFilters.specialtyKey]);

  useEffect(() => {
    if (!specialties.length) {
      setPricingForm((current) => ({
        ...current,
        specialty: '',
        specialtyKey: '',
        appointmentCost: settings?.appointmentCost ?? '',
        appointmentCurrency: settings?.appointmentCurrency || 'COP'
      }));
      return;
    }

    const selected = specialties.find((item) => item.specialtyKey === selectedSpecialtyKey) || specialties[0];
    setPricingForm({
      specialty: selected.specialty,
      specialtyKey: selected.specialtyKey,
      appointmentCost: selected.appointmentCost ?? '',
      appointmentCurrency: selected.appointmentCurrency || settings?.appointmentCurrency || 'COP'
    });
  }, [selectedSpecialtyKey, specialties, settings]);

  useEffect(() => {
    if (activeSection !== 'confirmaciones' || !specialties.length) {
      return;
    }

    loadAvailableSlots();
  }, [activeSection, month, slotFilters.specialtyKey, slotFilters.date, specialties]);

  async function loadAll(targetMonth) {
    setLoading(true);
    setError('');

    try {
      const [dashboardResponse, settingsResponse] = await Promise.all([
        fetch(`${getApiBaseUrl()}/admin/agenda/dashboard?month=${encodeURIComponent(targetMonth)}`),
        fetch(`${getApiBaseUrl()}/admin/settings/appointments`)
      ]);

      const dashboardData = await dashboardResponse.json();
      const settingsData = await settingsResponse.json();

      if (!dashboardResponse.ok) {
        throw new Error(dashboardData.message || 'No fue posible cargar el dashboard.');
      }

      if (!settingsResponse.ok) {
        throw new Error(settingsData.message || 'No fue posible cargar la configuracion.');
      }

      setDashboard(dashboardData);
      setSettings(settingsData);
      setSettingsForm({
        appointmentCost: settingsData.appointmentCost ?? '',
        appointmentCurrency: settingsData.appointmentCurrency || 'COP',
        slotMinutes: settingsData.slotMinutes ?? 30,
        notificationEmail: settingsData.notificationEmail || 'notificacionesapp@clinicaisis.com',
        notificationsTopic: settingsData.notificationsTopic || 'all_users'
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadAvailableSlots() {
    setLoadingSlots(true);
    setError('');

    try {
      const selectedSpecialty = specialties.find((item) => item.specialtyKey === slotFilters.specialtyKey);
      const params = new URLSearchParams({ month });

      if (selectedSpecialty?.specialty) {
        params.set('specialty', selectedSpecialty.specialty);
      }

      if (slotFilters.date) {
        params.set('date', slotFilters.date);
      }

      const response = await fetch(`${getApiBaseUrl()}/appointments/availability?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No fue posible consultar la agenda disponible.');
      }

      setAvailableSlots((data.slots || []).slice(0, 18));
    } catch (requestError) {
      setAvailableSlots([]);
      setError(requestError.message);
    } finally {
      setLoadingSlots(false);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSavingSettings(true);
    setFeedback('');
    setError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/settings/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          appointmentCost: Number(settingsForm.appointmentCost),
          appointmentCurrency: settingsForm.appointmentCurrency,
          slotMinutes: Number(settingsForm.slotMinutes),
          notificationEmail: settingsForm.notificationEmail,
          notificationsTopic: settingsForm.notificationsTopic,
          pricingBySpecialty: settings?.pricingBySpecialty || {}
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No fue posible guardar la configuracion.');
      }

      setSettings(data.settings);
      setFeedback(data.message || 'Configuracion actualizada.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingSettings(false);
    }
  }

  async function updateMonthPricing(event) {
    event.preventDefault();
    setSavingPricing(true);
    setFeedback('');
    setError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/agenda/pricing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          month,
          specialty: pricingForm.specialty,
          specialtyKey: pricingForm.specialtyKey,
          appointmentCost: Number(pricingForm.appointmentCost),
          appointmentCurrency: pricingForm.appointmentCurrency
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No fue posible actualizar los precios de la agenda.');
      }

      setFeedback(
        `${data.message} ${pricingForm.specialty || 'Especialidad'}: ${data.result?.updated ?? 0} horarios actualizados.`
      );
      await loadAll(month);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingPricing(false);
    }
  }

  async function sendCampaign(event) {
    event.preventDefault();
    setSendingCampaign(true);
    setFeedback('');
    setError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(campaign)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No fue posible enviar la campana.');
      }

      setFeedback(data.message || 'Campana enviada correctamente.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSendingCampaign(false);
    }
  }

  async function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('No fue posible leer el archivo.'));
      reader.readAsDataURL(file);
    });
  }

  async function uploadAgenda(event) {
    event.preventDefault();
    if (!agendaFile) {
      setError('Selecciona un archivo Excel para importar.');
      return;
    }

    setUploadingAgenda(true);
    setFeedback('');
    setError('');

    try {
      const fileBase64 = await readFileAsBase64(agendaFile);
      const response = await fetch(`${getApiBaseUrl()}/admin/agenda/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          month,
          fileName: agendaFile.name,
          fileBase64
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No fue posible importar la agenda.');
      }

      setFeedback(data.message || 'Agenda importada correctamente.');
      setAgendaFile(null);
      await loadAll(month);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUploadingAgenda(false);
    }
  }

  async function reviewAppointment(appointmentId, decision) {
    setReviewingId(`${appointmentId}:${decision}`);
    setFeedback('');
    setError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/appointments/${appointmentId}/review`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          decision,
          reviewedBy: 'dashboard'
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No fue posible procesar la cita.');
      }

      setFeedback(data.message || 'Cita procesada correctamente.');
      await loadAll(month);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setReviewingId('');
    }
  }

  async function assignAppointmentFromAdmin(event) {
    event.preventDefault();
    setSubmittingAssignment(true);
    setFeedback('');
    setError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/appointments/book`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(assignForm)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No fue posible preagendar la cita desde el admin.');
      }

      const emailNote = data.notificationEmailStatus?.skipped
        ? ` Correo interno pendiente: ${data.notificationEmailStatus.reason || 'sin detalle'}.`
        : ' Correo interno enviado al equipo de seguimiento.';

      setFeedback(`${data.message || 'Cita preagendada correctamente.'}${emailNote}`);
      setAssignForm({
        slotId: '',
        cedula: '',
        patientName: '',
        patientEmail: '',
        patientPhone: ''
      });
      await Promise.all([loadAll(month), loadAvailableSlots()]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmittingAssignment(false);
    }
  }

  function renderConfirmaciones() {
    return (
      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Seguimiento operativo</p>
            <h2>Confirmar citas preagendadas</h2>
          </div>
          <p className="section-copy">
            Revisa las solicitudes nuevas, visualiza mejor los datos del paciente y asigna horarios disponibles sin salir del admin.
          </p>
        </div>

        <div className="dashboard-ops-layout">
          <section className="appointments-panel dashboard-panel-soft">
            <div className="panel-title-row">
              <h3>Solicitudes pendientes</h3>
              <span className="panel-counter">{pendingAppointments.length} por revisar</span>
            </div>

            <div className="appointments-list">
              {pendingAppointments.length ? (
                pendingAppointments.map((appointment) => (
                  <article key={appointment.appointmentId} className="appointment-item enhanced-appointment-card">
                    <div className="appointment-item-head">
                      <div>
                        <p className="status-label appointment-specialty-label">{appointment.specialty}</p>
                        <strong>{appointment.patientName || 'Paciente sin nombre registrado'}</strong>
                        <span>{appointment.specialist}</span>
                      </div>
                      <span className="status-chip status-chip-warn">Preagendada</span>
                    </div>

                    <div className="appointment-data-grid">
                      <div className="appointment-data-block">
                        <p>Horario</p>
                        <strong>{formatDateTimeLabel(appointment.date, appointment.startTime)}</strong>
                      </div>
                      <div className="appointment-data-block">
                        <p>Tipo</p>
                        <strong>{appointment.sessionType || 'Consulta'}</strong>
                      </div>
                      <div className="appointment-data-block">
                        <p>Cedula</p>
                        <strong>{appointment.cedula || 'Sin dato'}</strong>
                      </div>
                      <div className="appointment-data-block">
                        <p>Valor</p>
                        <strong>{formatMoney(appointment.appointmentCost, appointment.appointmentCurrency)}</strong>
                      </div>
                      <div className="appointment-data-block">
                        <p>Telefono</p>
                        <strong>{appointment.patientPhone || 'Sin telefono'}</strong>
                      </div>
                      <div className="appointment-data-block">
                        <p>Correo</p>
                        <strong>{appointment.patientEmail || 'Sin correo'}</strong>
                      </div>
                    </div>

                    <div className="slot-actions">
                      <button
                        type="button"
                        onClick={() => reviewAppointment(appointment.appointmentId, 'approved')}
                        disabled={reviewingId === `${appointment.appointmentId}:approved`}
                      >
                        {reviewingId === `${appointment.appointmentId}:approved` ? 'Procesando...' : 'Confirmar cita'}
                      </button>
                      <button
                        type="button"
                        className="secondary-button danger-button"
                        onClick={() => reviewAppointment(appointment.appointmentId, 'rejected')}
                        disabled={reviewingId === `${appointment.appointmentId}:rejected`}
                      >
                        {reviewingId === `${appointment.appointmentId}:rejected` ? 'Procesando...' : 'Rechazar'}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="empty-state">No hay citas preagendadas pendientes para esta agenda.</p>
              )}
            </div>
          </section>

          <section className="appointments-panel dashboard-panel-soft">
            <div className="panel-title-row">
              <h3>Asignar desde agenda disponible</h3>
              <span className="panel-counter">{availableSlots.length} opciones visibles</span>
            </div>

            <form className="filters-form dashboard-inline-filters" onSubmit={(event) => event.preventDefault()}>
              <div>
                <label htmlFor="slot-specialty-filter">Especialidad</label>
                <select
                  id="slot-specialty-filter"
                  value={slotFilters.specialtyKey}
                  onChange={(event) =>
                    setSlotFilters((current) => ({ ...current, specialtyKey: event.target.value }))
                  }
                >
                  {specialties.map((item) => (
                    <option key={item.specialtyKey} value={item.specialtyKey}>
                      {item.specialty}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="slot-date-filter">Fecha</label>
                <input
                  id="slot-date-filter"
                  type="date"
                  value={slotFilters.date}
                  onChange={(event) =>
                    setSlotFilters((current) => ({ ...current, date: event.target.value }))
                  }
                />
              </div>

              <button type="button" className="secondary-button" onClick={loadAvailableSlots} disabled={loadingSlots}>
                {loadingSlots ? 'Consultando...' : 'Actualizar opciones'}
              </button>
            </form>

            <div className="available-slots-panel">
              <div className="available-slots-list">
                {availableSlots.length ? (
                  availableSlots.map((slot) => (
                    <button
                      key={slot.slotId}
                      type="button"
                      className={`available-slot-card ${assignForm.slotId === slot.slotId ? 'available-slot-card-active' : ''}`}
                      onClick={() => setAssignForm((current) => ({ ...current, slotId: slot.slotId }))}
                    >
                      <strong>{slot.specialist}</strong>
                      <span>{slot.specialty}</span>
                      <span>{formatDateTimeLabel(slot.date, slot.startTime)}</span>
                      <small>
                        {slot.sessionType || 'Consulta'} · {formatMoney(slot.appointmentCost, slot.appointmentCurrency)}
                      </small>
                    </button>
                  ))
                ) : (
                  <p className="empty-state">No hay horarios visibles con esos filtros.</p>
                )}
              </div>

              <form className="filters-form assignment-form" onSubmit={assignAppointmentFromAdmin}>
                <h4>Datos del paciente</h4>

                <label htmlFor="assign-slot-id">Horario seleccionado</label>
                <input
                  id="assign-slot-id"
                  value={assignForm.slotId}
                  onChange={(event) =>
                    setAssignForm((current) => ({ ...current, slotId: event.target.value }))
                  }
                  placeholder="Selecciona una opcion de agenda"
                />

                <label htmlFor="assign-cedula">Cedula</label>
                <input
                  id="assign-cedula"
                  value={assignForm.cedula}
                  onChange={(event) =>
                    setAssignForm((current) => ({ ...current, cedula: event.target.value }))
                  }
                />

                <label htmlFor="assign-name">Nombre completo</label>
                <input
                  id="assign-name"
                  value={assignForm.patientName}
                  onChange={(event) =>
                    setAssignForm((current) => ({ ...current, patientName: event.target.value }))
                  }
                />

                <label htmlFor="assign-email">Correo</label>
                <input
                  id="assign-email"
                  type="email"
                  value={assignForm.patientEmail}
                  onChange={(event) =>
                    setAssignForm((current) => ({ ...current, patientEmail: event.target.value }))
                  }
                />

                <label htmlFor="assign-phone">Telefono</label>
                <input
                  id="assign-phone"
                  value={assignForm.patientPhone}
                  onChange={(event) =>
                    setAssignForm((current) => ({ ...current, patientPhone: event.target.value }))
                  }
                />

                <button type="submit" disabled={submittingAssignment}>
                  {submittingAssignment ? 'Asignando...' : 'Preagendar desde admin'}
                </button>
              </form>
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderPrecios() {
    return (
      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Parametrizacion comercial</p>
            <h2>Asignar precios por tipo de cita</h2>
          </div>
          <p className="section-copy">
            Selecciona una especialidad cargada en la agenda y define su valor. Cada precio se aplica solo a ese servicio.
          </p>
        </div>

        <div className="dashboard-pricing-layout">
          <section className="appointments-panel dashboard-panel-soft">
            <h3>Precio por especialidad</h3>
            {specialties.length ? (
              <form className="filters-form" onSubmit={updateMonthPricing}>
                <label htmlFor="pricing-specialty">Tipo de cita o especialidad</label>
                <select
                  id="pricing-specialty"
                  value={selectedSpecialtyKey}
                  onChange={(event) => setSelectedSpecialtyKey(event.target.value)}
                >
                  {specialties.map((item) => (
                    <option key={item.specialtyKey} value={item.specialtyKey}>
                      {item.specialty}
                    </option>
                  ))}
                </select>

                <label htmlFor="pricing-cost">Precio para esta especialidad</label>
                <input
                  id="pricing-cost"
                  inputMode="numeric"
                  value={pricingForm.appointmentCost}
                  onChange={(event) =>
                    setPricingForm((current) => ({ ...current, appointmentCost: event.target.value }))
                  }
                />

                <label htmlFor="pricing-currency">Moneda</label>
                <input
                  id="pricing-currency"
                  value={pricingForm.appointmentCurrency}
                  onChange={(event) =>
                    setPricingForm((current) => ({ ...current, appointmentCurrency: event.target.value }))
                  }
                />

                <button type="submit" disabled={savingPricing}>
                  {savingPricing ? 'Actualizando...' : 'Guardar precio para la especialidad'}
                </button>
              </form>
            ) : (
              <p className="empty-state">
                Primero carga la agenda del mes para listar las especialidades disponibles y asignar precios.
              </p>
            )}
          </section>

          <section className="appointments-panel dashboard-panel-soft">
            <h3>Resumen de valores cargados</h3>
            <div className="pricing-summary-board">
              {specialties.length ? (
                specialties.map((item) => (
                  <article key={item.specialtyKey} className="pricing-summary-row">
                    <div className="pricing-summary-main">
                      <p className="status-label">{item.specialty}</p>
                      <strong>{formatMoney(item.appointmentCost, item.appointmentCurrency)}</strong>
                    </div>
                    <div className="pricing-summary-metrics">
                      <span>Agenda: {item.total}</span>
                      <span>Disponibles: {item.byStatus?.available || 0}</span>
                      <span>Preagendadas: {item.byStatus?.prebooked || 0}</span>
                      <span>Confirmadas: {item.byStatus?.booked || 0}</span>
                    </div>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setSelectedSpecialtyKey(item.specialtyKey)}
                    >
                      Editar precio
                    </button>
                  </article>
                ))
              ) : (
                <p className="empty-state">Aun no hay especialidades disponibles para esta agenda.</p>
              )}
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderAlertas() {
    return (
      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Comunicacion</p>
            <h2>Enviar alertas y recordatorios</h2>
          </div>
          <p className="section-copy">
            Usa este espacio para campanas de apertura de agenda, recordatorios o novedades para pacientes.
          </p>
        </div>
        <section className="appointments-panel dashboard-panel-soft">
          <form className="filters-form" onSubmit={sendCampaign}>
            <label htmlFor="campaign-title">Titulo</label>
            <input
              id="campaign-title"
              value={campaign.title}
              onChange={(event) => setCampaign((current) => ({ ...current, title: event.target.value }))}
            />

            <label htmlFor="campaign-message">Mensaje</label>
            <textarea
              id="campaign-message"
              value={campaign.message}
              onChange={(event) => setCampaign((current) => ({ ...current, message: event.target.value }))}
            />

            <label htmlFor="campaign-type">Tipo de envio</label>
            <select
              id="campaign-type"
              value={campaign.type}
              onChange={(event) => setCampaign((current) => ({ ...current, type: event.target.value }))}
            >
              <option value="agenda">Agenda / citas</option>
              <option value="benefits">Beneficios del paciente</option>
              <option value="pedometer">Podometro</option>
              <option value="general">General / blogs</option>
            </select>

            <button type="submit" disabled={sendingCampaign}>
              {sendingCampaign ? 'Enviando...' : 'Enviar alerta'}
            </button>
          </form>
        </section>
      </section>
    );
  }

  function renderAgenda() {
    return (
      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Carga operativa</p>
            <h2>Cargar agenda del mes</h2>
          </div>
          <p className="section-copy">
            Importa el archivo mensual y revisa de inmediato las ultimas cargas para validar que todo quedo correcto.
          </p>
        </div>
        <div className="dashboard-pricing-layout">
          <section className="appointments-panel dashboard-panel-soft">
            <form className="filters-form" onSubmit={uploadAgenda}>
              <label htmlFor="agenda-file">Excel o base de datos mensual</label>
              <input
                id="agenda-file"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => setAgendaFile(event.target.files?.[0] || null)}
              />

              <button type="submit" disabled={uploadingAgenda}>
                {uploadingAgenda ? 'Importando...' : 'Cargar agenda del mes'}
              </button>
            </form>
          </section>

          <section className="appointments-panel dashboard-panel-soft">
            <h3>Ultimas importaciones</h3>
            <div className="appointments-list">
              {imports.length ? (
                imports.map((item) => (
                  <article key={item.importId} className="appointment-item">
                    <strong>{item.fileName}</strong>
                    <span>{item.createdAt}</span>
                    <span>Estado: {item.status}</span>
                  </article>
                ))
              ) : (
                <p className="empty-state">Aun no hay importaciones registradas para esta agenda.</p>
              )}
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderConfiguracion() {
    return (
      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Ajustes</p>
            <h2>Configuracion general del sistema</h2>
          </div>
          <p className="section-copy">
            Define el precio base de respaldo, los tiempos de agenda y los datos internos para seguimiento.
          </p>
        </div>
        <section className="appointments-panel dashboard-panel-soft">
          <form className="filters-form" onSubmit={saveSettings}>
            <label htmlFor="settings-cost">Precio base de respaldo</label>
            <input
              id="settings-cost"
              inputMode="numeric"
              value={settingsForm.appointmentCost}
              onChange={(event) =>
                setSettingsForm((current) => ({ ...current, appointmentCost: event.target.value }))
              }
            />

            <label htmlFor="settings-currency">Moneda base</label>
            <input
              id="settings-currency"
              value={settingsForm.appointmentCurrency}
              onChange={(event) =>
                setSettingsForm((current) => ({ ...current, appointmentCurrency: event.target.value }))
              }
            />

            <label htmlFor="settings-slot">Duracion de cada espacio (minutos)</label>
            <input
              id="settings-slot"
              inputMode="numeric"
              value={settingsForm.slotMinutes}
              onChange={(event) =>
                setSettingsForm((current) => ({ ...current, slotMinutes: event.target.value }))
              }
            />

            <label htmlFor="settings-email">Correo interno de seguimiento</label>
            <input
              id="settings-email"
              value={settingsForm.notificationEmail}
              onChange={(event) =>
                setSettingsForm((current) => ({ ...current, notificationEmail: event.target.value }))
              }
            />

            <label htmlFor="settings-topic">Topic de push</label>
            <input
              id="settings-topic"
              value={settingsForm.notificationsTopic}
              onChange={(event) =>
                setSettingsForm((current) => ({ ...current, notificationsTopic: event.target.value }))
              }
            />

            <button type="submit" disabled={savingSettings}>
              {savingSettings ? 'Guardando...' : 'Guardar configuracion'}
            </button>
          </form>

          <div className="dashboard-warning-note">
            <strong>Correo interno de preagendamiento</strong>
            <span>
              Si no esta llegando, debes verificar en AWS SES el remitente o el dominio de
              `notificacionesapp@clinicaisis.com`. En este entorno esa identidad no aparece creada.
            </span>
          </div>
        </section>
      </section>
    );
  }

  function renderActiveSection() {
    if (activeSection === 'precios') {
      return renderPrecios();
    }

    if (activeSection === 'alertas') {
      return renderAlertas();
    }

    if (activeSection === 'agenda') {
      return renderAgenda();
    }

    if (activeSection === 'configuracion') {
      return renderConfiguracion();
    }

    return renderConfirmaciones();
  }

  return (
    <main className="page dashboard-page dashboard-admin-page">
      <section className="card appointments-shell dashboard-shell dashboard-admin-shell">
        <div className="dashboard-hero">
          <div className="dashboard-hero-copy">
            <p className="eyebrow">Clinica ISIS</p>
            <h1>Panel administrativo de citas</h1>
            <p className="lead">
              Gestiona {monthLabel}, confirma preagendamientos, asigna precios por especialidad y coordina las notificaciones del equipo.
            </p>
          </div>
          <div className="dashboard-hero-aside">
            <label htmlFor="dashboard-month">Consultar agenda</label>
            <input
              id="dashboard-month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
            <p className="dashboard-month-copy">Vista actual: {monthLabel}</p>
            {showHomeLink ? (
              <Link className="ghost-link" href={homeHref}>
                Volver al portal principal
              </Link>
            ) : null}
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {feedback ? <p className="success">{feedback}</p> : null}

        <div className="dashboard-summary-ribbon">
          <article className="status-card compact-card dashboard-kpi">
            <p className="status-label">Total de horarios</p>
            <strong>{summary?.total ?? 0}</strong>
            <span>Disponibles: {summary?.byStatus?.available || 0}</span>
          </article>
          <article className="status-card compact-card dashboard-kpi">
            <p className="status-label">Por confirmar</p>
            <strong>{summary?.byStatus?.prebooked || 0}</strong>
            <span>Confirmados: {summary?.byStatus?.booked || 0}</span>
          </article>
          <article className="status-card compact-card dashboard-kpi">
            <p className="status-label">Especialidades activas</p>
            <strong>{specialties.length}</strong>
            <span>Correo interno: {settings?.notificationEmail || 'Sin configurar'}</span>
          </article>
        </div>

        <div className="dashboard-admin-layout">
          <aside className="dashboard-sidebar">
            <div className="dashboard-sidebar-card">
              <p className="dashboard-sidebar-title">Menu de trabajo</p>
              <div className="dashboard-nav">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`dashboard-nav-item ${activeSection === item.id ? 'dashboard-nav-item-active' : ''}`}
                    onClick={() => setActiveSection(item.id)}
                  >
                    <span>{item.label}</span>
                    <small>{item.description}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="dashboard-sidebar-card">
              <p className="dashboard-sidebar-title">Resumen rapido</p>
              <p className="sidebar-note">
                {loading
                  ? 'Cargando informacion de la agenda...'
                  : `Estas consultando la ${monthLabel} con ${pendingAppointments.length} cita(s) por revisar.`}
              </p>
            </div>
          </aside>

          <div className="dashboard-content">{renderActiveSection()}</div>
        </div>
      </section>
    </main>
  );
}
