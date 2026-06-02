import { getBlogEntryBySlug, getBlogSlugs } from '../../lib/contentful';

function renderRichText(node) {
  if (!node) {
    return null;
  }

  if (node.nodeType === 'document') {
    return node.content?.map((child, index) => <div key={index}>{renderRichText(child)}</div>);
  }

  if (node.nodeType === 'paragraph') {
    return <p>{node.content?.map((child, index) => renderRichText({ ...child, key: index }))}</p>;
  }

  if (node.nodeType === 'heading-2') {
    return <h2>{node.content?.map((child, index) => renderRichText({ ...child, key: index }))}</h2>;
  }

  if (node.nodeType === 'unordered-list') {
    return <ul>{node.content?.map((child, index) => <li key={index}>{renderRichText(child)}</li>)}</ul>;
  }

  if (node.nodeType === 'list-item') {
    return <>{node.content?.map((child, index) => <span key={index}>{renderRichText(child)}</span>)}</>;
  }

  if (node.nodeType === 'text') {
    return node.value;
  }

  return node.content?.map((child, index) => <span key={index}>{renderRichText(child)}</span>) || null;
}

export default function BlogDetailPage({ post }) {
  if (!post) {
    return (
      <main className="page">
        <section className="blog-shell">
          <p className="error">No encontramos el articulo solicitado.</p>
          <a className="back-link" href="/blog/">
            Volver al blog
          </a>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="blog-shell article-shell">
        <a className="back-link" href="/blog/">
          Volver al blog
        </a>

        <article className="article-detail article-page article-story">
          <div className="news-meta editorial-meta article-meta">
            <span className="brand-pill">
              <span className="brand-mark" />
              Clinica Isis
            </span>
            <span className="meta-dot">|</span>
            <span>{post.createdAt ? new Date(post.createdAt).toLocaleDateString('es-CO') : 'Sin fecha'}</span>
          </div>

          <p className="eyebrow">{post.category}</p>
          <h1>{post.title}</h1>
          <p className="post-date">
            Tiempo de lectura
            {' | '}
            {post.readingTime}
          </p>
          <p className="article-url">{post.absoluteUrl || post.urlPath}</p>
          {post.image?.url ? (
            <img
              className="article-detail-image"
              src={post.image.url}
              alt={post.image.title || post.title}
            />
          ) : null}
          <div className="rich-text">{renderRichText(post.content)}</div>
        </article>
      </section>
    </main>
  );
}

export async function getStaticPaths() {
  const slugs = await getBlogSlugs();

  return {
    paths: slugs.map((slug) => ({
      params: { slug }
    })),
    fallback: false
  };
}

export async function getStaticProps({ params }) {
  const post = await getBlogEntryBySlug(params.slug);

  if (!post) {
    return {
      notFound: true
    };
  }

  return {
    props: {
      post
    }
  };
}
