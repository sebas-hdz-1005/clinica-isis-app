const assetUrl = (asset) => {
  const url = asset?.fields?.file?.url;
  if (!url) return null;
  return url.startsWith("//") ? `https:${url}` : url;
};

const richTextToPlainText = (node) => {
  if (!node) return "";
  if (node.nodeType === "text") return node.value || "";
  return (node.content || []).map(richTextToPlainText).join(" ").replace(/\s+/g, " ").trim();
};

const summaryFor = (entry) => {
  if (entry.fields.summary) return entry.fields.summary;
  const text = richTextToPlainText(entry.fields.content);
  if (!text) return "";
  return text.length > 140 ? `${text.slice(0, 137).trim()}...` : text;
};

export const mapContentfulBlogSummary = (entry) => ({
  id: entry.sys.id,
  slug: entry.fields.slug,
  title: entry.fields.title,
  summary: summaryFor(entry),
  image: assetUrl(entry.fields.image),
  publishedAt: entry.fields.publishedAt || entry.fields.createdAt || entry.sys.createdAt
});

export const mapContentfulBlogDetail = (entry) => ({
  ...mapContentfulBlogSummary(entry),
  content: {
    type: "richText",
    json: entry.fields.content || {}
  }
});
