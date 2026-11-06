import Head from 'next/head';
import '../styles/globals.css';
import '../styles/ui.css';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/logo-corazon.png" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
