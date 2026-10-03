export type AssessmentComponent = {
  name: string;
  maxScore: number;
  weight: number;
};

export const ASSESSMENT_COMPONENTS = [
  { name: "CAT1", maxScore: 50, weight: 0.15 },
  { name: "CAT2", maxScore: 50, weight: 0.15 },
  { name: "DA1", maxScore: 10, weight: 0.1 },
  { name: "DA2", maxScore: 10, weight: 0.1 },
  { name: "DA3", maxScore: 10, weight: 0.1 },
  { name: "FAT", maxScore: 100, weight: 0.4 },
] as const satisfies readonly AssessmentComponent[];

export function isRawAssessmentScoreValid(score: number, maxScore: number) {
  return (
    Number.isFinite(score) &&
    Number.isFinite(maxScore) &&
    maxScore > 0 &&
    score >= 0 &&
    score <= maxScore
  );
}

export function weightedAssessmentScore(
  score: number,
  component: Pick<AssessmentComponent, "maxScore" | "weight">,
) {
  if (
    !isRawAssessmentScoreValid(score, component.maxScore) ||
    !Number.isFinite(component.weight) ||
    component.weight < 0
  )
    return 0;
  return (score / component.maxScore) * 100 * component.weight;
}
