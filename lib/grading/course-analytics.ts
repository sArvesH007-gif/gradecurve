import {
  calculateMean,
  calculateStandardDeviation,
  calculateZScore,
  getGradeTrajectory,
} from "@/lib/grading";
import {
  isRawAssessmentScoreValid,
  weightedAssessmentScore,
} from "@/lib/grading/assessment-components";

export type CourseAssessment = {
  id: string;
  name: string;
  maxScore: number;
  weight: number;
};
export type StudentCourseMarks = {
  studentId: string;
  scores: Record<string, number | undefined>;
};

export function cumulativeStudentZScore(
  assessments: CourseAssessment[],
  students: StudentCourseMarks[],
  studentId: string,
  assessmentIds?: string[],
) {
  const student = students.find(
    (candidate) => candidate.studentId === studentId,
  );
  if (!student) return null;
  const includedIds = assessmentIds ?? assessments
    .filter(({ id }) => student.scores[id] != null)
    .map(({ id }) => id);
  if (includedIds.length === 0) return null;
  const comparableStudents = students.filter((candidate) =>
    includedIds.every((id) => candidate.scores[id] != null),
  );
  const studentScore = weightedCourseScore(
    assessments,
    student.scores,
    includedIds,
  );
  const classScores = comparableStudents.map((candidate) =>
    weightedCourseScore(assessments, candidate.scores, includedIds),
  );
  return calculateZScore(
    studentScore,
    calculateMean(classScores),
    calculateStandardDeviation(classScores),
  );
}

export function buildAssessmentAnalytics(
  assessments: CourseAssessment[],
  students: StudentCourseMarks[],
) {
  return assessments.map((assessment) => {
    const classScores = students
      .map((student) => student.scores[assessment.id])
      .filter((score) => score != null);
    const mean = calculateMean(classScores);
    const standardDeviation = calculateStandardDeviation(classScores);
    return {
      ...assessment,
      mean,
      standardDeviation,
      count: classScores.length,
      students: students.map((student) => ({
        studentId: student.studentId,
        score: student.scores[assessment.id] ?? null,
        zScore: calculateZScore(
          student.scores[assessment.id],
          mean,
          standardDeviation,
        ),
        trajectory: getGradeTrajectory(
          calculateZScore(
            student.scores[assessment.id],
            mean,
            standardDeviation,
          ),
        ),
      })),
    };
  });
}

export function weightedCourseScore(
  assessments: CourseAssessment[],
  scores: Record<string, number | undefined>,
  assessmentIds = assessments.map(({ id }) => id),
) {
  let total = 0;
  for (const assessment of assessments) {
    if (!assessmentIds.includes(assessment.id)) continue;
    const score = scores[assessment.id];
    if (score == null || !isRawAssessmentScoreValid(score, assessment.maxScore))
      continue;
    total += weightedAssessmentScore(score, assessment);
  }
  return total;
}

export function projectedClassTotals(
  assessments: CourseAssessment[],
  students: StudentCourseMarks[],
  fatAssessmentId: string,
  difficultyAdjustmentPercent: number,
) {
  const fat = assessments.find(({ id }) => id === fatAssessmentId);
  if (!fat) return [];
  const fatScores = students
    .map(({ scores }) => scores[fatAssessmentId])
    .filter((score) => score != null && Number.isFinite(score));
  const rawFatMean = calculateMean(fatScores);
  if (rawFatMean == null) return [];
  const factor =
    1 + Math.min(15, Math.max(-15, difficultyAdjustmentPercent)) / 100;
  const assessmentMeans = new Map(
    assessments.map((assessment) => [
      assessment.id,
      calculateMean(
        students
          .map(({ scores }) => scores[assessment.id])
          .filter((score) => score != null && Number.isFinite(score)),
      ),
    ]),
  );
  return students.map(({ studentId, scores }) => {
    const adjustedScores = { ...scores };
    for (const assessment of assessments) {
      if (adjustedScores[assessment.id] != null) continue;
      adjustedScores[assessment.id] =
        assessment.id === fatAssessmentId
          ? rawFatMean
          : (assessmentMeans.get(assessment.id) ?? undefined);
    }
    const rawScore = adjustedScores[fatAssessmentId] ?? rawFatMean;
    adjustedScores[fatAssessmentId] = Math.min(
      fat.maxScore,
      Math.max(0, rawScore * factor),
    );
    return {
      studentId,
      score: weightedCourseScore(assessments, adjustedScores),
    };
  });
}
