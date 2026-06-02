export const mapBenefit = (assignment, metadata) => ({
  benefitId: metadata.benefitId,
  title: metadata.title,
  description: metadata.description,
  image: metadata.image,
  discountPercentage: metadata.discountPercentage,
  validUntil: metadata.validUntil,
  status: metadata.status,
  assignedAt: assignment.assignedAt,
  viewed: assignment.viewed ?? false
});

export const mapBenefitDetail = (assignment, metadata) => ({
  ...mapBenefit(assignment, metadata),
  terms: metadata.terms
});
