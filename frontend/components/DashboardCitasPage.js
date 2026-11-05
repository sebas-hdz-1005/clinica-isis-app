import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildAuthHeaders, clearAdminSession, loadAdminSession, saveAdminSession } from '../lib/admin-session';
import Icon from './Icon';

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
  {
    id: 'confirmaciones',
    label: 'Citas',
    title: 'Citas del mes',
    description: 'Confirma preagendamientos, gestiona las citas asignadas y agenda desde el panel.',
    icon: 'checkCircle'
  },
  {
    id: 'disponibilidad',
    label: 'Agenda activa',
    title: 'Agenda activa',
    description: 'Elige qué especialidades, médicos y días puede reservar el paciente en la app.',
    icon: 'activity'
  },
  {
    id: 'precios',
    label: 'Precios',
    title: 'Precios por especialidad',
    description: 'Define el valor de la cita para cada especialidad.',
    icon: 'dollarSign'
  },
  {
    id: 'beneficios',
    label: 'Beneficios',
    title: 'Beneficios Isis Gold Card',
    description: 'Busca un usuario por cédula y marca los beneficios que ya utilizó.',
    icon: 'gift'
  },
  {
    id: 'alertas',
    label: 'Alertas push',
    title: 'Enviar alertas',
    description: 'Envía notificaciones push a los pacientes con la app instalada.',
    icon: 'bell'
  },
  {
    id: 'agenda',
    label: 'Cargar agenda',
    title: 'Cargar agenda del mes',
    description: 'Importa el archivo de agenda y revisa las últimas cargas.',
    icon: 'upload'
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    title: 'Configuración general',
    description: 'Precio base, duración de cada espacio y datos internos de notificación.',
    icon: 'sliders'
  }
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

function formatDayLabel(date) {
  if (!date) {
    return '';
  }

  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC'
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatShortDateTime(date, time) {
  if (!date || !time) {
    return 'Horario pendiente';
  }

  const day = new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  }).format(new Date(`${date}T00:00:00Z`));

  return `${day} · ${formatTimeLabel(time)}`;
}

function formatTimeLabel(time) {
  const [hours = '00', minutes = '00'] = String(time || '').split(':');
  return new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(2000, 0, 1, Number(hours), Number(minutes))));
}

function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return '?';
  }

  return `${parts[0][0]}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatImportStatus(status) {
  if (status === 'completed') {
    return 'Completada';
  }

  if (status === 'completed_with_warnings') {
    return 'Con advertencias';
  }

  if (status === 'completed_with_conflicts') {
    return 'Con conflictos';
  }

  return status || 'Sin estado';
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
    return 'Por confirmar';
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
  const [confirmTab, setConfirmTab] = useState('pendientes');
  const [agendaSearch, setAgendaSearch] = useState('');
  const [expandedSpecialties, setExpandedSpecialties] = useState([]);

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
    if (!feedback) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setFeedback(''), 7000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

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
    if (
      typeof window !== 'undefined' &&
      !window.confirm('¿Seguro que quieres cancelar esta cita? El horario quedará libre de nuevo.')
    ) {
      return;
    }

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
      <div className="admin-reschedule">
        <div className="ui-field">
          <label htmlFor={`${prefix}-slot-${appointmentId}`}>Nuevo horario</label>
          <select
            id={`${prefix}-slot-${appointmentId}`}
            className="ui-select"
            value={rescheduleForm.slotId}
            onChange={(event) =>
              setRescheduleForm((current) => ({ ...current, slotId: event.target.value }))
            }
          >
            <option value="">
              {availableSlots.length ? 'Selecciona un horario disponible' : 'No hay horarios con los filtros actuales'}
            </option>
            {availableSlots.map((slot) => (
              <option key={slot.slotId} value={slot.slotId}>
                {`${formatDateTimeLabel(slot.date, slot.startTime)} · ${slot.specialist} · ${slot.specialty}`}
              </option>
            ))}
          </select>
          <p className="ui-hint">Los horarios salen de la pestaña Agendar desde el panel.</p>
        </div>

        <div className="ui-field">
          <label htmlFor={`${prefix}-notes-${appointmentId}`}>Nota interna</label>
          <input
            id={`${prefix}-notes-${appointmentId}`}
            className="ui-input"
            value={rescheduleForm.notes}
            onChange={(event) =>
              setRescheduleForm((current) => ({ ...current, notes: event.target.value }))
            }
            placeholder="Motivo del cambio"
          />
        </div>

        <button
          type="button"
          className="ui-btn"
          onClick={() => rescheduleAppointment(appointmentId)}
          disabled={reschedulingId === appointmentId || !rescheduleForm.slotId}
        >
          {reschedulingId === appointmentId ? 'Guardando...' : 'Guardar cambio'}
        </button>
      </div>
    );
  }

  function renderManageActions(appointment) {
    const isRescheduling = rescheduleTargetId === appointment.appointmentId;

    return (
      <div className="admin-appt-actions">
        <button
          type="button"
          className="ui-btn ui-btn-sm ui-btn-danger"
          onClick={() => cancelAppointmentFromAdmin(appointment.appointmentId)}
          disabled={cancellingId === appointment.appointmentId}
        >
          {cancellingId === appointment.appointmentId ? 'Cancelando...' : 'Cancelar'}
        </button>
        <button
          type="button"
          className="ui-btn ui-btn-sm ui-btn-secondary"
          onClick={() => {
            setRescheduleTargetId(isRescheduling ? '' : appointment.appointmentId);
            setRescheduleForm({ slotId: '', notes: '' });
          }}
        >
          <Icon name="calendar" />
          {isRescheduling ? 'Cerrar' : 'Cambiar horario'}
        </button>
        {appointment.appointmentStatus === 'prebooked' ? (
          <button
            type="button"
            className="ui-btn ui-btn-sm"
            onClick={() => reviewAppointment(appointment.appointmentId, 'approved')}
            disabled={reviewingId === `${appointment.appointmentId}:approved`}
          >
            <Icon name="check" />
            {reviewingId === `${appointment.appointmentId}:approved` ? 'Confirmando...' : 'Confirmar cita'}
          </button>
        ) : null}
      </div>
    );
  }

  function renderAppointmentCard(appointment, prefix) {
    const isPending = appointment.appointmentStatus === 'prebooked';
    const metaItems = [
      { icon: 'calendar', label: 'Horario', value: formatShortDateTime(appointment.date, appointment.startTime) },
      { icon: 'idCard', label: 'Cédula', value: appointment.cedula },
      { icon: 'phone', label: 'Teléfono', value: appointment.patientPhone },
      { icon: 'mail', label: 'Correo', value: appointment.patientEmail },
      {
        icon: 'dollarSign',
        label: 'Valor',
        value: formatMoney(appointment.appointmentCost, appointment.appointmentCurrency)
      }
    ];

    return (
      <article key={`${prefix}-${appointment.appointmentId}`} className="ui-card admin-appt">
        <div className="admin-appt-head">
          <div>
            <h3>{appointment.patientName || 'Paciente sin nombre registrado'}</h3>
            <p>
              <span className="admin-appt-specialty">{appointment.specialty}</span>
              {appointment.specialist ? ` · ${appointment.specialist}` : ''}
            </p>
          </div>
          <span className={`ui-chip ${isPending ? 'ui-chip-warn' : 'ui-chip-ok'}`}>
            {formatStatusLabel(appointment.appointmentStatus)}
          </span>
        </div>

        <dl className="admin-appt-meta">
          {metaItems.map((item) => (
            <div key={item.label}>
              <Icon name={item.icon} />
              <span>
                <dt>{item.label}</dt>
                <dd className={item.value ? '' : 'admin-muted'}>{item.value || 'Sin dato'}</dd>
              </span>
            </div>
          ))}
        </dl>

        {renderManageActions(appointment)}
        {renderRescheduleForm(appointment.appointmentId, prefix)}
      </article>
    );
  }

  function renderEmpty(icon, title, copy) {
    return (
      <div className="ui-empty">
        <Icon name={icon} />
        <strong>{title}</strong>
        {copy ? <p>{copy}</p> : null}
      </div>
    );
  }

  function renderPendientes() {
    if (!pendingAppointments.length) {
      return renderEmpty(
        'inbox',
        'No hay citas por confirmar',
        `Cuando un paciente preagende una cita en ${monthLabel.replace('agenda de ', '')}, aparecerá aquí. El panel se actualiza solo cada 30 segundos.`
      );
    }

    return (
      <div className="admin-list">
        {pendingAppointments.map((appointment) => renderAppointmentCard(appointment, 'pending'))}
      </div>
    );
  }

  function renderAsignadas() {
    return (
      <div className="admin-section">
        <div className="ui-card ui-card-body">
          <form className="admin-filters" onSubmit={(event) => event.preventDefault()}>
            <div className="ui-field">
              <label htmlFor="assigned-cedula-filter">Buscar por cédula</label>
              <div className="ui-input-icon">
                <Icon name="search" />
                <input
                  id="assigned-cedula-filter"
                  className="ui-input"
                  inputMode="numeric"
                  value={assignedFilters.cedula}
                  onChange={(event) =>
                    setAssignedFilters((current) => ({ ...current, cedula: event.target.value }))
                  }
                  placeholder="Ej. 1023899033"
                />
              </div>
            </div>

            <div className="ui-field">
              <label htmlFor="assigned-status-filter">Estado</label>
              <select
                id="assigned-status-filter"
                className="ui-select"
                value={assignedFilters.status}
                onChange={(event) =>
                  setAssignedFilters((current) => ({ ...current, status: event.target.value }))
                }
              >
                <option value="all">Todas</option>
                <option value="booked">Confirmadas</option>
                <option value="prebooked">Por confirmar</option>
              </select>
            </div>

            {hasAssignedFilters ? (
              <button
                type="button"
                className="ui-btn ui-btn-ghost"
                onClick={() => setAssignedFilters({ cedula: '', status: 'all' })}
              >
                Limpiar filtros
              </button>
            ) : null}
          </form>
        </div>

        <p className="ui-hint">
          {filteredScheduledAppointments.length} cita(s)
          {hasAssignedFilters ? ' con los filtros actuales' : ` en la ${monthLabel}`}.
        </p>

        {paginatedScheduledAppointments.length ? (
          <div className="admin-list">
            {paginatedScheduledAppointments.map((appointment) =>
              renderAppointmentCard(appointment, 'scheduled')
            )}
          </div>
        ) : (
          renderEmpty(
            'search',
            hasAssignedFilters ? 'Sin resultados' : 'Aún no hay citas este mes',
            hasAssignedFilters ? 'Prueba con otra cédula o cambia el estado.' : null
          )
        )}

        {filteredScheduledAppointments.length > ASSIGNED_APPOINTMENTS_PAGE_SIZE ? (
          <div className="admin-pagination">
            <button
              type="button"
              className="ui-btn ui-btn-sm ui-btn-secondary"
              onClick={() => setAssignedPage((current) => Math.max(1, current - 1))}
              disabled={assignedPage === 1}
            >
              <Icon name="arrowLeft" />
              Anterior
            </button>
            <span>
              Página {assignedPage} de {assignedTotalPages}
            </span>
            <button
              type="button"
              className="ui-btn ui-btn-sm ui-btn-secondary"
              onClick={() => setAssignedPage((current) => Math.min(assignedTotalPages, current + 1))}
              disabled={assignedPage === assignedTotalPages}
            >
              Siguiente
              <Icon name="arrowRight" />
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderAgendarDesdePanel() {
    const selectedSlot = availableSlots.find((slot) => slot.slotId === assignForm.slotId);
    const sortedSlots = [...availableSlots].sort(
      (left, right) =>
        `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`) ||
        String(left.specialist).localeCompare(String(right.specialist), 'es')
    );
    const slotsByDate = sortedSlots.reduce((groups, slot) => {
      const current = groups.get(slot.date) || [];
      current.push(slot);
      groups.set(slot.date, current);
      return groups;
    }, new Map());

    return (
      <div className="admin-booking">
        <section className="ui-card">
          <div className="ui-card-header">
            <div>
              <h3>Horarios disponibles</h3>
              <p>Elige un horario y completa los datos del paciente.</p>
            </div>
            <button
              type="button"
              className="ui-btn ui-btn-sm ui-btn-secondary"
              onClick={loadAvailableSlots}
              disabled={loadingSlots}
            >
              {loadingSlots ? <span className="ui-spinner" /> : <Icon name="refresh" />}
              Actualizar
            </button>
          </div>
          <div className="ui-card-body admin-section">
            <div className="admin-filters">
              <div className="ui-field">
                <label htmlFor="slot-specialty-filter">Especialidad</label>
                <select
                  id="slot-specialty-filter"
                  className="ui-select"
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

              <div className="ui-field">
                <label htmlFor="slot-date-filter">Fecha</label>
                <input
                  id="slot-date-filter"
                  className="ui-input"
                  type="date"
                  value={slotFilters.date}
                  onChange={(event) =>
                    setSlotFilters((current) => ({ ...current, date: event.target.value }))
                  }
                />
              </div>
            </div>

            {loadingSlots && !availableSlots.length ? (
              <div className="ui-progress" />
            ) : slotsByDate.size ? (
              <div className="admin-slot-days">
                {[...slotsByDate.entries()].map(([date, slots]) => (
                  <div key={date} className="admin-slot-day">
                    <h4>{formatDayLabel(date)}</h4>
                    <div className="admin-slot-grid">
                      {slots.map((slot) => (
                        <button
                          key={slot.slotId}
                          type="button"
                          className={`admin-slot ${assignForm.slotId === slot.slotId ? 'admin-slot-active' : ''}`}
                          onClick={() => setAssignForm((current) => ({ ...current, slotId: slot.slotId }))}
                          aria-pressed={assignForm.slotId === slot.slotId}
                        >
                          <strong>{formatTimeLabel(slot.startTime)}</strong>
                          <span>{slot.specialist}</span>
                          <small>{formatMoney(slot.appointmentCost, slot.appointmentCurrency)}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              renderEmpty('calendar', 'No hay horarios con estos filtros', 'Prueba otra especialidad o quita la fecha.')
            )}
          </div>
        </section>

        <form className="ui-card admin-sticky" onSubmit={assignAppointmentFromAdmin}>
          <div className="ui-card-header">
            <h3>Datos del paciente</h3>
          </div>
          <div className="ui-card-body admin-form">
            <div className={`admin-selected-slot ${selectedSlot ? '' : 'admin-selected-slot-empty'}`}>
              {selectedSlot ? (
                <>
                  <strong>{formatDateTimeLabel(selectedSlot.date, selectedSlot.startTime)}</strong>
                  <span>
                    {selectedSlot.specialist} · {selectedSlot.specialty}
                  </span>
                </>
              ) : (
                <span>Selecciona un horario de la lista.</span>
              )}
            </div>

            <div className="ui-field">
              <label htmlFor="assign-cedula">Cédula *</label>
              <input
                id="assign-cedula"
                className="ui-input"
                inputMode="numeric"
                required
                value={assignForm.cedula}
                onChange={(event) => setAssignForm((current) => ({ ...current, cedula: event.target.value }))}
              />
            </div>

            <div className="ui-field">
              <label htmlFor="assign-name">Nombre completo</label>
              <input
                id="assign-name"
                className="ui-input"
                value={assignForm.patientName}
                onChange={(event) =>
                  setAssignForm((current) => ({ ...current, patientName: event.target.value }))
                }
              />
            </div>

            <div className="ui-field">
              <label htmlFor="assign-phone">Teléfono</label>
              <input
                id="assign-phone"
                className="ui-input"
                inputMode="tel"
                value={assignForm.patientPhone}
                onChange={(event) =>
                  setAssignForm((current) => ({ ...current, patientPhone: event.target.value }))
                }
              />
            </div>

            <div className="ui-field">
              <label htmlFor="assign-email">Correo</label>
              <input
                id="assign-email"
                className="ui-input"
                type="email"
                value={assignForm.patientEmail}
                onChange={(event) =>
                  setAssignForm((current) => ({ ...current, patientEmail: event.target.value }))
                }
              />
            </div>

            <button
              type="submit"
              className="ui-btn ui-btn-block"
              disabled={submittingAssignment || !assignForm.slotId || !assignForm.cedula.trim()}
            >
              {submittingAssignment ? 'Preagendando...' : 'Preagendar cita'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  function renderConfirmaciones() {
    const tabs = [
      { id: 'pendientes', label: 'Por confirmar', count: pendingAppointments.length },
      { id: 'asignadas', label: 'Todas las citas', count: scheduledAppointments.length },
      { id: 'agendar', label: 'Agendar desde el panel' }
    ];

    return (
      <section className="admin-section">
        <div className="ui-tabs" role="tablist" aria-label="Citas">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={confirmTab === tab.id}
              className={`ui-tab ${confirmTab === tab.id ? 'ui-tab-active' : ''}`}
              onClick={() => setConfirmTab(tab.id)}
            >
              {tab.label}
              {tab.count !== undefined ? <span className="ui-badge">{tab.count}</span> : null}
            </button>
          ))}
        </div>

        {confirmTab === 'pendientes' ? renderPendientes() : null}
        {confirmTab === 'asignadas' ? renderAsignadas() : null}
        {confirmTab === 'agendar' ? renderAgendarDesdePanel() : null}
      </section>
    );
  }

  function renderPrecios() {
    if (!specialties.length) {
      return renderEmpty(
        'dollarSign',
        'No hay especialidades para este mes',
        'Revisa la conexión con Software Médico o la agenda del mes seleccionado.'
      );
    }

    return (
      <div className="admin-two-col">
        <section className="ui-card">
          <div className="ui-card-header">
            <div>
              <h3>Valores por especialidad</h3>
              <p>Haz clic en una especialidad para editar su precio.</p>
            </div>
          </div>
          <div className="admin-price-list">
            {specialties.map((item) => (
              <div
                key={item.specialtyKey}
                className={`admin-price-row ${selectedSpecialtyKey === item.specialtyKey ? 'admin-price-row-active' : ''}`}
              >
                <div>
                  <strong>{item.specialty}</strong>
                  <small>
                    {item.byStatus?.prebooked || 0} por confirmar · {item.byStatus?.booked || 0} confirmadas
                  </small>
                </div>
                <span className="admin-price">{formatMoney(item.appointmentCost, item.appointmentCurrency)}</span>
                <button
                  type="button"
                  className="ui-btn ui-btn-sm ui-btn-secondary"
                  onClick={() => setSelectedSpecialtyKey(item.specialtyKey)}
                >
                  Editar
                </button>
              </div>
            ))}
          </div>
        </section>

        <form className="ui-card admin-sticky" onSubmit={updateMonthPricing}>
          <div className="ui-card-header">
            <h3>Editar precio</h3>
          </div>
          <div className="ui-card-body admin-form">
            <div className="ui-field">
              <label htmlFor="pricing-specialty">Especialidad</label>
              <select
                id="pricing-specialty"
                className="ui-select"
                value={selectedSpecialtyKey}
                onChange={(event) => setSelectedSpecialtyKey(event.target.value)}
              >
                {specialties.map((item) => (
                  <option key={item.specialtyKey} value={item.specialtyKey}>
                    {item.specialty}
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-form-grid">
              <div className="ui-field">
                <label htmlFor="pricing-cost">Valor de la cita</label>
                <input
                  id="pricing-cost"
                  className="ui-input"
                  inputMode="numeric"
                  value={pricingForm.appointmentCost}
                  onChange={(event) =>
                    setPricingForm((current) => ({ ...current, appointmentCost: event.target.value }))
                  }
                />
              </div>

              <div className="ui-field">
                <label htmlFor="pricing-currency">Moneda</label>
                <input
                  id="pricing-currency"
                  className="ui-input"
                  value={pricingForm.appointmentCurrency}
                  onChange={(event) =>
                    setPricingForm((current) => ({ ...current, appointmentCurrency: event.target.value }))
                  }
                />
              </div>
            </div>

            <p className="ui-hint">
              Vista previa: <strong>{formatMoney(pricingForm.appointmentCost, pricingForm.appointmentCurrency || 'COP')}</strong>
            </p>

            <button type="submit" className="ui-btn ui-btn-block" disabled={savingPricing}>
              {savingPricing ? 'Guardando...' : 'Guardar precio'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  function renderBeneficios() {
    return (
      <section className="admin-section">
        <form className="ui-card ui-card-body admin-filters" onSubmit={searchUserBenefits}>
          <div className="ui-field">
            <label htmlFor="benefit-user-cedula">Cédula del usuario</label>
            <div className="ui-input-icon">
              <Icon name="search" />
              <input
                id="benefit-user-cedula"
                className="ui-input"
                inputMode="numeric"
                value={benefitCedula}
                onChange={(event) => setBenefitCedula(event.target.value)}
                placeholder="Ingresa la cédula"
              />
            </div>
          </div>
          <button type="submit" className="ui-btn" disabled={loadingBenefits}>
            {loadingBenefits ? 'Buscando...' : 'Buscar usuario'}
          </button>
        </form>

        {benefitUserData ? (
          <>
            <section className="ui-card admin-user-card">
              <div className="admin-user">
                <span className="admin-avatar">{getInitials(benefitUserData.user.name)}</span>
                <div>
                  <h3>{benefitUserData.user.name || 'Sin nombre registrado'}</h3>
                  <p>
                    C.C. {benefitUserData.user.cedula}
                    {benefitUserData.user.email ? ` · ${benefitUserData.user.email}` : ''}
                  </p>
                </div>
              </div>
              <div className="admin-benefit-meta">
                <span className="ui-chip ui-chip-ok">{benefitUserData.summary.active} disponibles</span>
                <span className="ui-chip">{benefitUserData.summary.inactive} utilizados</span>
              </div>
            </section>

            {benefitUserData.benefits.length ? (
              <div className="admin-benefits">
                {benefitUserData.benefits.map((benefit) => (
                  <article
                    key={benefit.benefitId}
                    className={`ui-card admin-benefit ${benefit.active ? '' : 'admin-benefit-used'}`}
                  >
                    <div className="admin-benefit-head">
                      <span className={`ui-chip ${benefit.active ? 'ui-chip-ok' : ''}`}>
                        {benefit.active ? 'Disponible' : 'Utilizado'}
                      </span>
                      {benefit.discountPercentage ? (
                        <span className="ui-chip ui-chip-accent">{benefit.discountPercentage}% dto.</span>
                      ) : null}
                    </div>
                    <h3>{benefit.title}</h3>
                    <p>{benefit.description}</p>
                    <div className="admin-benefit-meta">
                      {benefit.includedUses > 1 ? <span className="ui-chip">{benefit.includedUses} servicios</span> : null}
                      {benefit.durationMinutes ? <span className="ui-chip">{benefit.durationMinutes} min</span> : null}
                      {!benefit.active && benefit.inactiveAt ? (
                        <span className="ui-chip">Usado: {formatUpdatedAtLabel(benefit.inactiveAt)}</span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={`ui-btn ui-btn-sm ${benefit.active ? 'ui-btn-danger' : 'ui-btn-secondary'}`}
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
            ) : (
              renderEmpty('gift', 'Este usuario no tiene beneficios asignados')
            )}
          </>
        ) : loadingBenefits ? (
          <div className="ui-progress" />
        ) : (
          renderEmpty('gift', 'Busca un usuario', 'Ingresa la cédula para ver sus beneficios disponibles y utilizados.')
        )}
      </section>
    );
  }

  function renderAlertas() {
    return (
      <div className="admin-two-col">
        <form className="ui-card" onSubmit={sendCampaign}>
          <div className="ui-card-header">
            <h3>Nueva alerta</h3>
          </div>
          <div className="ui-card-body admin-form">
            <div className="ui-field">
              <label htmlFor="campaign-title">Título</label>
              <input
                id="campaign-title"
                className="ui-input"
                maxLength={80}
                required
                value={campaign.title}
                onChange={(event) => setCampaign((current) => ({ ...current, title: event.target.value }))}
                placeholder="Ej. Abrimos agenda de diciembre"
              />
            </div>

            <div className="ui-field">
              <label htmlFor="campaign-message">Mensaje</label>
              <textarea
                id="campaign-message"
                className="ui-textarea"
                maxLength={240}
                required
                value={campaign.message}
                onChange={(event) => setCampaign((current) => ({ ...current, message: event.target.value }))}
              />
              <p className="ui-hint">{campaign.message.length}/240 caracteres</p>
            </div>

            <div className="ui-field">
              <label htmlFor="campaign-type">Tipo de envío</label>
              <select
                id="campaign-type"
                className="ui-select"
                value={campaign.type}
                onChange={(event) => setCampaign((current) => ({ ...current, type: event.target.value }))}
              >
                <option value="general">General / blogs</option>
              </select>
              <p className="ui-hint">Por ahora solo se pueden enviar alertas generales.</p>
            </div>

            <div className="admin-form-actions">
              <button type="submit" className="ui-btn" disabled={sendingCampaign}>
                <Icon name="bell" />
                {sendingCampaign ? 'Enviando...' : 'Enviar alerta'}
              </button>
            </div>
          </div>
        </form>

        <section className="ui-card">
          <div className="ui-card-header">
            <h3>Vista previa</h3>
          </div>
          <div className="ui-card-body">
            <div className="ui-toast" style={{ animation: 'none' }}>
              <Icon name="bell" />
              <p>
                <strong>{campaign.title || 'Título de la alerta'}</strong>
                <br />
                {campaign.message || 'Así verá el paciente el mensaje en su celular.'}
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderAgenda() {
    return (
      <div className="admin-two-col">
        <form className="ui-card" onSubmit={uploadAgenda}>
          <div className="ui-card-header">
            <div>
              <h3>Importar archivo</h3>
              <p>Se cargará en la {monthLabel}.</p>
            </div>
          </div>
          <div className="ui-card-body admin-form">
            <label className="admin-dropzone" htmlFor="agenda-file">
              <Icon name="upload" />
              <strong>{agendaFile ? agendaFile.name : 'Selecciona el archivo de agenda'}</strong>
              <span>Excel (.xlsx, .xls) o CSV</span>
              <input
                id="agenda-file"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => setAgendaFile(event.target.files?.[0] || null)}
              />
            </label>

            <button type="submit" className="ui-btn ui-btn-block" disabled={uploadingAgenda || !agendaFile}>
              {uploadingAgenda ? 'Importando...' : 'Cargar agenda'}
            </button>
          </div>
        </form>

        <section className="ui-card">
          <div className="ui-card-header">
            <h3>Últimas importaciones</h3>
          </div>
          {imports.length ? (
            <div>
              {imports.map((item) => (
                <div key={item.importId} className="admin-import">
                  <div>
                    <strong>{item.fileName}</strong>
                    <small>{formatUpdatedAtLabel(item.createdAt)}</small>
                  </div>
                  <span className={`ui-chip ${String(item.status).startsWith('completed') ? 'ui-chip-ok' : 'ui-chip-warn'}`}>
                    {formatImportStatus(item.status)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="ui-card-body">{renderEmpty('upload', 'Sin importaciones este mes')}</div>
          )}
        </section>
      </div>
    );
  }

  function toggleExpandedSpecialty(specialtyId) {
    setExpandedSpecialties((current) =>
      current.includes(specialtyId)
        ? current.filter((id) => id !== specialtyId)
        : [...current, specialtyId]
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
    const search = normalizeSearch(agendaSearch);
    const visibleSpecialties = softwareMedicoSpecialties
      .map((specialty) => {
        const specialtyMatches = !search || normalizeSearch(specialty.specialty).includes(search);
        const doctors = (specialty.medicos || []).filter(
          (doctor) => specialtyMatches || normalizeSearch(formatDoctorName(doctor)).includes(search)
        );
        return { specialty, doctors, visible: specialtyMatches || doctors.length > 0 };
      })
      .filter((item) => item.visible);

    if (!softwareMedicoSpecialties.length) {
      return renderEmpty(
        'activity',
        'El catálogo de Software Médico no está disponible',
        'Actualiza el panel e intenta nuevamente en unos minutos.'
      );
    }

    return (
      <form className="admin-section" onSubmit={saveSoftwareMedicoConfig}>
        <div className="ui-card admin-toolbar">
          <div className="ui-input-icon">
            <Icon name="search" />
            <input
              className="ui-input"
              value={agendaSearch}
              onChange={(event) => setAgendaSearch(event.target.value)}
              placeholder="Buscar especialidad o médico"
              aria-label="Buscar especialidad o médico"
            />
          </div>
          <div className="admin-toolbar-stats" aria-live="polite">
            <span>
              <strong>{activeSpecialtyIds.length}</strong> de {softwareMedicoSpecialties.length} especialidades activas
            </span>
            <span>
              <strong>{activeDoctorCount}</strong> médicos visibles
            </span>
          </div>
          <div className="admin-toolbar-actions">
            <button
              type="button"
              className="ui-btn ui-btn-sm ui-btn-ghost"
              onClick={() =>
                setExpandedSpecialties(
                  expandedSpecialties.length
                    ? []
                    : softwareMedicoSpecialties.map((specialty) => String(specialty.specialtyId))
                )
              }
            >
              {expandedSpecialties.length ? 'Contraer todas' : 'Expandir todas'}
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-sm ui-btn-secondary"
              onClick={() => setAllSoftwareMedicoSpecialties(true)}
            >
              Activar todas
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-sm ui-btn-secondary"
              onClick={() => {
                if (window.confirm('¿Desactivar todas las especialidades? Los pacientes no podrán agendar hasta que actives alguna.')) {
                  setAllSoftwareMedicoSpecialties(false);
                }
              }}
            >
              Desactivar todas
            </button>
          </div>
        </div>

        {!visibleSpecialties.length
          ? renderEmpty('search', 'Sin resultados', `No hay especialidades ni médicos que coincidan con "${agendaSearch}".`)
          : null}

        <div className="admin-list">
          {visibleSpecialties.map(({ specialty, doctors }) => {
            const specialtyId = String(specialty.specialtyId);
            const allDoctors = specialty.medicos || [];
            const isActive = activeSpecialtyIds.includes(specialtyId);
            const isOpen = Boolean(search) || expandedSpecialties.includes(specialtyId);
            const activeDoctorIds = softwareMedicoForm.medicosActivosPorEspecialidad[specialtyId] || [];
            const activeWeekdays = softwareMedicoForm.diasActivosPorEspecialidad[specialtyId] || [];
            const weekdaySummary =
              activeWeekdays.length === WEEKDAYS.length
                ? 'todos los días'
                : activeWeekdays.length
                  ? WEEKDAYS.filter((day) => activeWeekdays.includes(day.value)).map((day) => day.label).join(', ')
                  : 'sin días';

            return (
              <article
                key={specialtyId}
                className={`ui-card admin-specialty ${isOpen ? 'admin-specialty-open' : ''} ${isActive ? '' : 'admin-specialty-inactive'}`}
              >
                <div className="admin-specialty-head">
                  <label className="ui-switch" title={isActive ? 'Desactivar especialidad' : 'Activar especialidad'}>
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(event) => toggleSoftwareMedicoSpecialty(specialtyId, event.target.checked)}
                      aria-label={`${isActive ? 'Desactivar' : 'Activar'} ${specialty.specialty}`}
                    />
                    <span className="ui-switch-track" />
                  </label>
                  <button
                    type="button"
                    className="admin-specialty-title"
                    onClick={() => toggleExpandedSpecialty(specialtyId)}
                    aria-expanded={isOpen}
                  >
                    <strong>{specialty.specialty}</strong>
                    <small>
                      {isActive
                        ? `${activeDoctorIds.length} de ${allDoctors.length} médicos · ${weekdaySummary}`
                        : 'Oculta para los pacientes'}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="admin-specialty-toggle"
                    onClick={() => toggleExpandedSpecialty(specialtyId)}
                    aria-label={isOpen ? 'Contraer' : 'Expandir'}
                  >
                    <Icon name="chevronDown" />
                  </button>
                </div>

                {isOpen ? (
                  <div className="admin-specialty-body">
                    <div>
                      <div className="admin-subhead">
                        <span>Días de atención</span>
                        <div>
                          <button
                            type="button"
                            className="ui-btn ui-btn-sm ui-btn-ghost"
                            disabled={!isActive}
                            onClick={() => setAllSoftwareMedicoWeekdays(specialtyId, true)}
                          >
                            Todos
                          </button>
                          <button
                            type="button"
                            className="ui-btn ui-btn-sm ui-btn-ghost"
                            disabled={!isActive}
                            onClick={() => setAllSoftwareMedicoWeekdays(specialtyId, false)}
                          >
                            Ninguno
                          </button>
                        </div>
                      </div>
                      <div className="admin-weekdays">
                        {WEEKDAYS.map((weekday) => {
                          const checked = activeWeekdays.includes(weekday.value);
                          return (
                            <label
                              key={weekday.value}
                              className={`ui-chip-option ${checked ? 'ui-chip-option-active' : ''} ${isActive ? '' : 'ui-chip-option-disabled'}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!isActive}
                                onChange={(event) =>
                                  toggleSoftwareMedicoWeekday(specialtyId, weekday.value, event.target.checked)
                                }
                              />
                              {weekday.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="admin-subhead">
                        <span>Médicos ({activeDoctorIds.length}/{allDoctors.length})</span>
                        {allDoctors.length ? (
                          <div>
                            <button
                              type="button"
                              className="ui-btn ui-btn-sm ui-btn-ghost"
                              disabled={!isActive}
                              onClick={() =>
                                setAllSoftwareMedicoDoctors(specialtyId, allDoctors.map((doctor) => doctor.id))
                              }
                            >
                              Todos
                            </button>
                            <button
                              type="button"
                              className="ui-btn ui-btn-sm ui-btn-ghost"
                              disabled={!isActive}
                              onClick={() => setAllSoftwareMedicoDoctors(specialtyId, [])}
                            >
                              Ninguno
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {doctors.length ? (
                        <div className="admin-doctors">
                          {doctors.map((doctor) => {
                            const doctorId = String(doctor.id);
                            const doctorActive = activeDoctorIds.includes(doctorId);
                            const doctorRange = softwareMedicoForm.rangosActivosPorMedico[specialtyId]?.[doctorId] || {
                              fechaInicio: '',
                              fechaFin: ''
                            };

                            return (
                              <div
                                key={doctorId}
                                className={`admin-doctor ${doctorActive && isActive ? '' : 'admin-doctor-off'}`}
                              >
                                <label className="ui-check">
                                  <input
                                    type="checkbox"
                                    checked={doctorActive}
                                    disabled={!isActive}
                                    onChange={(event) =>
                                      toggleSoftwareMedicoDoctor(specialtyId, doctorId, event.target.checked)
                                    }
                                  />
                                  <span>{formatDoctorName(doctor)}</span>
                                </label>
                                <div className="admin-doctor-range">
                                  <span>Desde</span>
                                  <input
                                    type="date"
                                    className="ui-input"
                                    aria-label={`Fecha inicial de ${formatDoctorName(doctor)}`}
                                    value={doctorRange.fechaInicio}
                                    max={doctorRange.fechaFin || undefined}
                                    disabled={!isActive || !doctorActive}
                                    onChange={(event) =>
                                      updateSoftwareMedicoDoctorRange(specialtyId, doctorId, 'fechaInicio', event.target.value)
                                    }
                                  />
                                  <span>hasta</span>
                                  <input
                                    type="date"
                                    className="ui-input"
                                    aria-label={`Fecha final de ${formatDoctorName(doctor)}`}
                                    value={doctorRange.fechaFin}
                                    min={doctorRange.fechaInicio || undefined}
                                    disabled={!isActive || !doctorActive}
                                    onChange={(event) =>
                                      updateSoftwareMedicoDoctorRange(specialtyId, doctorId, 'fechaFin', event.target.value)
                                    }
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="ui-hint">No hay médicos asociados a esta especialidad.</p>
                      )}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        <div className={`ui-card admin-savebar ${softwareMedicoDirty ? 'admin-savebar-dirty' : ''}`}>
          <div>
            <strong>{softwareMedicoDirty ? 'Tienes cambios sin guardar' : 'Todo guardado'}</strong>
            <span>Los pacientes solo verán las especialidades, médicos y días activos.</span>
          </div>
          <button type="submit" className="ui-btn" disabled={savingSoftwareMedico || !softwareMedicoDirty}>
            {savingSoftwareMedico ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    );
  }

  function renderConfiguracion() {
    return (
      <div className="admin-two-col">
        <form className="ui-card" onSubmit={saveSettings}>
          <div className="ui-card-header">
            <h3>Ajustes de agenda</h3>
          </div>
          <div className="ui-card-body admin-form">
            <div className="admin-form-grid">
              <div className="ui-field">
                <label htmlFor="settings-cost">Precio base de respaldo</label>
                <input
                  id="settings-cost"
                  className="ui-input"
                  inputMode="numeric"
                  value={settingsForm.appointmentCost}
                  onChange={(event) =>
                    setSettingsForm((current) => ({ ...current, appointmentCost: event.target.value }))
                  }
                />
                <p className="ui-hint">Se usa cuando la especialidad no tiene precio propio.</p>
              </div>

              <div className="ui-field">
                <label htmlFor="settings-currency">Moneda</label>
                <input
                  id="settings-currency"
                  className="ui-input"
                  value={settingsForm.appointmentCurrency}
                  onChange={(event) =>
                    setSettingsForm((current) => ({ ...current, appointmentCurrency: event.target.value }))
                  }
                />
              </div>

              <div className="ui-field">
                <label htmlFor="settings-slot">Duración de cada cita (min)</label>
                <input
                  id="settings-slot"
                  className="ui-input"
                  inputMode="numeric"
                  value={settingsForm.slotMinutes}
                  onChange={(event) =>
                    setSettingsForm((current) => ({ ...current, slotMinutes: event.target.value }))
                  }
                />
              </div>

              <div className="ui-field">
                <label htmlFor="settings-topic">Tema de notificaciones push</label>
                <input
                  id="settings-topic"
                  className="ui-input"
                  value={settingsForm.notificationsTopic}
                  onChange={(event) =>
                    setSettingsForm((current) => ({ ...current, notificationsTopic: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="ui-field">
              <label htmlFor="settings-email">Correo interno de seguimiento</label>
              <input
                id="settings-email"
                className="ui-input"
                type="email"
                value={settingsForm.notificationEmail}
                onChange={(event) =>
                  setSettingsForm((current) => ({ ...current, notificationEmail: event.target.value }))
                }
              />
              <p className="ui-hint">Recibe un aviso cada vez que un paciente preagenda una cita.</p>
            </div>

            <div className="admin-form-actions">
              <button type="submit" className="ui-btn" disabled={savingSettings}>
                {savingSettings ? 'Guardando...' : 'Guardar configuración'}
              </button>
            </div>
          </div>
        </form>

        <div className="ui-alert ui-alert-info">
          <Icon name="alert" />
          <span>
            <strong>¿No llegan los correos de preagendamiento?</strong> Verifica en AWS SES que el remitente o el
            dominio de {settingsForm.notificationEmail || 'notificacionesapp@clinicaisis.com'} esté verificado.
          </span>
        </div>
      </div>
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

  function renderToasts() {
    if (!error && !feedback) {
      return null;
    }

    return (
      <div className="ui-toasts" aria-live="polite">
        {error ? (
          <div className="ui-toast ui-toast-error" role="alert">
            <Icon name="alert" />
            <p>{error}</p>
            <button type="button" onClick={() => setError('')} aria-label="Cerrar mensaje">
              <Icon name="x" />
            </button>
          </div>
        ) : null}
        {feedback ? (
          <div className="ui-toast">
            <Icon name="checkCircle" />
            <p>{feedback}</p>
            <button type="button" onClick={() => setFeedback('')} aria-label="Cerrar mensaje">
              <Icon name="x" />
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (!authReady) {
    return (
      <main className="admin-boot">
        <span className="ui-spinner" />
        Validando acceso...
      </main>
    );
  }

  if (!session?.accessToken || !adminProfile) {
    return (
      <main className="admin-login">
        <section className="ui-card admin-login-card">
          <div className="admin-brand">
            <span className="site-logo">
              <Icon name="logo" />
            </span>
            <div>
              <strong>Clínica Isis</strong>
              <small>Panel administrativo</small>
            </div>
          </div>

          <h1>Iniciar sesión</h1>
          <p>Ingresa con tu usuario administrador para gestionar citas y agenda.</p>

          {error ? (
            <p className="ui-alert" role="alert">
              <Icon name="alert" />
              {error}
            </p>
          ) : null}

          <form className="admin-form" onSubmit={loginAdmin}>
            <div className="ui-field">
              <label htmlFor="admin-cedula">Cédula</label>
              <div className="ui-input-icon">
                <Icon name="user" />
                <input
                  id="admin-cedula"
                  className="ui-input"
                  inputMode="numeric"
                  required
                  value={loginForm.cedula}
                  onChange={(event) => setLoginForm((current) => ({ ...current, cedula: event.target.value }))}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="ui-field">
              <label htmlFor="admin-password">Contraseña</label>
              <div className="ui-input-icon">
                <Icon name="lock" />
                <input
                  id="admin-password"
                  className="ui-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="ui-input-action"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} />
                </button>
              </div>
            </div>

            <button type="submit" className="ui-btn ui-btn-lg ui-btn-block" disabled={loggingIn}>
              {loggingIn ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          {showHomeLink ? (
            <Link className="ui-btn ui-btn-ghost admin-login-back" href={homeHref}>
              <Icon name="arrowLeft" />
              Volver al portal
            </Link>
          ) : null}
        </section>
      </main>
    );
  }

  const activeNavItem = NAV_ITEMS.find((item) => item.id === activeSection) || NAV_ITEMS[0];
  const adminName = adminProfile.name || adminProfile.email || adminProfile.cedula;

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="site-logo">
            <Icon name="logo" />
          </span>
          <div>
            <strong>Clínica Isis</strong>
            <small>Panel administrativo</small>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Secciones del panel">
          <p className="admin-nav-label">Menú</p>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`admin-nav-item ${activeSection === item.id ? 'admin-nav-item-active' : ''}`}
              onClick={() => setActiveSection(item.id)}
              aria-current={activeSection === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === 'confirmaciones' && pendingAppointments.length ? (
                <span className="ui-badge" title="Citas por confirmar">
                  {pendingAppointments.length}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-user">
            <span className="admin-avatar">{getInitials(adminName)}</span>
            <div>
              <strong>{adminName}</strong>
              <small>Administrador</small>
            </div>
          </div>
          <div className="admin-sidebar-actions">
            {showHomeLink ? (
              <Link className="ui-btn ui-btn-sm ui-btn-secondary" href={homeHref} title="Ir al portal">
                <Icon name="home" />
                <span>Portal</span>
              </Link>
            ) : null}
            <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary" onClick={logoutAdmin} title="Cerrar sesión">
              <Icon name="logout" />
              <span>Salir</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <h1>{activeNavItem.title}</h1>
            <p>{activeNavItem.description}</p>
          </div>
          <div className="admin-topbar-actions">
            <span className="admin-sync">
              {loading ? 'Actualizando...' : `Actualizado ${formatUpdatedAtLabel(lastUpdatedAt)}`}
            </span>
            <button
              type="button"
              className="ui-btn ui-btn-secondary ui-icon-btn"
              onClick={() => loadAll(month)}
              disabled={loading}
              title="Actualizar"
              aria-label="Actualizar"
            >
              {loading ? <span className="ui-spinner" /> : <Icon name="refresh" />}
            </button>
            <div className="admin-month">
              <label htmlFor="dashboard-month">Mes</label>
              <input
                id="dashboard-month"
                className="ui-input"
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
              />
            </div>
          </div>
        </header>

        {loading ? <div className="ui-progress" aria-hidden="true" /> : null}

        <div className="admin-kpis">
          <article className={`ui-card admin-kpi ${loading ? 'admin-kpi-loading' : ''}`}>
            <span className="admin-kpi-icon admin-kpi-icon-warn">
              <Icon name="clock" />
            </span>
            <div>
              <p>Por confirmar</p>
              <strong>{pendingAppointments.length}</strong>
              <small>{summary?.byStatus?.booked || 0} confirmadas este mes</small>
            </div>
          </article>
          <article className={`ui-card admin-kpi ${loading ? 'admin-kpi-loading' : ''}`}>
            <span className="admin-kpi-icon">
              <Icon name="calendar" />
            </span>
            <div>
              <p>Citas del mes</p>
              <strong>{scheduledAppointments.length}</strong>
              <small>{monthLabel.replace('agenda de ', '')}</small>
            </div>
          </article>
          <article className={`ui-card admin-kpi ${loading ? 'admin-kpi-loading' : ''}`}>
            <span className="admin-kpi-icon admin-kpi-icon-ink">
              <Icon name="stethoscope" />
            </span>
            <div>
              <p>Especialidades</p>
              <strong>{activeSpecialtiesCount}</strong>
              <small>activas de {specialties.length} en Software Médico</small>
            </div>
          </article>
        </div>

        {renderActiveSection()}
      </main>

      {renderToasts()}
    </div>
  );
}
