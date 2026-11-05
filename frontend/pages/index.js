import Link from 'next/link';
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

export default function HomePage() {
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
      </div>
    </SiteLayout>
  );
}
