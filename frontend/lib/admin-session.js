const STORAGE_KEY = 'clinica-isis-admin-session';

export function loadAdminSession() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAdminSession(session) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearAdminSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

export function buildAuthHeaders(session, headers = {}) {
  return {
    ...headers,
    ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {})
  };
}
