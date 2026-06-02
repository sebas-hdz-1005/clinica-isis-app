import { getBlogEntries } from '../../lib/contentful';

export default function BlogEmbedPage({ posts, error }) {
  return (
    <main className="embed-page">
      <section className="embed-wrapper">
        <div className="blog-header">
          <p className="eyebrow">Contentful</p>
          <h1>Noticias y blog</h1>
          <p className="lead">Vista embebible del contenido publicado en Contentful.</p>
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
        error: ''
      }
    };
  } catch (error) {
    return {
      props: {
        posts: [],
        error: error.message
      }
    };
  }
}
