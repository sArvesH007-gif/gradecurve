export type GradeTarget = "S" | "A" | "B" | "C";
export type GradeTrajectory =
  | "S Grade Trajectory"
  | "A Grade Trajectory"
  | "B/C Grade Trajectory"
  | "Needs Focus"
  | "Insufficient Data";

export type RequiredScoreResult = {
  score: number | null;
  attainable: boolean | null;
  alreadyAchieved: boolean;
  status:
    | "Attainable"
    | "Already achieved"
    | "Already recorded"
    | "Unattainable"
    | "Insufficient data";
};

export type AtRiskResult = { atRisk: boolean; reasons: string[] };

const TARGET_Z: Record<GradeTarget, number> = { S: 1.5, A: 1, B: 0, C: -0.5 };
const finiteScores = (scores: Array<number | null | undefined>) =>
  scores.filter(
    (score): score is number => score != null && Number.isFinite(score),
  );

export function calculateMean(
  scores: Array<number | null | undefined>,
): number | null {
  const values = finiteScores(scores);
  if (values.length === 0) return null;
  return values.reduce((sum, score) => sum + score, 0) / values.length;
}

export function calculateStandardDeviation(
  scores: Array<number | null | undefined>,
): number {
  const values = finiteScores(scores);
  const mean = calculateMean(values);
  if (mean == null || values.length < 2) return 0;
  return Math.sqrt(
    values.reduce((sum, score) => sum + (score - mean) ** 2, 0) / values.length,
  );
}

export function calculateZScore(
  studentScore: number | null | undefined,
  classMean: number | null | undefined,
  standardDeviation: number | null | undefined,
): number | null {
  if (
    studentScore == null ||
    classMean == null ||
    !Number.isFinite(studentScore) ||
    !Number.isFinite(classMean)
  )
    return null;
  const deviation = standardDeviation ?? 0;
  if (!Number.isFinite(deviation) || deviation < 0) return null;
  if (deviation === 0)
    return studentScore === classMean
      ? 0
      : studentScore > classMean
        ? Number.POSITIVE_INFINITY
        : Number.NEGATIVE_INFINITY;
  return (studentScore - classMean) / deviation;
}

export function getGradeTrajectory(
  zScore: number | null | undefined,
): GradeTrajectory {
  if (zScore == null || Number.isNaN(zScore)) return "Insufficient Data";
  if (zScore >= 1.5) return "S Grade Trajectory";
  if (zScore >= 1) return "A Grade Trajectory";
  if (zScore >= 0) return "B/C Grade Trajectory";
  return "Needs Focus";
}

export function calculateTargetScore(
  classMean: number | null | undefined,
  standardDeviation: number | null | undefined,
  target: GradeTarget,
): number | null {
  if (
    classMean == null ||
    !Number.isFinite(classMean) ||
    !Number.isFinite(standardDeviation ?? 0)
  )
    return null;
  return classMean + TARGET_Z[target] * Math.max(0, standardDeviation ?? 0);
}

export function calculateRequiredFatScore(
  currentWeighted: number | null | undefined,
  targetTotal: number | null | undefined,
  fatWeight = 0.5,
  maxScore = 100,
): RequiredScoreResult {
  if (
    currentWeighted == null ||
    targetTotal == null ||
    !Number.isFinite(currentWeighted) ||
    !Number.isFinite(targetTotal) ||
    !Number.isFinite(fatWeight) ||
    fatWeight <= 0 ||
    !Number.isFinite(maxScore) ||
    maxScore <= 0
  )
    return {
      score: null,
      attainable: null,
      alreadyAchieved: false,
      status: "Insufficient data",
    };

  const needed = (targetTotal - currentWeighted) / fatWeight;
  if (needed <= 0)
    return {
      score: 0,
      attainable: true,
      alreadyAchieved: true,
      status: "Already achieved",
    };
  if (needed > maxScore)
    return {
      score: needed,
      attainable: false,
      alreadyAchieved: false,
      status: "Unattainable",
    };
  return {
    score: needed,
    attainable: true,
    alreadyAchieved: false,
    status: "Attainable",
  };
}

export function detectOutlier(
  score: number | null | undefined,
  peerScores: Array<number | null | undefined>,
  sigma = 2,
): boolean {
  if (
    score == null ||
    !Number.isFinite(score) ||
    !Number.isFinite(sigma) ||
    sigma < 0
  )
    return false;
  const peers = finiteScores(peerScores);
  if (peers.length < 2) return false;
  const sorted = [...peers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const deviation = calculateStandardDeviation(peers);
  return deviation === 0
    ? score !== median
    : Math.abs(score - median) > sigma * deviation;
}

export function calculateCumulativeZScore(
  zScores: Array<number | null | undefined>,
): number | null {
  const values = zScores.filter(
    (score): score is number => score != null && !Number.isNaN(score),
  );
  if (values.length === 0) return null;
  const hasPositiveInfinity = values.includes(Number.POSITIVE_INFINITY);
  const hasNegativeInfinity = values.includes(Number.NEGATIVE_INFINITY);
  if (hasPositiveInfinity && hasNegativeInfinity)
    return calculateMean(values.filter(Number.isFinite));
  if (hasPositiveInfinity) return Number.POSITIVE_INFINITY;
  if (hasNegativeInfinity) return Number.NEGATIVE_INFINITY;
  return calculateMean(values);
}

export function detectAtRiskStudent(
  cumulativeZScore: number | null | undefined,
  attendancePercent: number | null | undefined,
): AtRiskResult {
  const reasons: string[] = [];
  if (
    cumulativeZScore != null &&
    !Number.isNaN(cumulativeZScore) &&
    cumulativeZScore < -1
  )
    reasons.push("Cumulative Z-score is below -1.0");
  if (
    attendancePercent != null &&
    Number.isFinite(attendancePercent) &&
    attendancePercent < 75
  )
    reasons.push("Attendance is below 75%");
  return { atRisk: reasons.length > 0, reasons };
}
