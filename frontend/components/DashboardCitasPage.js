import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildAuthHeaders, clearAdminSession, loadAdminSession, saveAdminSession } from '../lib/admin-session';

const DEFAULT_MONTH =
  process.env.NEXT_PUBLIC_DEFAULT_APPOINTMENTS_MONTH ||
  new Date().toISOString().slice(0, 7);
const ASSIGNED_APPOINTMENTS_PAGE_SIZE = 10;
const WEEKDAYS = [
  { value: 'lunes', label: 'Lun' },
  { value: 'martes', label: 'Mar' },
  { value: 'miercoles', label: 'Mie' },
  { value: 'jueves', label: 'Jue' },
  { value: 'viernes', label: 'Vie' },
  { value: 'sabado', label: 'Sab' },
  { value: 'domingo', label: 'Dom' }
];

const NAV_ITEMS = [
  { id: 'confirmaciones', label: 'Confirmar citas', description: 'Revisa, contacta y asigna horarios.', icon: 'checkCircle' },
  { id: 'beneficios', label: 'Beneficios', description: 'Consulta usuarios e inactiva beneficios usados.', icon: 'gift' },
  { id: 'precios', label: 'Asignar precios', description: 'Define valores por especialidad.', icon: 'dollarSign' },
  { id: 'alertas', label: 'Enviar alertas', description: 'Gestiona campanas push para pacientes.', icon: 'bell' },
  { id: 'agenda', label: 'Cargar agenda', description: 'Importa el archivo del mes y valida el resumen.', icon: 'upload' },
  { id: 'disponibilidad', label: 'Agenda activa', description: 'Elige especialidades y medicos visibles.', icon: 'activity' },
  { id: 'configuracion', label: 'Configuracion', description: 'Ajusta tiempos y notificaciones internas.', icon: 'sliders' }
];

const ICON_PATHS = {
  logo: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  checkCircle: (
    <>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </>
  ),
  dollarSign: (
    <>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </>
  ),
  sliders: (
    <>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>
  ),
  activity: (
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  ),
  user: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  eye: (
    <>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </>
  ),
  gift: (
    <>
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 1 1 2.45-3c.55 1.65 2.05 3 2.05 3z" />
      <path d="M12 7h4.5a2.5 2.5 0 1 0-2.45-3C13.5 5.65 12 7 12 7z" />
    </>
  )
};

function Icon({ name, className }) {
  return (
    <svg
      className={`icon ${className || ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name] || null}
    </svg>
  );
}

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

function buildSoftwareMedicoForm(specialties, config) {
  const availableSpecialtyIds = specialties.map((specialty) => String(specialty.specialtyId));
  const configuredSpecialtyIds = Array.isArray(config?.especialidadesActivas)
    ? config.especialidadesActivas.map(String)
    : null;
  const configuredDoctors = config?.medicosActivosPorEspecialidad || {};
  const configuredWeekdays = config?.diasActivosPorEspecialidad || {};
  const configuredRanges = config?.rangosActivosPorMedico || {};
  const medicosActivosPorEspecialidad = {};
  const diasActivosPorEspecialidad = {};
  const rangosActivosPorMedico = {};

  specialties.forEach((specialty) => {
    const specialtyId = String(specialty.specialtyId);
    const availableDoctorIds = (specialty.medicos || []).map((doctor) => String(doctor.id));
    const selectedDoctorIds = Array.isArray(configuredDoctors[specialtyId])
      ? configuredDoctors[specialtyId].map(String)
      : null;

    medicosActivosPorEspecialidad[specialtyId] = selectedDoctorIds
      ? availableDoctorIds.filter((doctorId) => selectedDoctorIds.includes(doctorId))
      : availableDoctorIds;
    diasActivosPorEspecialidad[specialtyId] = Array.isArray(configuredWeekdays[specialtyId])
      ? WEEKDAYS.map((day) => day.value).filter((day) =>
          configuredWeekdays[specialtyId].includes(day)
        )
      : Array.isArray(specialty.dias_semana_activos)
        ? WEEKDAYS.map((day) => day.value).filter((day) =>
            specialty.dias_semana_activos.includes(day)
          )
        : WEEKDAYS.map((day) => day.value);
    rangosActivosPorMedico[specialtyId] = {};
    (specialty.medicos || []).forEach((doctor) => {
      const doctorId = String(doctor.id);
      const range =
        configuredRanges[specialtyId]?.[doctorId] ||
        doctor.rango_activo ||
        {};
      rangosActivosPorMedico[specialtyId][doctorId] = {
        fechaInicio: range.fechaInicio || '',
        fechaFin: range.fechaFin || ''
      };
    });
  });

  return {
    especialidadesActivas: configuredSpecialtyIds
      ? availableSpecialtyIds.filter((specialtyId) => configuredSpecialtyIds.includes(specialtyId))
      : availableSpecialtyIds,
    medicosActivosPorEspecialidad,
    diasActivosPorEspecialidad,
    rangosActivosPorMedico
  };
}

function formatDoctorName(doctor) {
  const name = [doctor?.first_name, doctor?.last_name].filter(Boolean).join(' ').trim();
  return name || doctor?.name || `Medico ${doctor?.id || ''}`.trim();
}

function formatUpdatedAtLabel(value) {
  if (!value) {
    return 'Sin sincronizar';
  }

  try {
    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return 'Sin sincronizar';
  }
}

function getSuccessPayload(payload) {
  if (payload && typeof payload === 'object' && 'success' in payload) {
    return payload.success ? payload.data : payload;
  }

  return payload;
}

function formatStatusLabel(status) {
  if (status === 'prebooked') {
    return 'Preagendada';
  }

  if (status === 'booked') {
    return 'Confirmada';
  }

  if (status === 'cancelled') {
    return 'Cancelada';
  }

  if (status === 'rejected') {
    return 'Rechazada';
  }

  return status || 'Sin estado';
}

export default function DashboardCitasPage({ homeHref = '/', showHomeLink = true }) {
  const [month, setMonth] = useState(DEFAULT_MONTH);
  const [activeSection, setActiveSection] = useState('confirmaciones');
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [adminProfile, setAdminProfile] = useState(null);
  const [loginForm, setLoginForm] = useState({
    cedula: '',
    password: ''
  });
  const [loggingIn, setLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [settings, setSettings] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [campaign, setCampaign] = useState({
    title: '',
    message: '',
    type: 'general'
  });
  const [benefitCedula, setBenefitCedula] = useState('');
  const [benefitUserData, setBenefitUserData] = useState(null);
  const [loadingBenefits, setLoadingBenefits] = useState(false);
  const [updatingBenefitId, setUpdatingBenefitId] = useState('');
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
  const [softwareMedicoForm, setSoftwareMedicoForm] = useState({
    especialidadesActivas: [],
    medicosActivosPorEspecialidad: {},
    diasActivosPorEspecialidad: {},
    rangosActivosPorMedico: {}
  });
  const [softwareMedicoDirty, setSoftwareMedicoDirty] = useState(false);
  const [slotFilters, setSlotFilters] = useState({
    specialtyKey: '',
    date: ''
  });
  const [assignedFilters, setAssignedFilters] = useState({
    cedula: '',
    status: 'all'
  });
  const [showAssignedAppointments, setShowAssignedAppointments] = useState(false);
  const [assignedPage, setAssignedPage] = useState(1);
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
  const [savingSoftwareMedico, setSavingSoftwareMedico] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);
  const [uploadingAgenda, setUploadingAgenda] = useState(false);
  const [submittingAssignment, setSubmittingAssignment] = useState(false);
  const [reviewingId, setReviewingId] = useState('');
  const [reschedulingId, setReschedulingId] = useState('');
  const [cancellingId, setCancellingId] = useState('');
  const [rescheduleTargetId, setRescheduleTargetId] = useState('');
  const [rescheduleForm, setRescheduleForm] = useState({
    slotId: '',
    notes: ''
  });
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const previousPendingIdsRef = useRef([]);

  const specialties = useMemo(() => buildSpecialties(dashboard), [dashboard]);
  const softwareMedicoSpecialties = useMemo(
    () => specialties.filter((specialty) => specialty.specialtyId),
    [specialties]
  );
  const activeSpecialtiesCount = useMemo(
    () => specialties.filter((specialty) => specialty.activa !== false).length,
    [specialties]
  );
  const monthLabel = useMemo(() => formatMonthLabel(month), [month]);
  const pendingAppointments = dashboard?.pending?.appointments || [];
  const scheduledAppointments = dashboard?.scheduledAppointments || [];
  const hasAssignedFilters = assignedFilters.cedula.trim() || assignedFilters.status !== 'all';
  const filteredScheduledAppointments = useMemo(() => {
    const cedulaFilter = assignedFilters.cedula.trim();

    return scheduledAppointments.filter((appointment) => {
      const matchesCedula = !cedulaFilter || String(appointment.cedula || '').includes(cedulaFilter);
      const matchesStatus =
        assignedFilters.status === 'all' || appointment.appointmentStatus === assignedFilters.status;

      return matchesCedula && matchesStatus;
    });
  }, [assignedFilters.cedula, assignedFilters.status, scheduledAppointments]);
  const shouldShowAssignedAppointments = showAssignedAppointments || hasAssignedFilters;
  const assignedTotalPages = Math.max(
    1,
    Math.ceil(filteredScheduledAppointments.length / ASSIGNED_APPOINTMENTS_PAGE_SIZE)
  );
  const paginatedScheduledAppointments = useMemo(() => {
    const startIndex = (assignedPage - 1) * ASSIGNED_APPOINTMENTS_PAGE_SIZE;
    return filteredScheduledAppointments.slice(
      startIndex,
      startIndex + ASSIGNED_APPOINTMENTS_PAGE_SIZE
    );
  }, [assignedPage, filteredScheduledAppointments]);
  const summary = dashboard?.summary;
  const imports = dashboard?.imports || [];

  useEffect(() => {
    const savedSession = loadAdminSession();
    if (savedSession?.accessToken) {
      setSession(savedSession);
    }
    setAuthReady(true);
  }, []);

  useEffect(() => {
    if (!session?.accessToken) {
      setDashboard(null);
      setSettings(null);
      setAdminProfile(null);
      previousPendingIdsRef.current = [];
      return;
    }

    loadAdminProfile(session);
  }, [session]);

  useEffect(() => {
    if (!session?.accessToken || !adminProfile) {
      return;
    }

    loadAll(month);
  }, [month, session?.accessToken, adminProfile]);

  useEffect(() => {
    if (softwareMedicoDirty || !softwareMedicoSpecialties.length) {
      return;
    }

    setSoftwareMedicoForm(
      buildSoftwareMedicoForm(softwareMedicoSpecialties, settings?.softwareMedicoConfig)
    );
  }, [settings?.softwareMedicoConfig, softwareMedicoDirty, softwareMedicoSpecialties]);

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
  }, [activeSection, month, slotFilters.specialtyKey, slotFilters.date, specialties, session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken || !adminProfile) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      loadAll(month, { silent: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [month, session?.accessToken, adminProfile]);

  useEffect(() => {
    setAssignedPage(1);
  }, [assignedFilters.cedula, assignedFilters.status, month, scheduledAppointments.length]);

  useEffect(() => {
    if (assignedPage > assignedTotalPages) {
      setAssignedPage(assignedTotalPages);
    }
  }, [assignedPage, assignedTotalPages]);

  async function adminFetch(url, options = {}) {
    if (!session?.accessToken) {
      throw new Error('Tu sesion administrativa expiro. Ingresa nuevamente.');
    }

    const nextHeaders = buildAuthHeaders(session, options.headers || {});
    const response = await fetch(url, { ...options, headers: nextHeaders });

    if (response.status === 401 || response.status === 403) {
      clearAdminSession();
      setSession(null);
      setAdminProfile(null);
      throw new Error('Tu sesion administrativa ya no es valida. Ingresa nuevamente.');
    }

    return response;
  }

  async function loadAdminProfile(currentSession) {
    setError('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/users/me`, {
        headers: buildAuthHeaders(currentSession)
      });
      const payload = await response.json();
      const data = getSuccessPayload(payload);

      if (!response.ok) {
        clearAdminSession();
        setSession(null);
        throw new Error(payload.message || 'No fue posible validar la sesion administrativa.');
      }

      if (!Array.isArray(data?.groups) || !data.groups.includes('admin')) {
        clearAdminSession();
        setSession(null);
        throw new Error('Este usuario no tiene permisos de administrador para el dashboard.');
      }

      setAdminProfile(data);
    } catch (requestError) {
      setAdminProfile(null);
      setError(requestError.message);
    }
  }

  async function loginAdmin(event) {
    event.preventDefault();
    setLoggingIn(true);
    setError('');
    setFeedback('');

    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(loginForm)
      });
      const payload = await response.json();
      const data = getSuccessPayload(payload);

      if (!response.ok || !data?.accessToken) {
        throw new Error(payload.message || 'No fue posible iniciar sesion.');
      }

      saveAdminSession(data);
      setSession(data);
      setLoginForm((current) => ({ ...current, password: '' }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoggingIn(false);
    }
  }

  function logoutAdmin() {
    clearAdminSession();
    setSession(null);
    setAdminProfile(null);
    setBenefitUserData(null);
    setBenefitCedula('');
    setFeedback('');
    setError('');
  }

  async function loadAll(targetMonth, options = {}) {
    const silent = options.silent === true;

    if (!silent) {
      setLoading(true);
      setError('');
    }

    try {
      const [dashboardResponse, settingsResponse] = await Promise.all([
        adminFetch(`${getApiBaseUrl()}/admin/agenda/dashboard?month=${encodeURIComponent(targetMonth)}`),
        adminFetch(`${getApiBaseUrl()}/admin/settings/appointments`)
      ]);

      const dashboardData = await dashboardResponse.json();
      const settingsData = await settingsResponse.json();

      if (!dashboardResponse.ok) {
        throw new Error(dashboardData.message || 'No fue posible cargar el dashboard.');
      }

      if (!settingsResponse.ok) {
        throw new Error(settingsData.message || 'No fue posible cargar la configuracion.');
      }

      if (silent) {
        const nextPendingIds = (dashboardData.pending?.appointments || []).map((item) => item.appointmentId);
        const hasNewPending = nextPendingIds.some((id) => !previousPendingIdsRef.current.includes(id));

        if (hasNewPending && previousPendingIdsRef.current.length > 0) {
          setFeedback('Llegaron nuevas citas preagendadas al dashboard. Ya puedes revisarlas.');
        }

        previousPendingIdsRef.current = nextPendingIds;
      } else {
        previousPendingIdsRef.current = (dashboardData.pending?.appointments || []).map((item) => item.appointmentId);
      }

      setDashboard(dashboardData);
      setSettings(settingsData);
      setLastUpdatedAt(new Date().toISOString());
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
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function loadAvailableSlots() {
    setLoadingSlots(true);
    setError('');

    try {
      const selectedSpecialty = specialties.find((item) => item.specialtyKey === slotFilters.specialtyKey);
      const params = new URLSearchParams({ month, includeSlots: 'true' });

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
      const response = await adminFetch(`${getApiBaseUrl()}/admin/settings/appointments`, {
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
          pricingBySpecialty: settings?.pricingBySpecialty || {},
          softwareMedicoConfig: settings?.softwareMedicoConfig
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

  function toggleSoftwareMedicoSpecialty(specialtyId, active) {
    const normalizedId = String(specialtyId);
    setSoftwareMedicoDirty(true);
    setSoftwareMedicoForm((current) => ({
      ...current,
      especialidadesActivas: active
        ? [...new Set([...current.especialidadesActivas, normalizedId])]
        : current.especialidadesActivas.filter((id) => id !== normalizedId)
    }));
  }

  function setAllSoftwareMedicoSpecialties(active) {
    setSoftwareMedicoDirty(true);
    setSoftwareMedicoForm((current) => ({
      ...current,
      especialidadesActivas: active
        ? softwareMedicoSpecialties.map((specialty) => String(specialty.specialtyId))
        : []
    }));
  }

  function toggleSoftwareMedicoDoctor(specialtyId, doctorId, active) {
    const normalizedSpecialtyId = String(specialtyId);
    const normalizedDoctorId = String(doctorId);
    setSoftwareMedicoDirty(true);
    setSoftwareMedicoForm((current) => {
      const currentDoctorIds =
        current.medicosActivosPorEspecialidad[normalizedSpecialtyId] || [];

      return {
        ...current,
        medicosActivosPorEspecialidad: {
          ...current.medicosActivosPorEspecialidad,
          [normalizedSpecialtyId]: active
            ? [...new Set([...currentDoctorIds, normalizedDoctorId])]
            : currentDoctorIds.filter((id) => id !== normalizedDoctorId)
        }
      };
    });
  }

  function setAllSoftwareMedicoDoctors(specialtyId, doctorIds) {
    const normalizedSpecialtyId = String(specialtyId);
    setSoftwareMedicoDirty(true);
    setSoftwareMedicoForm((current) => ({
      ...current,
      medicosActivosPorEspecialidad: {
        ...current.medicosActivosPorEspecialidad,
        [normalizedSpecialtyId]: doctorIds.map(String)
      }
    }));
  }

  function toggleSoftwareMedicoWeekday(specialtyId, weekday, active) {
    const normalizedSpecialtyId = String(specialtyId);
    setSoftwareMedicoDirty(true);
    setSoftwareMedicoForm((current) => {
      const currentWeekdays =
        current.diasActivosPorEspecialidad[normalizedSpecialtyId] || [];

      return {
        ...current,
        diasActivosPorEspecialidad: {
          ...current.diasActivosPorEspecialidad,
          [normalizedSpecialtyId]: active
            ? [...new Set([...currentWeekdays, weekday])]
            : currentWeekdays.filter((day) => day !== weekday)
        }
      };
    });
  }

  function setAllSoftwareMedicoWeekdays(specialtyId, active) {
    const normalizedSpecialtyId = String(specialtyId);
    setSoftwareMedicoDirty(true);
    setSoftwareMedicoForm((current) => ({
      ...current,
      diasActivosPorEspecialidad: {
        ...current.diasActivosPorEspecialidad,
        [normalizedSpecialtyId]: active ? WEEKDAYS.map((day) => day.value) : []
      }
    }));
  }

  function updateSoftwareMedicoDoctorRange(specialtyId, doctorId, field, value) {
    const normalizedSpecialtyId = String(specialtyId);
    const normalizedDoctorId = String(doctorId);
    setSoftwareMedicoDirty(true);
    setSoftwareMedicoForm((current) => ({
      ...current,
      rangosActivosPorMedico: {
        ...current.rangosActivosPorMedico,
        [normalizedSpecialtyId]: {
          ...(current.rangosActivosPorMedico[normalizedSpecialtyId] || {}),
          [normalizedDoctorId]: {
            ...(current.rangosActivosPorMedico[normalizedSpecialtyId]?.[
              normalizedDoctorId
            ] || {}),
            [field]: value
          }
        }
      }
    }));
  }

  async function saveSoftwareMedicoConfig(event) {
    event.preventDefault();
    setFeedback('');
    setError('');

    if (!softwareMedicoForm.especialidadesActivas.length) {
      setError('Debes dejar activa al menos una especialidad para la app.');
      return;
    }

    const specialtyWithoutDoctor = softwareMedicoSpecialties.find((specialty) => {
      const specialtyId = String(specialty.specialtyId);
      const isActive = softwareMedicoForm.especialidadesActivas.includes(specialtyId);
      const availableDoctors = specialty.medicos || [];
      const selectedDoctors =
        softwareMedicoForm.medicosActivosPorEspecialidad[specialtyId] || [];

      return isActive && availableDoctors.length > 0 && selectedDoctors.length === 0;
    });

    if (specialtyWithoutDoctor) {
      setError(`Selecciona al menos un medico para ${specialtyWithoutDoctor.specialty}.`);
      return;
    }

    const specialtyWithoutWeekday = softwareMedicoSpecialties.find((specialty) => {
      const specialtyId = String(specialty.specialtyId);
      return (
        softwareMedicoForm.especialidadesActivas.includes(specialtyId) &&
        !(softwareMedicoForm.diasActivosPorEspecialidad[specialtyId] || []).length
      );
    });

    if (specialtyWithoutWeekday) {
      setError(`Selecciona al menos un dia activo para ${specialtyWithoutWeekday.specialty}.`);
      return;
    }

    const invalidDoctorRange = softwareMedicoSpecialties
      .flatMap((specialty) =>
        (specialty.medicos || []).map((doctor) => ({
          specialty,
          doctor,
          range:
            softwareMedicoForm.rangosActivosPorMedico[
              String(specialty.specialtyId)
            ]?.[String(doctor.id)] || {}
        }))
      )
      .find(
        ({ range }) =>
          range.fechaInicio &&
          range.fechaFin &&
          range.fechaInicio > range.fechaFin
      );

    if (invalidDoctorRange) {
      setError(
        `La fecha inicial no puede ser posterior a la final para ${formatDoctorName(
          invalidDoctorRange.doctor
        )}.`
      );
      return;
    }

    setSavingSoftwareMedico(true);

    try {
      const response = await adminFetch(`${getApiBaseUrl()}/admin/settings/appointments`, {
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
          pricingBySpecialty: settings?.pricingBySpecialty || {},
          softwareMedicoConfig: softwareMedicoForm
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No fue posible guardar la disponibilidad de la app.');
      }

      setSettings(data.settings);
      setSoftwareMedicoDirty(false);
      setFeedback('Disponibilidad actualizada. Los cambios ya se reflejan en la app.');
      await loadAll(month, { silent: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSavingSoftwareMedico(false);
    }
  }

  async function updateMonthPricing(event) {
    event.preventDefault();
    setSavingPricing(true);
    setFeedback('');
    setError('');

    try {
      const response = await adminFetch(`${getApiBaseUrl()}/admin/agenda/pricing`, {
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
      const response = await adminFetch(`${getApiBaseUrl()}/admin/notifications/send`, {
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
      const response = await adminFetch(`${getApiBaseUrl()}/admin/agenda/import`, {
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
      const response = await adminFetch(`${getApiBaseUrl()}/admin/appointments/${appointmentId}/review`, {
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

  async function cancelAppointmentFromAdmin(appointmentId) {
    setCancellingId(appointmentId);
    setFeedback('');
    setError('');

    try {
      const response = await adminFetch(`${getApiBaseUrl()}/admin/appointments/${appointmentId}/cancel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No fue posible cancelar la cita.');
      }

      setFeedback(data.message || 'Cita cancelada correctamente.');
      if (rescheduleTargetId === appointmentId) {
        setRescheduleTargetId('');
        setRescheduleForm({ slotId: '', notes: '' });
      }
      await Promise.all([loadAll(month), loadAvailableSlots()]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCancellingId('');
    }
  }

  async function rescheduleAppointment(appointmentId) {
    if (!rescheduleForm.slotId) {
      setError('Selecciona un horario disponible para modificar la cita.');
      return;
    }

    setReschedulingId(appointmentId);
    setFeedback('');
    setError('');

    try {
      const response = await adminFetch(`${getApiBaseUrl()}/admin/appointments/${appointmentId}/reschedule`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(rescheduleForm)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No fue posible modificar la cita.');
      }

      setFeedback(data.message || 'Cita modificada correctamente.');
      setRescheduleTargetId('');
      setRescheduleForm({ slotId: '', notes: '' });
      await Promise.all([loadAll(month), loadAvailableSlots()]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setReschedulingId('');
    }
  }

  async function searchUserBenefits(event) {
    event?.preventDefault();
    const cedula = benefitCedula.trim();

    if (!cedula) {
      setError('Ingresa la cedula del usuario que deseas consultar.');
      return;
    }

    setLoadingBenefits(true);
    setBenefitUserData(null);
    setFeedback('');
    setError('');

    try {
      const response = await adminFetch(
        `${getApiBaseUrl()}/admin/benefits/user?cedula=${encodeURIComponent(cedula)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No fue posible consultar los beneficios del usuario.');
      }

      setBenefitUserData(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoadingBenefits(false);
    }
  }

  async function updateUserBenefit(benefit, active) {
    if (!benefitUserData?.user?.userId) {
      return;
    }

    if (
      !active &&
      typeof window !== 'undefined' &&
      !window.confirm(`¿Confirmas que ${benefit.title} ya fue utilizado?`)
    ) {
      return;
    }

    setUpdatingBenefitId(benefit.benefitId);
    setFeedback('');
    setError('');

    try {
      const response = await adminFetch(
        `${getApiBaseUrl()}/admin/benefits/user/${encodeURIComponent(
          benefitUserData.user.userId
        )}/${encodeURIComponent(benefit.benefitId)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ active })
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'No fue posible actualizar el beneficio.');
      }

      setBenefitUserData((current) => {
        const benefits = current.benefits.map((item) =>
          item.benefitId === benefit.benefitId ? data.benefit : item
        );

        return {
          ...current,
          benefits,
          summary: {
            total: benefits.length,
            active: benefits.filter((item) => item.active).length,
            inactive: benefits.filter((item) => !item.active).length
          }
        };
      });
      setFeedback(data.message || 'Beneficio actualizado correctamente.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUpdatingBenefitId('');
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

  function renderRescheduleForm(appointmentId, prefix) {
    if (rescheduleTargetId !== appointmentId) {
      return null;
    }

    return (
      <div className="filters-form assignment-form">
        <h4>Modificar cita</h4>
        <label htmlFor={`${prefix}-slot-${appointmentId}`}>Nuevo horario</label>
        <select
          id={`${prefix}-slot-${appointmentId}`}
          value={rescheduleForm.slotId}
          onChange={(event) =>
            setRescheduleForm((current) => ({ ...current, slotId: event.target.value }))
          }
        >
          <option value="">Selecciona un horario disponible</option>
          {availableSlots.map((slot) => (
            <option key={slot.slotId} value={slot.slotId}>
              {`${slot.specialty} - ${slot.specialist} - ${formatDateTimeLabel(slot.date, slot.startTime)}`}
            </option>
          ))}
        </select>

        <label htmlFor={`${prefix}-notes-${appointmentId}`}>Notas internas</label>
        <input
          id={`${prefix}-notes-${appointmentId}`}
          value={rescheduleForm.notes}
          onChange={(event) =>
            setRescheduleForm((current) => ({ ...current, notes: event.target.value }))
          }
          placeholder="Motivo del cambio o confirmacion"
        />

        <button
          type="button"
          onClick={() => rescheduleAppointment(appointmentId)}
          disabled={reschedulingId === appointmentId}
        >
          {reschedulingId === appointmentId ? 'Guardando...' : 'Guardar cambio'}
        </button>
      </div>
    );
  }

  function renderManageActions(appointment, options = {}) {
    const allowApprove = options.allowApprove !== false;

    return (
      <div className="slot-actions">
        {appointment.appointmentStatus === 'prebooked' && allowApprove ? (
          <button
            type="button"
            onClick={() => reviewAppointment(appointment.appointmentId, 'approved')}
            disabled={reviewingId === `${appointment.appointmentId}:approved`}
          >
            {reviewingId === `${appointment.appointmentId}:approved` ? 'Procesando...' : 'Confirmar cita'}
          </button>
        ) : null}
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setRescheduleTargetId(
              rescheduleTargetId === appointment.appointmentId ? '' : appointment.appointmentId
            );
            setRescheduleForm({ slotId: '', notes: '' });
          }}
        >
          {rescheduleTargetId === appointment.appointmentId ? 'Cerrar cambio' : 'Modificar'}
        </button>
        <button
          type="button"
          className="secondary-button danger-button"
          onClick={() => cancelAppointmentFromAdmin(appointment.appointmentId)}
          disabled={cancellingId === appointment.appointmentId}
        >
          {cancellingId === appointment.appointmentId ? 'Cancelando...' : 'Cancelar'}
        </button>
      </div>
    );
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

                    {renderManageActions(appointment)}
                    {renderRescheduleForm(appointment.appointmentId, 'pending-reschedule')}
                  </article>
                ))
              ) : (
                <p className="empty-state">No hay citas preagendadas pendientes para esta agenda.</p>
              )}
            </div>
          </section>

          <section className="appointments-panel dashboard-panel-soft">
            <div className="panel-title-row">
              <h3>Citas asignadas</h3>
              <span className="panel-counter">{scheduledAppointments.length} registradas</span>
            </div>

            <form className="filters-form dashboard-inline-filters dashboard-assigned-filters" onSubmit={(event) => event.preventDefault()}>
              <div>
                <label htmlFor="assigned-cedula-filter">Buscar por cedula</label>
                <input
                  id="assigned-cedula-filter"
                  value={assignedFilters.cedula}
                  onChange={(event) =>
                    setAssignedFilters((current) => ({ ...current, cedula: event.target.value }))
                  }
                  placeholder="Ej. 1023899033"
                />
              </div>

              <div>
                <label htmlFor="assigned-status-filter">Estado</label>
                <select
                  id="assigned-status-filter"
                  value={assignedFilters.status}
                  onChange={(event) =>
                    setAssignedFilters((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  <option value="all">Todas</option>
                  <option value="booked">Confirmadas</option>
                  <option value="prebooked">Preagendadas</option>
                </select>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setAssignedFilters({ cedula: '', status: 'all' });
                  setShowAssignedAppointments(false);
                }}
              >
                Limpiar filtros
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowAssignedAppointments((current) => !current)}
              >
                {shouldShowAssignedAppointments ? 'Ocultar listado' : 'Ver todo'}
              </button>
            </form>

            <div className="dashboard-assigned-summary">
              <strong>{filteredScheduledAppointments.length}</strong>
              <span>
                {hasAssignedFilters
                  ? 'citas encontradas con los filtros actuales.'
                  : 'citas disponibles para gestion en esta agenda.'}
              </span>
            </div>

            {!shouldShowAssignedAppointments ? (
              <p className="empty-state">
                Usa los filtros para buscar por cédula o estado, o abre `Ver todo` para revisar el listado completo paginado.
              </p>
            ) : null}

            {shouldShowAssignedAppointments ? (
              <div className="appointments-list">
                {paginatedScheduledAppointments.length ? (
                  paginatedScheduledAppointments.map((appointment) => (
                  <article key={`scheduled-${appointment.appointmentId}`} className="appointment-item enhanced-appointment-card">
                    <div className="appointment-item-head">
                      <div>
                        <p className="status-label appointment-specialty-label">{appointment.specialty}</p>
                        <strong>{appointment.patientName || 'Paciente sin nombre registrado'}</strong>
                        <span>{appointment.specialist}</span>
                      </div>
                      <span className={`status-chip ${appointment.appointmentStatus === 'booked' ? 'status-chip-ok' : 'status-chip-warn'}`}>
                        {formatStatusLabel(appointment.appointmentStatus)}
                      </span>
                    </div>

                    <div className="appointment-data-grid">
                      <div className="appointment-data-block">
                        <p>Horario</p>
                        <strong>{formatDateTimeLabel(appointment.date, appointment.startTime)}</strong>
                      </div>
                      <div className="appointment-data-block">
                        <p>Cedula</p>
                        <strong>{appointment.cedula || 'Sin dato'}</strong>
                      </div>
                      <div className="appointment-data-block">
                        <p>Telefono</p>
                        <strong>{appointment.patientPhone || 'Sin telefono'}</strong>
                      </div>
                      <div className="appointment-data-block">
                        <p>Correo</p>
                        <strong>{appointment.patientEmail || 'Sin correo'}</strong>
                      </div>
                      <div className="appointment-data-block">
                        <p>Pago</p>
                        <strong>{appointment.paymentStatus || 'Sin integracion de pago'}</strong>
                      </div>
                    </div>

                    {renderManageActions(appointment)}
                    {renderRescheduleForm(appointment.appointmentId, 'scheduled-reschedule')}
                  </article>
                  ))
                ) : (
                  <p className="empty-state">No hay citas asignadas que coincidan con los filtros.</p>
                )}
              </div>
            ) : null}

            {shouldShowAssignedAppointments && filteredScheduledAppointments.length > ASSIGNED_APPOINTMENTS_PAGE_SIZE ? (
              <div className="dashboard-pagination">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setAssignedPage((current) => Math.max(1, current - 1))}
                  disabled={assignedPage === 1}
                >
                  Anterior
                </button>
                <span className="dashboard-pagination-label">
                  Página {assignedPage} de {assignedTotalPages}
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    setAssignedPage((current) => Math.min(assignedTotalPages, current + 1))
                  }
                  disabled={assignedPage === assignedTotalPages}
                >
                  Siguiente
                </button>
              </div>
            ) : null}
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
                      className={`available-slot-card ${assignForm.slotId === slot.slotId || rescheduleForm.slotId === slot.slotId ? 'available-slot-card-active' : ''}`}
                      onClick={() => {
                        setAssignForm((current) => ({ ...current, slotId: slot.slotId }));
                        if (rescheduleTargetId) {
                          setRescheduleForm((current) => ({ ...current, slotId: slot.slotId }));
                        }
                      }}
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

  function renderBeneficios() {
    return (
      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Isis Gold Card</p>
            <h2>Beneficios por usuario</h2>
          </div>
          <p className="section-copy">
            Busca al usuario por cedula y marca como utilizado cada beneficio que ya fue redimido.
            El cambio solo afecta al usuario seleccionado.
          </p>
        </div>

        <section className="appointments-panel dashboard-panel-soft">
          <form className="benefits-search-form" onSubmit={searchUserBenefits}>
            <div>
              <label htmlFor="benefit-user-cedula">Cedula del usuario</label>
              <input
                id="benefit-user-cedula"
                inputMode="numeric"
                value={benefitCedula}
                onChange={(event) => setBenefitCedula(event.target.value)}
                placeholder="Ingresa la cedula"
              />
            </div>
            <button type="submit" disabled={loadingBenefits}>
              {loadingBenefits ? 'Buscando...' : 'Buscar usuario'}
            </button>
          </form>
        </section>

        {benefitUserData ? (
          <>
            <section className="appointments-panel dashboard-panel-soft benefits-user-summary">
              <div>
                <p className="status-label">Usuario encontrado</p>
                <h3>{benefitUserData.user.name || 'Sin nombre registrado'}</h3>
                <p>
                  Cedula: <strong>{benefitUserData.user.cedula}</strong>
                  {benefitUserData.user.email ? ` · ${benefitUserData.user.email}` : ''}
                </p>
              </div>
              <div className="benefits-summary-chips">
                <span className="status-chip status-chip-ok">
                  {benefitUserData.summary.active} activos
                </span>
                <span className="status-chip status-chip-warn">
                  {benefitUserData.summary.inactive} utilizados
                </span>
              </div>
            </section>

            <div className="benefits-admin-grid">
              {benefitUserData.benefits.map((benefit) => (
                <article
                  key={benefit.benefitId}
                  className={`benefit-admin-card ${benefit.active ? '' : 'benefit-admin-card-inactive'}`}
                >
                  <div className="benefit-admin-card-head">
                    <span className={`status-chip ${benefit.active ? 'status-chip-ok' : 'status-chip-warn'}`}>
                      {benefit.active ? 'Disponible' : 'Utilizado'}
                    </span>
                    {benefit.discountPercentage ? (
                      <strong className="benefit-discount">{benefit.discountPercentage}%</strong>
                    ) : null}
                  </div>
                  <div>
                    <h3>{benefit.title}</h3>
                    <p>{benefit.description}</p>
                  </div>
                  <div className="benefit-admin-meta">
                    {benefit.includedUses > 1 ? <span>Incluye: {benefit.includedUses} servicios</span> : null}
                    {benefit.durationMinutes ? <span>Duracion: {benefit.durationMinutes} minutos</span> : null}
                    {!benefit.active && benefit.inactiveAt ? (
                      <span>Inactivado: {formatUpdatedAtLabel(benefit.inactiveAt)}</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={benefit.active ? 'danger-button' : 'secondary-button'}
                    disabled={updatingBenefitId === benefit.benefitId}
                    onClick={() => updateUserBenefit(benefit, !benefit.active)}
                  >
                    {updatingBenefitId === benefit.benefitId
                      ? 'Actualizando...'
                      : benefit.active
                        ? 'Marcar como utilizado'
                        : 'Reactivar beneficio'}
                  </button>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="empty-state">
            {loadingBenefits
              ? 'Consultando los beneficios del usuario...'
              : 'Busca un usuario para consultar sus beneficios disponibles y utilizados.'}
          </p>
        )}
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
              <option value="general">General / blogs</option>
            </select>
            <p className="field-hint">
              Por el momento las campanas solo pueden enviarse como General / blogs. Los demas tipos se habilitaran mas adelante.
            </p>

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

  function renderDisponibilidad() {
    const activeSpecialtyIds = softwareMedicoForm.especialidadesActivas;
    const activeDoctorCount = softwareMedicoSpecialties.reduce((total, specialty) => {
      const specialtyId = String(specialty.specialtyId);

      if (!activeSpecialtyIds.includes(specialtyId)) {
        return total;
      }

      return total + (softwareMedicoForm.medicosActivosPorEspecialidad[specialtyId] || []).length;
    }, 0);

    return (
      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Software Medico</p>
            <h2>Especialidades y medicos activos</h2>
          </div>
          <p className="section-copy">
            Controla que opciones puede consultar el paciente. Al guardar, el catalogo y la agenda de la app
            respetaran esta seleccion.
          </p>
        </div>

        {!softwareMedicoSpecialties.length ? (
          <section className="appointments-panel dashboard-panel-soft">
            <p className="empty-state">
              El catalogo de Software Medico no esta disponible en este momento. Actualiza el dashboard e
              intenta nuevamente.
            </p>
          </section>
        ) : (
          <form className="software-medico-config-form" onSubmit={saveSoftwareMedicoConfig}>
            <div className="software-config-toolbar">
              <div className="software-config-summary" aria-live="polite">
                <strong>{activeSpecialtyIds.length}</strong>
                <span>de {softwareMedicoSpecialties.length} especialidades activas</span>
                <strong>{activeDoctorCount}</strong>
                <span>medicos visibles en la app</span>
              </div>
              <div className="software-config-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setAllSoftwareMedicoSpecialties(true)}
                >
                  Activar todas
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setAllSoftwareMedicoSpecialties(false)}
                >
                  Desactivar todas
                </button>
              </div>
            </div>

            <div className="software-specialties-grid">
              {softwareMedicoSpecialties.map((specialty) => {
                const specialtyId = String(specialty.specialtyId);
                const doctors = specialty.medicos || [];
                const isActive = activeSpecialtyIds.includes(specialtyId);
                const activeDoctorIds =
                  softwareMedicoForm.medicosActivosPorEspecialidad[specialtyId] || [];
                const activeWeekdays =
                  softwareMedicoForm.diasActivosPorEspecialidad[specialtyId] || [];

                return (
                  <article
                    key={specialtyId}
                    className={`software-specialty-card ${isActive ? 'software-specialty-card-active' : ''}`}
                  >
                    <label className="software-specialty-toggle">
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={(event) =>
                          toggleSoftwareMedicoSpecialty(specialtyId, event.target.checked)
                        }
                      />
                      <span className="software-specialty-copy">
                        <strong>{specialty.specialty}</strong>
                        <small>
                          {activeDoctorIds.length} de {doctors.length} medicos · {activeWeekdays.length} dias
                        </small>
                      </span>
                    </label>

                    <div className="software-weekdays">
                      <div className="software-doctors-header">
                        <span>Dias activos</span>
                        <div className="software-doctors-actions">
                          <button
                            type="button"
                            onClick={() => setAllSoftwareMedicoWeekdays(specialtyId, true)}
                          >
                            Todos
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllSoftwareMedicoWeekdays(specialtyId, false)}
                          >
                            Ninguno
                          </button>
                        </div>
                      </div>
                      <div className="software-weekdays-grid">
                        {WEEKDAYS.map((weekday) => (
                          <label
                            key={weekday.value}
                            className={`software-weekday-option ${
                              activeWeekdays.includes(weekday.value)
                                ? 'software-weekday-option-active'
                                : ''
                            } ${!isActive ? 'software-weekday-option-disabled' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={activeWeekdays.includes(weekday.value)}
                              disabled={!isActive}
                              onChange={(event) =>
                                toggleSoftwareMedicoWeekday(
                                  specialtyId,
                                  weekday.value,
                                  event.target.checked
                                )
                              }
                            />
                            <span>{weekday.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="software-doctors">
                      <div className="software-doctors-header">
                        <span>Medicos</span>
                        {doctors.length ? (
                          <div className="software-doctors-actions">
                            <button
                              type="button"
                              onClick={() =>
                                setAllSoftwareMedicoDoctors(
                                  specialtyId,
                                  doctors.map((doctor) => doctor.id)
                                )
                              }
                            >
                              Todos
                            </button>
                            <button
                              type="button"
                              onClick={() => setAllSoftwareMedicoDoctors(specialtyId, [])}
                            >
                              Ninguno
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {doctors.length ? (
                        <div className="software-doctors-grid">
                          {doctors.map((doctor) => {
                            const doctorId = String(doctor.id);
                            const doctorActive = activeDoctorIds.includes(doctorId);
                            const doctorRange =
                              softwareMedicoForm.rangosActivosPorMedico[specialtyId]?.[
                                doctorId
                              ] || { fechaInicio: '', fechaFin: '' };

                            return (
                              <div
                                key={doctorId}
                                className={`software-doctor-row ${
                                  !isActive ? 'software-doctor-option-disabled' : ''
                                }`}
                              >
                                <label className="software-doctor-option">
                                  <input
                                    type="checkbox"
                                    checked={doctorActive}
                                    disabled={!isActive}
                                    onChange={(event) =>
                                      toggleSoftwareMedicoDoctor(
                                        specialtyId,
                                        doctorId,
                                        event.target.checked
                                      )
                                    }
                                  />
                                  <span>{formatDoctorName(doctor)}</span>
                                </label>
                                <div className="software-doctor-range">
                                  <label>
                                    <span>Desde</span>
                                    <input
                                      type="date"
                                      value={doctorRange.fechaInicio}
                                      max={doctorRange.fechaFin || undefined}
                                      disabled={!isActive || !doctorActive}
                                      onChange={(event) =>
                                        updateSoftwareMedicoDoctorRange(
                                          specialtyId,
                                          doctorId,
                                          'fechaInicio',
                                          event.target.value
                                        )
                                      }
                                    />
                                  </label>
                                  <label>
                                    <span>Hasta</span>
                                    <input
                                      type="date"
                                      value={doctorRange.fechaFin}
                                      min={doctorRange.fechaInicio || undefined}
                                      disabled={!isActive || !doctorActive}
                                      onChange={(event) =>
                                        updateSoftwareMedicoDoctorRange(
                                          specialtyId,
                                          doctorId,
                                          'fechaFin',
                                          event.target.value
                                        )
                                      }
                                    />
                                  </label>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="software-doctors-empty">No hay medicos asociados a esta especialidad.</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="software-config-footer">
              <div>
                <strong>{softwareMedicoDirty ? 'Tienes cambios pendientes' : 'Configuracion sincronizada'}</strong>
                <span>La app solo mostrara las opciones que dejes activas.</span>
              </div>
              <button type="submit" disabled={savingSoftwareMedico || !softwareMedicoDirty}>
                {savingSoftwareMedico ? 'Guardando...' : 'Guardar disponibilidad'}
              </button>
            </div>
          </form>
        )}
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
    if (activeSection === 'beneficios') {
      return renderBeneficios();
    }

    if (activeSection === 'precios') {
      return renderPrecios();
    }

    if (activeSection === 'alertas') {
      return renderAlertas();
    }

    if (activeSection === 'agenda') {
      return renderAgenda();
    }

    if (activeSection === 'disponibilidad') {
      return renderDisponibilidad();
    }

    if (activeSection === 'configuracion') {
      return renderConfiguracion();
    }

    return renderConfirmaciones();
  }

  if (!authReady) {
    return (
      <main className="page dashboard-page dashboard-admin-page">
        <section className="card appointments-shell dashboard-shell dashboard-admin-shell">
          <p className="lead">Validando acceso al dashboard...</p>
        </section>
      </main>
    );
  }

  if (!session?.accessToken || !adminProfile) {
    return (
      <main className="page dashboard-page dashboard-admin-page dashboard-login-page">
        <section className="dashboard-login-card">
          <div className="dashboard-login-brand">
            <span className="dashboard-logo-badge">
              <Icon name="logo" />
            </span>
            <h1>Clinica ISIS</h1>
            <p className="dashboard-brand-caption">Panel administrativo</p>
          </div>

          <div className="dashboard-login-heading">
            <h2>Acceso al sistema</h2>
            <p className="lead">
              Ingresa con un usuario administrador para revisar preagendas, confirmar citas y gestionar la agenda.
            </p>
          </div>

          {error ? <p className="error">{error}</p> : null}

          <form className="filters-form dashboard-login-form" onSubmit={loginAdmin}>
            <label htmlFor="admin-cedula">Cedula</label>
            <div className="dashboard-input-group">
              <Icon name="user" className="dashboard-input-icon" />
              <input
                id="admin-cedula"
                value={loginForm.cedula}
                onChange={(event) => setLoginForm((current) => ({ ...current, cedula: event.target.value }))}
                autoComplete="username"
              />
            </div>

            <label htmlFor="admin-password">Contrasena</label>
            <div className="dashboard-input-group">
              <Icon name="lock" className="dashboard-input-icon" />
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="dashboard-input-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} />
              </button>
            </div>

            <button type="submit" className="dashboard-primary-button" disabled={loggingIn}>
              {loggingIn ? 'Ingresando...' : 'Iniciar sesion'}
            </button>
          </form>

          {showHomeLink ? (
            <Link className="ghost-link dashboard-login-back" href={homeHref}>
              Volver al portal principal
            </Link>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className="page dashboard-page dashboard-admin-page">
      <section className="card appointments-shell dashboard-shell dashboard-admin-shell">
        <div className="dashboard-hero">
          <div className="dashboard-hero-copy">
            <div className="dashboard-brand-row">
              <span className="dashboard-logo-badge dashboard-logo-badge-sm">
                <Icon name="logo" />
              </span>
              <div>
                <p className="eyebrow">Clinica ISIS</p>
                <p className="dashboard-brand-caption">Panel administrativo</p>
              </div>
            </div>
            <h1>Panel administrativo de citas</h1>
            <p className="lead">
              Gestiona {monthLabel}, confirma preagendamientos, asigna precios por especialidad y coordina las notificaciones del equipo.
            </p>
            <p className="dashboard-month-copy">
              Sesion activa: {adminProfile.name || adminProfile.email || adminProfile.cedula}
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
            <button type="button" className="secondary-button dashboard-icon-button" onClick={logoutAdmin}>
              <Icon name="logout" />
              Cerrar sesion
            </button>
            {showHomeLink ? (
              <Link className="ghost-link" href={homeHref}>
                Volver al portal principal
              </Link>
            ) : null}
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}
        {feedback ? <p className="success">{feedback}</p> : null}
        {loading ? (
          <div className="dashboard-loading-banner" aria-live="polite">
            <div className="dashboard-loading-bar" />
            <div className="dashboard-loading-copy">
              <span className="dashboard-loading-spinner" />
              <strong>Actualizando dashboard</strong>
              <small>Estamos cargando citas, agenda y configuracion del mes seleccionado.</small>
            </div>
          </div>
        ) : null}

        <div className="dashboard-summary-ribbon">
          <article className={`status-card compact-card dashboard-kpi ${loading ? 'dashboard-kpi-loading' : ''}`}>
            <span className="dashboard-kpi-icon dashboard-kpi-icon-blue">
              <Icon name="calendar" />
            </span>
            <p className="status-label">Total de horarios</p>
            <strong>{summary?.total ?? 0}</strong>
            <span>Disponibles: {summary?.byStatus?.available || 0}</span>
          </article>
          <article className={`status-card compact-card dashboard-kpi ${loading ? 'dashboard-kpi-loading' : ''}`}>
            <span className="dashboard-kpi-icon dashboard-kpi-icon-amber">
              <Icon name="clock" />
            </span>
            <p className="status-label">Por confirmar</p>
            <strong>{summary?.byStatus?.prebooked || 0}</strong>
            <span>Confirmados: {summary?.byStatus?.booked || 0}</span>
          </article>
          <article className={`status-card compact-card dashboard-kpi ${loading ? 'dashboard-kpi-loading' : ''}`}>
            <span className="dashboard-kpi-icon dashboard-kpi-icon-purple">
              <Icon name="activity" />
            </span>
            <p className="status-label">Especialidades activas</p>
            <strong>{activeSpecialtiesCount}</strong>
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
                    <Icon name={item.icon} className="dashboard-nav-icon" />
                    <span className="dashboard-nav-copy">
                      <span>{item.label}</span>
                      <small>{item.description}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="dashboard-sidebar-card">
              <p className="dashboard-sidebar-title">Resumen rapido</p>
              <p className={`sidebar-note ${loading ? 'sidebar-note-loading' : ''}`}>
                {loading
                  ? 'Cargando informacion de la agenda...'
                  : `Estas consultando la ${monthLabel} con ${pendingAppointments.length} cita(s) por revisar.`}
              </p>
              <p className="dashboard-sync-note">
                Ultima actualizacion: {formatUpdatedAtLabel(lastUpdatedAt)}
              </p>
            </div>
          </aside>

          <div className={`dashboard-content ${loading ? 'dashboard-content-loading' : ''}`}>
            {renderActiveSection()}
          </div>
        </div>
      </section>
    </main>
  );
}
