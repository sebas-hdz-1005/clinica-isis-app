import { getBlogEntries } from '../../lib/contentful';

function getRelativeDate(dateValue) {
  if (!dateValue) {
    return 'Sin fecha';
  }

  const now = new Date();
  const date = new Date(dateValue);
  const diffMs = now.getTime() - date.getTime();
  const hours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));

  if (hours < 24) {
    return `Hace ${hours} hora${hours === 1 ? '' : 's'}`;
  }

  const days = Math.max(1, Math.round(hours / 24));
  return `Hace ${days} dia${days === 1 ? '' : 's'}`;
}

export default function BlogIndexPage({ posts, error, embedded }) {
  return (
    <main className={embedded ? 'embed-page' : 'page'}>
      <section className={embedded ? 'embed-wrapper blog-feed-shell' : 'blog-shell blog-feed-shell'}>
        <div className="blog-header compact-header elevated-blog-header">
          <p className="eyebrow">Clinica Isis</p>
          <h1>Blog y contenidos institucionales</h1>
          <p className="lead">
            Noticias, preguntas frecuentes y politicas publicadas en un formato mas claro, ordenado y facil de consultar.
          </p>
          <div className="blog-header-badges">
            <span>Lectura rapida</span>
            <span>URLs publicas</span>
            <span>Contenido institucional</span>
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="blog-grid mobile-feed">
          {posts.map((post) => (
            <article className="news-card editorial-card" key={post.id}>
              <a className="news-card-link" href={post.urlPath} aria-label={`Leer ${post.title}`}>
                <div className="news-visual editorial-visual">
                  {post.image?.url ? (
                    <img src={post.image.url} alt={post.image.title || post.title} />
                  ) : (
                    <div className="news-placeholder editorial-placeholder">
                      <span>Clinica Isis</span>
                    </div>
                  )}
                </div>

                <div className="news-copy editorial-copy">
                  <div className="news-meta editorial-meta">
                    <span className="brand-pill">
                      <span className="brand-mark" />
                      Clinica Isis
                    </span>
                    <span className="meta-dot">|</span>
                    <span>{getRelativeDate(post.createdAt)}</span>
                  </div>

                  <p className="news-category">{post.category}</p>
                  <h2>{post.title}</h2>
                  <p className="news-excerpt">{post.excerpt}</p>
                  <div className="card-footer">
                    <span className="news-link">Leer articulo</span>
                    <span className="news-reading">{post.readingTime}</span>
                  </div>
                </div>
              </a>

              <div className="news-url-block">
                <p className="news-url-label">URL publica</p>
                <p className="news-url">{post.absoluteUrl || post.urlPath}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export async function getStaticProps() {
  try {
    const posts = await getBlogEntries();

    return {
      props: {
        posts,
        error: '',
        embedded: false
      }
    };
  } catch (error) {
    return {
      props: {
        posts: [],
        error: error.message,
        embedded: false
      }
    };
  }
}
