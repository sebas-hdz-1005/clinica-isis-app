import Link from 'next/link';
import { useState } from 'react';
import Icon from '../components/Icon';
import SiteLayout from '../components/SiteLayout';

const ACTIONS = [
  {
    href: '/citas/',
    icon: 'calendar',
    title: 'Agendar una cita',
    description: 'Elige especialidad, médico y horario disponible. Te contactaremos para confirmar.',
    cta: 'Agendar ahora'
  },
  {
    href: '/blog/',
    icon: 'book',
    title: 'Blog y preguntas frecuentes',
    description: 'Noticias de la clínica, recomendaciones para tu consulta y políticas institucionales.',
    cta: 'Ver publicaciones'
  },
  {
    href: '/dashboard/citas/',
    icon: 'shield',
    title: 'Panel administrativo',
    description: 'Para el equipo de Clínica Isis: confirmar citas, agenda activa, precios y alertas.',
    cta: 'Ingresar'
  }
];

function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length
    ? `${parts[0][0]}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase()
    : '?';
}

// El endpoint /validar es publico: en pantalla solo se muestran datos parciales.
function maskEmail(email) {
  const [user = '', domain = ''] = String(email || '').split('@');
  return domain ? `${user.slice(0, 2)}${'•'.repeat(Math.max(user.length - 2, 3))}@${domain}` : '';
}

function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `•••• ${digits.slice(-4)}` : '';
}

export default function HomePage() {
  const [cedula, setCedula] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function validarPaciente(event) {
    event.preventDefault();
    const normalizedCedula = cedula.trim();

    if (!normalizedCedula) {
      setError('Ingresa un número de cédula.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

      if (!baseUrl) {
        throw new Error('Falta NEXT_PUBLIC_API_BASE_URL en el frontend.');
      }

      const response = await fetch(`${baseUrl}/validar?cedula=${encodeURIComponent(normalizedCedula)}`);
      const payload = await response.json();
      const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;

      if (!response.ok) {
        throw new Error(payload?.message || 'No fue posible validar la cédula.');
      }

      setResult(data);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SiteLayout title="Inicio">
      <section className="home-hero">
        <div className="site-container">
          <p className="home-eyebrow">
            <Icon name="stethoscope" />
            Clínica Isis
          </p>
          <h1>
            Tu salud y bienestar, <span>a un clic</span> de tu próxima cita.
          </h1>
          <p>
            Agenda tu valoración en medicina general, odontología, cosmetología, cirugía plástica y más
            especialidades. Te contactamos para confirmar el horario.
          </p>
          <div className="home-hero-actions">
            <Link href="/citas/" className="ui-btn ui-btn-lg">
              <Icon name="calendar" />
              Agendar cita
            </Link>
            <Link href="/blog/" className="ui-btn ui-btn-lg ui-btn-secondary">
              Conocer la clínica
            </Link>
          </div>
        </div>
      </section>

      <div className="site-container">
        <div className="home-grid">
          {ACTIONS.map((action) => (
            <Link key={action.href} href={action.href} className="ui-card home-action">
              <span className="home-action-icon">
                <Icon name={action.icon} />
              </span>
              <h2>{action.title}</h2>
              <p>{action.description}</p>
              <span className="home-action-link">
                {action.cta}
                <Icon name="arrowRight" />
              </span>
            </Link>
          ))}
        </div>

        <section className="home-section">
          <div className="ui-card ui-card-body home-validator">
            <div>
              <h2 className="home-section-title">Validar paciente</h2>
              <p className="home-section-copy">
                Consulta si una cédula está registrada en la app de Clínica Isis y el estado de su cuenta.
              </p>
              <form className="home-validator-form" onSubmit={validarPaciente}>
                <div className="ui-field">
                  <label htmlFor="cedula">Número de cédula</label>
                  <div className="ui-input-icon">
                    <Icon name="idCard" />
                    <input
                      id="cedula"
                      className="ui-input"
                      inputMode="numeric"
                      value={cedula}
                      onChange={(event) => setCedula(event.target.value)}
                      placeholder="Ej. 1020304050"
                    />
                  </div>
                </div>
                <button type="submit" className="ui-btn" disabled={loading}>
                  {loading ? <span className="ui-spinner" /> : <Icon name="search" />}
                  {loading ? 'Consultando...' : 'Validar'}
                </button>
              </form>
            </div>

            <div aria-live="polite">
              {error ? (
                <p className="ui-alert" role="alert">
                  <Icon name="alert" />
                  {error}
                </p>
              ) : null}

              {result?.exists ? (
                <div className="home-result">
                  <span className="home-result-avatar">{getInitials(result.name)}</span>
                  <div>
                    <h3>{result.name || 'Paciente sin nombre registrado'}</h3>
                    <span className={`ui-chip ${result.isActive ? 'ui-chip-ok' : 'ui-chip-warn'}`}>
                      {result.isActive ? 'Cuenta activa' : 'Cuenta inactiva'}
                    </span>
                    <dl>
                      <dt>Cédula</dt>
                      <dd>{result.cedula}</dd>
                      {result.email ? (
                        <>
                          <dt>Correo</dt>
                          <dd>{maskEmail(result.email)}</dd>
                        </>
                      ) : null}
                      {result.phone ? (
                        <>
                          <dt>Teléfono</dt>
                          <dd>{maskPhone(result.phone)}</dd>
                        </>
                      ) : null}
                    </dl>
                  </div>
                </div>
              ) : null}

              {result && !result.exists ? (
                <div className="home-result home-result-missing">
                  <span className="home-result-avatar">
                    <Icon name="user" />
                  </span>
                  <div>
                    <h3>Cédula no registrada</h3>
                    <p>
                      No encontramos un usuario con la cédula {result.cedula}. Puede agendar igualmente desde{' '}
                      <Link href="/citas/">Agendar cita</Link>.
                    </p>
                  </div>
                </div>
              ) : null}

              {!result && !error ? (
                <div className="ui-empty">
                  <Icon name="idCard" />
                  <p>El resultado de la validación aparecerá aquí.</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </SiteLayout>
  );
}
