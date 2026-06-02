import { readFileSync } from "node:fs";

const {
  CONTENTFUL_SPACE_ID,
  CONTENTFUL_ENVIRONMENT = "master",
  CONTENTFUL_MANAGEMENT_TOKEN,
  CONTENTFUL_BLOG_CONTENT_TYPE = "blogPost"
} = process.env;

const apiBase = `https://api.contentful.com/spaces/${CONTENTFUL_SPACE_ID}/environments/${CONTENTFUL_ENVIRONMENT}`;

const required = {
  CONTENTFUL_SPACE_ID,
  CONTENTFUL_MANAGEMENT_TOKEN
};

for (const [key, value] of Object.entries(required)) {
  if (!value) {
    console.error(`${key} es requerido.`);
    process.exit(1);
  }
}

const contentType = JSON.parse(readFileSync(new URL("../contentful/blog-post-content-type.json", import.meta.url), "utf8"));
const posts = JSON.parse(readFileSync(new URL("../contentful/blog-post-seed.json", import.meta.url), "utf8"));

const headers = {
  Authorization: `Bearer ${CONTENTFUL_MANAGEMENT_TOKEN}`,
  "Content-Type": "application/vnd.contentful.management.v1+json"
};

const richText = (paragraphs) => ({
  nodeType: "document",
  data: {},
  content: paragraphs.map((text) => ({
    nodeType: "paragraph",
    data: {},
    content: [
      {
        nodeType: "text",
        value: text,
        marks: [],
        data: {}
      }
    ]
  }))
});

const request = async (path, options = {}) => {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {})
    }
  });
  if (response.status === 404) return null;
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} fallo con ${response.status}: ${body.message || text}`);
  }
  return { body, version: Number(response.headers.get("x-contentful-version") || body.sys?.version || 1) };
};

const ensureContentType = async () => {
  const current = await request(`/content_types/${CONTENTFUL_BLOG_CONTENT_TYPE}`);
  if (!current) {
    const created = await request(`/content_types/${CONTENTFUL_BLOG_CONTENT_TYPE}`, {
      method: "PUT",
      body: JSON.stringify({ ...contentType, name: CONTENTFUL_BLOG_CONTENT_TYPE })
    });
    await request(`/content_types/${CONTENTFUL_BLOG_CONTENT_TYPE}/published`, {
      method: "PUT",
      headers: { "X-Contentful-Version": String(created.version) }
    });
    return;
  }
  if (!current.body.sys.publishedVersion) {
    await request(`/content_types/${CONTENTFUL_BLOG_CONTENT_TYPE}/published`, {
      method: "PUT",
      headers: { "X-Contentful-Version": String(current.version) }
    });
  }
};

const findEntryBySlug = async (slug) => {
  const encodedSlug = encodeURIComponent(slug);
  const result = await request(`/entries?content_type=${CONTENTFUL_BLOG_CONTENT_TYPE}&fields.slug=${encodedSlug}&limit=1`);
  return result?.body?.items?.[0] || null;
};

const upsertPost = async (post) => {
  const existing = await findEntryBySlug(post.slug);
  const entryId = existing?.sys?.id || post.slug;
  const fields = {
    title: { "en-US": post.title },
    slug: { "en-US": post.slug },
    summary: { "en-US": post.summary },
    content: { "en-US": richText(post.content) },
    publishedAt: { "en-US": post.publishedAt }
  };

  const saved = await request(`/entries/${entryId}`, {
    method: "PUT",
    headers: {
      "X-Contentful-Content-Type": CONTENTFUL_BLOG_CONTENT_TYPE,
      ...(existing ? { "X-Contentful-Version": String(existing.sys.version) } : {})
    },
    body: JSON.stringify({ fields })
  });

  const latest = await request(`/entries/${entryId}`);
  await request(`/entries/${entryId}/published`, {
    method: "PUT",
    headers: {
      "X-Contentful-Version": String(latest.version || saved.version)
    }
  });

  return entryId;
};

await ensureContentType();
const ids = [];
for (const post of posts) {
  ids.push(await upsertPost(post));
}

console.log(`Noticias publicadas en Contentful: ${ids.join(", ")}`);
