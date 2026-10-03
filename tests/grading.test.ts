import { describe, expect, test } from "vitest";
import {
  calculateCumulativeZScore,
  calculateMean,
  calculateRequiredFatScore,
  calculateStandardDeviation,
  calculateTargetScore,
  calculateZScore,
  detectAtRiskStudent,
  detectOutlier,
  getGradeTrajectory,
} from "@/lib/grading";
import {
  cumulativeStudentZScore,
  projectedClassTotals,
  weightedCourseScore,
} from "@/lib/grading/course-analytics";
import {
  ASSESSMENT_COMPONENTS,
  isRawAssessmentScoreValid,
} from "@/lib/grading/assessment-components";

describe("relative grading statistics", () => {
  test("calculates mean and population standard deviation while ignoring missing marks", () => {
    expect(calculateMean([1, 2, 3, null, undefined])).toBe(2);
    expect(calculateMean([null, undefined])).toBeNull();
    expect(calculateStandardDeviation([1, 2, 3])).toBeCloseTo(Math.sqrt(2 / 3));
    expect(calculateStandardDeviation([8])).toBe(0);
  });

  test("calculates Z scores and handles zero deviation and missing marks", () => {
    expect(calculateZScore(15, 10, 5)).toBe(1);
    expect(calculateZScore(10, 10, 0)).toBe(0);
    expect(calculateZScore(11, 10, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(calculateZScore(9, 10, 0)).toBe(Number.NEGATIVE_INFINITY);
    expect(calculateZScore(null, 10, 5)).toBeNull();
  });

  test("maps trajectory thresholds and missing assessment data", () => {
    expect(getGradeTrajectory(1.5)).toBe("S Grade Trajectory");
    expect(getGradeTrajectory(1)).toBe("A Grade Trajectory");
    expect(getGradeTrajectory(0)).toBe("B/C Grade Trajectory");
    expect(getGradeTrajectory(-0.01)).toBe("Needs Focus");
    expect(getGradeTrajectory(null)).toBe("Insufficient Data");
  });

  test("calculates targets and required FAT scores, including incomplete and impossible targets", () => {
    expect(calculateTargetScore(30, 10, "A")).toBe(40);
    expect(calculateTargetScore(null, 10, "S")).toBeNull();
    expect(calculateRequiredFatScore(20, 45, 0.5)).toMatchObject({
      score: 50,
      attainable: true,
      status: "Attainable",
    });
    expect(calculateRequiredFatScore(50, 45, 0.5)).toMatchObject({
      score: 0,
      alreadyAchieved: true,
      status: "Already achieved",
    });
    expect(calculateRequiredFatScore(0, 60, 0.5)).toMatchObject({
      score: 120,
      attainable: false,
      status: "Unattainable",
    });
    expect(calculateRequiredFatScore(20, 45, 0)).toMatchObject({
      score: null,
      status: "Insufficient data",
    });
    expect(calculateRequiredFatScore(50, 70, 0.4, 100)).toMatchObject({
      score: 50,
      attainable: true,
      status: "Attainable",
    });
  });

  test("detects outliers relative to peer marks and ignores incomplete comparisons", () => {
    expect(detectOutlier(100, [10, 11, 12, 13])).toBe(true);
    expect(detectOutlier(12, [10, 11, 12, 13])).toBe(false);
    expect(detectOutlier(10, [])).toBe(false);
    expect(detectOutlier(11, [10, 10, 10])).toBe(true);
  });

  test("aggregates only available Z scores and identifies both at-risk criteria", () => {
    expect(calculateCumulativeZScore([-1, null, 0])).toBe(-0.5);
    expect(calculateCumulativeZScore([null])).toBeNull();
    expect(detectAtRiskStudent(-1.1, 74)).toEqual({
      atRisk: true,
      reasons: ["Cumulative Z-score is below -1.0", "Attendance is below 75%"],
    });
    expect(detectAtRiskStudent(-1, 75).atRisk).toBe(false);
    expect(detectAtRiskStudent(null, null).atRisk).toBe(false);
    expect(detectAtRiskStudent(Number.NEGATIVE_INFINITY, 90).atRisk).toBe(true);
  });

  test("defines the required six assessment components and validates raw ranges", () => {
    expect(ASSESSMENT_COMPONENTS).toEqual([
      { name: "CAT1", maxScore: 50, weight: 0.15 },
      { name: "CAT2", maxScore: 50, weight: 0.15 },
      { name: "DA1", maxScore: 10, weight: 0.1 },
      { name: "DA2", maxScore: 10, weight: 0.1 },
      { name: "DA3", maxScore: 10, weight: 0.1 },
      { name: "FAT", maxScore: 100, weight: 0.4 },
    ]);
    expect(ASSESSMENT_COMPONENTS.reduce((sum, item) => sum + item.weight, 0)).toBe(1);
    expect(isRawAssessmentScoreValid(0, 10)).toBe(true);
    expect(isRawAssessmentScoreValid(10, 10)).toBe(true);
    expect(isRawAssessmentScoreValid(-0.1, 10)).toBe(false);
    expect(isRawAssessmentScoreValid(10.1, 10)).toBe(false);
    expect(isRawAssessmentScoreValid(Number.NaN, 10)).toBe(false);
  });

  test("converts all six raw components into weighted course points", () => {
    const assessments = ASSESSMENT_COMPONENTS.map((assessment, index) => ({
      ...assessment,
      id: `assessment-${index}`,
    }));
    const maximumScores = Object.fromEntries(
      assessments.map(({ id, maxScore }) => [id, maxScore]),
    );
    expect(weightedCourseScore(assessments, maximumScores)).toBe(100);
    expect(
      weightedCourseScore(
        assessments,
        Object.fromEntries(
          assessments.map(({ id, maxScore }) => [id, maxScore / 2]),
        ),
      ),
    ).toBe(50);
    expect(weightedCourseScore(assessments, { "assessment-0": 50, "assessment-1": 51 })).toBe(15);
  });

  test("uses weighted course points for relative standing and projects missing components", () => {
    const assessments = ASSESSMENT_COMPONENTS.map((assessment, index) => ({
      ...assessment,
      id: `assessment-${index}`,
    }));
    const [cat1, cat2, da1, da2, da3, fat] = assessments;
    const students = [
      { studentId: "one", scores: { [cat1.id]: 40, [cat2.id]: 40, [da1.id]: 8, [da2.id]: 8, [da3.id]: 8, [fat.id]: 80 } },
      { studentId: "two", scores: { [cat1.id]: 30, [cat2.id]: 30, [da1.id]: 6, [da2.id]: 6, [da3.id]: 6, [fat.id]: 60 } },
      { studentId: "three", scores: { [cat1.id]: 20, [cat2.id]: 20, [da1.id]: 4 } },
    ];
    expect(weightedCourseScore(assessments, students[0].scores)).toBeCloseTo(80);
    expect(weightedCourseScore(assessments, students[2].scores)).toBeCloseTo(16);
    expect(
      cumulativeStudentZScore(assessments, students, "one"),
    ).toBeCloseTo(1);
    const current = projectedClassTotals(assessments, students, fat.id, 0);
    const easier = projectedClassTotals(assessments, students, fat.id, -15);
    expect(current[2].score).toBeCloseTo(58);
    expect(easier[2].score).toBeLessThan(current[2].score);
  });
});
