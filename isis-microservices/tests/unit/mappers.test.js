import test from "node:test";
import assert from "node:assert/strict";
import { mapContentfulBlogDetail, mapContentfulBlogSummary } from "../../src/shared/blog-mapper.js";
import { mapBenefit, mapBenefitDetail } from "../../src/shared/benefit-mapper.js";

const contentfulEntry = {
  sys: { id: "entry-id", createdAt: "2026-05-04T10:00:00Z" },
  fields: {
    slug: "noticia",
    title: "Noticia",
    summary: "Resumen",
    image: { fields: { file: { url: "//images.ctfassets.net/file.jpg" } } },
    content: { nodeType: "document" }
  }
};

test("mapContentfulBlogSummary maps compact blog response", () => {
  assert.deepEqual(mapContentfulBlogSummary(contentfulEntry), {
    id: "entry-id",
    slug: "noticia",
    title: "Noticia",
    summary: "Resumen",
    image: "https://images.ctfassets.net/file.jpg",
    publishedAt: "2026-05-04T10:00:00Z"
  });
});

test("mapContentfulBlogDetail includes rich text wrapper", () => {
  assert.equal(mapContentfulBlogDetail(contentfulEntry).content.type, "richText");
});

test("benefit mappers combine assignment and metadata", () => {
  const assignment = { assignedAt: "2026-05-04T10:00:00Z", viewed: false };
  const metadata = {
    benefitId: "benefit-001",
    title: "Descuento",
    description: "Descripción",
    terms: "Términos",
    image: "https://image",
    discountPercentage: 20,
    validUntil: "2026-06-30",
    status: "ACTIVE"
  };
  assert.equal(mapBenefit(assignment, metadata).viewed, false);
  assert.equal(mapBenefitDetail(assignment, metadata).terms, "Términos");
});
