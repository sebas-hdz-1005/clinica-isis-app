import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Icon from './Icon';

const NAV_LINKS = [
  { href: '/citas/', label: 'Agendar cita' },
  { href: '/blog/', label: 'Blog' }
];

export default function SiteLayout({ title, children }) {
  const router = useRouter();

  return (
    <div className="site">
      <Head>
        <title>{title ? `${title} | Clínica Isis` : 'Clínica Isis'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" className="site-brand" aria-label="Clínica Isis, inicio">
            <img src="/logo-clinica-isis.png" alt="Clínica Isis" className="site-brand-logo" />
          </Link>

          <nav className="site-nav" aria-label="Principal">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={router.asPath.startsWith(link.href) ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
            <Link href="/dashboard/citas/" className="ui-btn ui-btn-sm ui-btn-secondary">
              <Icon name="lock" />
              Panel admin
            </Link>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="site-footer">
        <div className="site-container">
          <span>© {new Date().getFullYear()} Clínica Isis</span>
          <Link href="/blog/politica-de-privacidad/">Política de privacidad</Link>
        </div>
      </footer>
    </div>
  );
}
