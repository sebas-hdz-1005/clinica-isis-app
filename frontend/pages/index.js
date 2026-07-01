import Link from 'next/link';
import { useState } from 'react';

export default function HomePage() {
  const [cedula, setCedula] = useState('1234567890');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function validarPaciente() {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

      if (!baseUrl) {
        throw new Error('Falta NEXT_PUBLIC_API_BASE_URL en el frontend.');
      }

      const response = await fetch(`${baseUrl}/validar?cedula=${encodeURIComponent(cedula)}`);
      const data = await response.json();

      setResult({
        status: response.status,
        body: data
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">Clinica ISIS</p>
        <h1>Portal operativo</h1>
        <p className="lead">
          Accede al validador de pacientes, al dashboard administrativo de citas y al blog institucional desde un mismo frente.
        </p>

        <div className="inline-link-row quick-links-row">
          <Link href="/dashboard/citas/">Abrir dashboard de citas</Link>
          <Link href="/blog/">Ver blog institucional</Link>
        </div>

        <label htmlFor="cedula">Cedula</label>
        <input
          id="cedula"
          value={cedula}
          onChange={(event) => setCedula(event.target.value)}
          placeholder="Ingresa una cedula"
        />

        <button onClick={validarPaciente} disabled={loading}>
          {loading ? 'Consultando...' : 'Validar paciente'}
        </button>

        {error ? <p className="error">{error}</p> : null}

        {result ? (
          <pre className="response">{JSON.stringify(result, null, 2)}</pre>
        ) : null}
      </section>
    </main>
  );
}
