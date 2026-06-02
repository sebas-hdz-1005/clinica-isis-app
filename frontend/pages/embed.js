export default function EmbedPage() {
  return (
    <main className="page">
      <section className="card embed-card">
        <p className="eyebrow">Embed</p>
        <h1>Blog embebible</h1>
        <iframe
          title="Clinica ISIS Blog"
          src="/blog/embed/"
          className="embed-frame"
          loading="lazy"
        />
      </section>
    </main>
  );
}
