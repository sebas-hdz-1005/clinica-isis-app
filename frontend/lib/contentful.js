const CONTENTFUL_BASE_URL = 'https://cdn.contentful.com';
const { localBlogPosts } = require('./local-blog-posts');

function getConfig() {
  return {
    spaceId: process.env.CONTENTFUL_SPACE_ID,
    environment: process.env.CONTENTFUL_ENVIRONMENT || 'master',
    accessToken: process.env.CONTENTFUL_ACCESS_TOKEN
  };
}

function getAssetMap(includes = {}) {
  const assets = includes.Asset || [];
  return assets.reduce((accumulator, asset) => {
    accumulator[asset.sys.id] = asset;
    return accumulator;
  }, {});
}

function normalizeSlug(value, fallbackId) {
  const rawValue = String(value || '').trim().toLowerCase();
  const normalized = rawValue
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalized) {
    return normalized;
  }

  return fallbackId || 'sin-slug';
}

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');
}

function richTextToPlainText(node) {
  if (!node) {
    return '';
  }

  if (node.nodeType === 'text') {
    return node.value || '';
  }

  const children = node.content || [];
  return children.map((child) => richTextToPlainText(child)).join(' ').replace(/\s+/g, ' ').trim();
}

function getExcerpt(content) {
  const text = richTextToPlainText(content);

  if (!text) {
    return 'Contenido disponible para consultar desde Contentful.';
  }

  if (text.length <= 120) {
    return text;
  }

  return `${text.slice(0, 117).trim()}...`;
}

function getReadingTime(content) {
  const text = richTextToPlainText(content);
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const minutes = Math.max(1, Math.ceil(words / 180));
  return `${minutes} min`;
}

function mapBlogEntry(entry, assetMap) {
  const fields = entry.fields || {};
  const imageId = fields.image?.sys?.id;
  const asset = imageId ? assetMap[imageId] : null;
  const content = fields.content || null;
  const slug = normalizeSlug(fields.slug, entry.sys.id);
  const urlPath = `/blog/${slug}/`;
  const siteUrl = getSiteUrl();
  const publishedAt = fields.publishedAt || fields.createdAt || null;
  const summary = fields.summary || '';

  return {
    id: entry.sys.id,
    title: fields.title || 'Sin titulo',
    slug,
    urlPath,
    absoluteUrl: siteUrl ? `${siteUrl}${urlPath}` : '',
    content,
    createdAt: publishedAt,
    excerpt: summary || getExcerpt(content),
    readingTime: getReadingTime(content),
    category: fields.category || 'Noticias',
    image: asset
      ? {
          title: asset.fields?.title || '',
          url: asset.fields?.file?.url ? `https:${asset.fields.file.url}` : null
        }
      : null
  };
}

function mergeEntries(remoteEntries = [], fallbackEntries = []) {
  const merged = [...remoteEntries];
  const knownSlugs = new Set(remoteEntries.map((entry) => entry.slug));

  fallbackEntries.forEach((entry) => {
    if (!knownSlugs.has(entry.slug)) {
      merged.push(entry);
    }
  });

  return merged.sort((left, right) => {
    const leftDate = new Date(left.createdAt || 0).getTime();
    const rightDate = new Date(right.createdAt || 0).getTime();
    return rightDate - leftDate;
  });
}

async function getBlogEntries() {
  const { spaceId, environment, accessToken } = getConfig();

  if (!spaceId || !accessToken) {
    if (localBlogPosts.length) {
      return mergeEntries([], localBlogPosts);
    }

    throw new Error('Faltan variables de entorno de Contentful.');
  }

  const url = `${CONTENTFUL_BASE_URL}/spaces/${spaceId}/environments/${environment}/entries?content_type=blogPost&include=2&order=-fields.publishedAt`;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Contentful respondio ${response.status}: ${errorText}`);
    }

    const payload = await response.json();
    const assetMap = getAssetMap(payload.includes);
    const remoteEntries = (payload.items || []).map((entry) => mapBlogEntry(entry, assetMap));
    return mergeEntries(remoteEntries, localBlogPosts);
  } catch (error) {
    if (localBlogPosts.length) {
      return mergeEntries([], localBlogPosts);
    }

    throw error;
  }
}

async function getBlogEntryBySlug(slug) {
  const entries = await getBlogEntries();
  return entries.find((entry) => entry.slug === slug) || null;
}

async function getBlogSlugs() {
  const entries = await getBlogEntries();
  return entries.map((entry) => entry.slug);
}

module.exports = {
  getBlogEntries,
  getBlogEntryBySlug,
  getBlogSlugs
};
