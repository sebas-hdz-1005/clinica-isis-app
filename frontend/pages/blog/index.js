import { getBlogEntries } from '../../lib/contentful';

export default function BlogIndexPage({ posts, error, embedded }) {
  return (
    <main className={embedded ? 'embed-page' : 'page'}>
      <section className={embedded ? 'embed-wrapper' : 'blog-shell'}>
        <div className="blog-header">
          <p className="eyebrow">Contentful</p>
          <h1>Noticias y blog</h1>
          <p className="lead">Cada articulo publicado en Contentful queda disponible con una URL publica dentro de la aplicacion.</p>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="blog-grid">
          {posts.map((post) => (
            <article className="news-card" key={post.id}>
              <div className="news-copy">
                <p className="news-meta">
                  <span>{post.category}</span>
                  <span>|</span>
                  <span>{post.createdAt ? new Date(post.createdAt).toLocaleDateString('es-CO') : 'Sin fecha'}</span>
                </p>
                <h2>{post.title}</h2>
                <p className="news-excerpt">{post.excerpt}</p>
                <p className="news-reading">Lectura de {post.readingTime}</p>
                <a className="news-link" href={post.urlPath}>
                  Abrir articulo
                </a>
                <p className="news-url">{post.absoluteUrl || post.urlPath}</p>
              </div>

              <div className="news-visual">
                {post.image?.url ? (
                  <img src={post.image.url} alt={post.image.title || post.title} />
                ) : (
                  <div className="news-placeholder">
                    <span>Blog</span>
                  </div>
                )}
                <div className="news-accent" />
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
