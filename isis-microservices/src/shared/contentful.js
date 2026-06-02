import { ENV } from "./constants.js";
import { AppError, ERROR_CODES } from "./errors.js";
import { mapContentfulBlogDetail, mapContentfulBlogSummary } from "./blog-mapper.js";

const baseUrl = () =>
  `https://cdn.contentful.com/spaces/${ENV.CONTENTFUL_SPACE_ID}/environments/${ENV.CONTENTFUL_ENVIRONMENT}`;

const requestContentful = async (path, params = {}) => {
  if (!ENV.CONTENTFUL_SPACE_ID || !ENV.CONTENTFUL_ACCESS_TOKEN) {
    throw new AppError(ERROR_CODES.CONTENTFUL_PROVIDER_ERROR, "Contentful no está configurado.", 500);
  }
  const url = new URL(`${baseUrl()}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${ENV.CONTENTFUL_ACCESS_TOKEN}` }
  });
  if (!response.ok) {
    throw new AppError(ERROR_CODES.CONTENTFUL_PROVIDER_ERROR, "Error consultando Contentful.", 502);
  }
  return response.json();
};

const resolveIncludes = (payload) => {
  const assets = new Map((payload.includes?.Asset || []).map((asset) => [asset.sys.id, asset]));
  return payload.items.map((entry) => {
    const imageRef = entry.fields.image?.sys?.id;
    return {
      ...entry,
      fields: {
        ...entry.fields,
        image: imageRef ? assets.get(imageRef) : entry.fields.image
      }
    };
  });
};

export const listBlogs = async ({ limit, skip }) => {
  const payload = await requestContentful("/entries", {
    content_type: ENV.CONTENTFUL_BLOG_CONTENT_TYPE,
    limit,
    skip,
    order: "-fields.publishedAt",
    include: 1
  });
  return {
    items: resolveIncludes(payload).map(mapContentfulBlogSummary),
    pagination: {
      limit: payload.limit,
      skip: payload.skip,
      total: payload.total
    }
  };
};

export const getBlogBySlug = async (slug) => {
  const payload = await requestContentful("/entries", {
    content_type: ENV.CONTENTFUL_BLOG_CONTENT_TYPE,
    "fields.slug": slug,
    limit: 1,
    include: 1
  });
  const [entry] = resolveIncludes(payload);
  if (!entry) throw new AppError(ERROR_CODES.BLOG_NOT_FOUND, "La noticia solicitada no existe.", 404);
  return mapContentfulBlogDetail(entry);
};
