import "server-only";
import oracledb from "oracledb";
import { calculateMean, calculateStandardDeviation, detectAtRiskStudent } from "@/lib/grading";
import { buildAssessmentAnalytics, cumulativeStudentZScore, projectedClassTotals, weightedCourseScore, type CourseAssessment } from "@/lib/grading/course-analytics";
import { withOracleConnection } from "@/lib/oracle/client";

type StudentProfileRow = { studentId: number; registrationNo: string; semester: number; slotId: number; slotName: string };
type StudentCourseRow = { courseId: number; code: string; name: string; assessmentId: number; assessmentName: string; maxScore: number; weight: number };
type CohortRow = { courseId: number; studentId: number; studentName: string; assessmentId: number; score: number | null };

export async function loadOracleStudentDashboard(userId: string) {
  const oracleUserId = Number(userId);
  if (!Number.isSafeInteger(oracleUserId) || oracleUserId <= 0) return null;
  return withOracleConnection(async (connection) => {
    const profileResult = await connection.execute<StudentProfileRow>(
      `SELECT sp.student_id AS "studentId", sp.registration_no AS "registrationNo",
              sp.semester AS "semester", sl.slot_id AS "slotId", sl.name AS "slotName"
       FROM student_profiles sp JOIN class_slots sl ON sl.slot_id = sp.active_slot_id
       WHERE sp.user_id = :userId`,
      { userId: oracleUserId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const profile = profileResult.rows?.[0];
    if (!profile) return null;

    const coursesResult = await connection.execute<StudentCourseRow>(
      `SELECT c.course_id AS "courseId", c.code AS "code", c.name AS "name",
              a.assessment_id AS "assessmentId", a.name AS "assessmentName",
              a.max_score AS "maxScore", a.weight AS "weight"
       FROM enrollments e
       JOIN courses c ON c.course_id = e.course_id
       JOIN assessments a ON a.course_id = c.course_id
       WHERE e.student_id = :studentId
       ORDER BY c.code, a.name`,
      { studentId: profile.studentId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const courseRows = coursesResult.rows ?? [];
    const cohortResult = await connection.execute<CohortRow>(
      `SELECT e.course_id AS "courseId", sp.student_id AS "studentId",
              u.full_name AS "studentName", a.assessment_id AS "assessmentId",
              m.score AS "score"
       FROM enrollments e
       JOIN student_profiles sp ON sp.student_id = e.student_id
       JOIN users u ON u.user_id = sp.user_id
       JOIN assessments a ON a.course_id = e.course_id
       LEFT JOIN marks m ON m.student_id = sp.student_id AND m.assessment_id = a.assessment_id
       WHERE e.slot_id = :slotId
         AND e.course_id IN (SELECT course_id FROM enrollments WHERE student_id = :studentId)
       ORDER BY e.course_id, sp.student_id, a.assessment_id`,
      { slotId: profile.slotId, studentId: profile.studentId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const attendanceResult = await connection.execute<{ courseId: number; present: number }>(
      `SELECT course_id AS "courseId", present AS "present"
       FROM attendance WHERE student_id = :studentId`,
      { studentId: profile.studentId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    const cohorts = new Map<string, Map<string, { studentId: string; name: string; scores: Record<string, number | undefined> }>>();
    for (const row of cohortResult.rows ?? []) {
      const courseId = String(row.courseId);
      const students = cohorts.get(courseId) ?? new Map();
      const studentId = String(row.studentId);
      const student = students.get(studentId) ?? { studentId, name: row.studentName, scores: {} };
      if (row.score != null) student.scores[String(row.assessmentId)] = Number(row.score);
      students.set(studentId, student);
      cohorts.set(courseId, students);
    }
    const attendanceByCourse = new Map<string, number[]>();
    for (const row of attendanceResult.rows ?? []) {
      const courseId = String(row.courseId);
      attendanceByCourse.set(courseId, [...(attendanceByCourse.get(courseId) ?? []), Number(row.present)]);
    }

    const courses = new Map<string, { id: string; code: string; name: string; assessments: CourseAssessment[] }>();
    for (const row of courseRows) {
      const id = String(row.courseId);
      const course = courses.get(id) ?? { id, code: row.code, name: row.name, assessments: [] };
      course.assessments.push({ id: String(row.assessmentId), name: row.assessmentName, maxScore: Number(row.maxScore), weight: Number(row.weight) });
      courses.set(id, course);
    }

    const courseData = [...courses.values()].map((course) => {
      const classmates = [...(cohorts.get(course.id)?.values() ?? [])];
      const me = classmates.find((student) => student.studentId === String(profile.studentId));
      if (!me) return null;
      const results = buildAssessmentAnalytics(course.assessments, classmates);
      const assessedIds = course.assessments.filter(({ id }) => me.scores[id] != null).map(({ id }) => id);
      const comparableScores = assessedIds.length
        ? classmates.filter((student) => assessedIds.every((id) => student.scores[id] != null)).map((student) => weightedCourseScore(course.assessments, student.scores, assessedIds))
        : [];
      const currentZ = cumulativeStudentZScore(course.assessments, classmates, me.studentId, assessedIds);
      const peers = currentZ != null && currentZ < 0
        ? classmates.filter((student) => student.studentId !== me.studentId).map((student) => {
            const zScore = cumulativeStudentZScore(course.assessments, classmates, student.studentId, assessedIds);
            const strongest = results.map((assessment) => ({ name: assessment.name, zScore: assessment.students.find(({ studentId }) => studentId === student.studentId)?.zScore })).filter(({ zScore }) => zScore != null).sort((a, b) => (b.zScore ?? 0) - (a.zScore ?? 0))[0];
            return { id: student.studentId, name: student.name, zScore, strength: strongest?.name ?? "Course performance" };
          }).filter((student) => student.zScore != null && student.zScore >= 1.2).map((student) => ({ ...student, zScore: student.zScore! }))
        : [];
      const fat = course.assessments.find(({ name }) => name.toUpperCase() === "FAT");
      const projections = Array.from({ length: 31 }, (_, index) => index - 15).map((difficulty) => {
        const projected = projectedClassTotals(course.assessments, classmates, fat?.id ?? "", difficulty);
        const scores = projected.map(({ score }) => score);
        const mean = calculateMean(scores);
        const standardDeviation = calculateStandardDeviation(scores);
        const studentScore = projected.find(({ studentId }) => studentId === me.studentId)?.score ?? null;
        const bins = Array.from({ length: 10 }, (_, bin) => {
          const lower = bin * 10;
          return { range: `${lower}\u2013${lower + 10}`, count: projected.filter(({ score }) => score >= lower && (score < lower + 10 || bin === 9)).length, containsStudent: studentScore != null && studentScore >= lower && (studentScore < lower + 10 || bin === 9) };
        });
        return { difficulty, mean, standardDeviation, studentScore, bins };
      });
      const assessmentMetrics = results.map((assessment) => ({
        id: assessment.id, name: assessment.name, maxScore: assessment.maxScore, weight: assessment.weight,
        studentScore: me.scores[assessment.id] ?? null, classMean: assessment.mean,
        standardDeviation: assessment.standardDeviation, count: assessment.count,
        zScore: assessment.students.find(({ studentId }) => studentId === me.studentId)?.zScore ?? null,
      }));
      const attendance = attendanceByCourse.get(course.id) ?? [];
      return {
        id: course.id, code: course.code, name: course.name,
        attendance: { present: attendance.filter((present) => present === 1).length, total: attendance.length },
        assessments: course.assessments, scores: me.scores, assessmentMetrics,
        currentWeighted: weightedCourseScore(course.assessments, me.scores),
        currentMean: comparableScores.length ? calculateMean(comparableScores) : null,
        currentZ,
        currentRank: comparableScores.length ? 1 + comparableScores.filter((score) => score > weightedCourseScore(course.assessments, me.scores)).length : null,
        cohortSize: comparableScores.length, peers, projections,
      };
    }).filter((course) => course != null);

    return { registrationNo: profile.registrationNo, semester: Number(profile.semester), slotName: profile.slotName, courses: courseData };
  });
}

type TeacherCourseRow = { id: number; code: string; name: string };
type TeacherAssessmentRow = { courseId: number; id: number; name: string; maxScore: number; weight: number };
type TeacherSlotRow = { courseId: number; id: number; name: string; enrollmentCount: number };
type TeacherRosterRow = { courseId: number; studentId: number; name: string; registrationNo: string; slotId: number; slotName: string; assessmentId: number; score: number | null };
type TeacherAttendanceRow = { courseId: number; studentId: number; present: number };
type VerificationRow = { id: number; assessmentId: number; score: number; peerScores: string; isOutlier: number; createdAt: Date; registrationNo: string; studentName: string; courseId: number; courseCode: string; assessmentName: string; maxScore: number };

export async function loadOracleTeacherDashboard(userId: string) {
  const oracleUserId = Number(userId);
  if (!Number.isSafeInteger(oracleUserId) || oracleUserId <= 0) return null;
  return withOracleConnection(async (connection) => {
    const teacherResult = await connection.execute<{ teacherId: number }>(
      `SELECT teacher_id AS "teacherId" FROM teacher_profiles WHERE user_id = :userId`,
      { userId: oracleUserId }, { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const teacherId = teacherResult.rows?.[0]?.teacherId;
    if (teacherId == null) return null;

    const [courseResult, assessmentResult, slotResult, rosterResult, attendanceResult, pendingResult] = await Promise.all([
      connection.execute<TeacherCourseRow>(`SELECT course_id AS "id", code AS "code", name AS "name" FROM courses WHERE teacher_id = :teacherId ORDER BY code`, { teacherId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      connection.execute<TeacherAssessmentRow>(`SELECT a.course_id AS "courseId", a.assessment_id AS "id", a.name AS "name", a.max_score AS "maxScore", a.weight AS "weight" FROM assessments a JOIN courses c ON c.course_id = a.course_id WHERE c.teacher_id = :teacherId ORDER BY c.code, a.name`, { teacherId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      connection.execute<TeacherSlotRow>(`SELECT c.course_id AS "courseId", sl.slot_id AS "id", sl.name AS "name", (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.course_id AND e.slot_id = sl.slot_id) AS "enrollmentCount" FROM courses c JOIN course_slots cs ON cs.course_id = c.course_id JOIN class_slots sl ON sl.slot_id = cs.slot_id WHERE c.teacher_id = :teacherId ORDER BY c.code, sl.name`, { teacherId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      connection.execute<TeacherRosterRow>(`SELECT c.course_id AS "courseId", sp.student_id AS "studentId", u.full_name AS "name", sp.registration_no AS "registrationNo", sl.slot_id AS "slotId", sl.name AS "slotName", a.assessment_id AS "assessmentId", m.score AS "score" FROM courses c JOIN enrollments e ON e.course_id = c.course_id JOIN student_profiles sp ON sp.student_id = e.student_id JOIN users u ON u.user_id = sp.user_id JOIN class_slots sl ON sl.slot_id = e.slot_id JOIN assessments a ON a.course_id = c.course_id LEFT JOIN marks m ON m.student_id = sp.student_id AND m.assessment_id = a.assessment_id WHERE c.teacher_id = :teacherId ORDER BY c.code, sl.name, sp.registration_no, a.assessment_id`, { teacherId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      connection.execute<TeacherAttendanceRow>(`SELECT a.course_id AS "courseId", a.student_id AS "studentId", a.present AS "present" FROM attendance a JOIN courses c ON c.course_id = a.course_id WHERE c.teacher_id = :teacherId`, { teacherId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      connection.execute<VerificationRow>(`SELECT ms.submission_id AS "id", ms.assessment_id AS "assessmentId", ms.score AS "score", DBMS_LOB.SUBSTR(ms.peer_scores_json, 4000, 1) AS "peerScores", ms.is_outlier AS "isOutlier", ms.created_at AS "createdAt", sp.registration_no AS "registrationNo", su.full_name AS "studentName", c.course_id AS "courseId", c.code AS "courseCode", a.name AS "assessmentName", a.max_score AS "maxScore" FROM mark_submissions ms JOIN student_profiles sp ON sp.student_id = ms.student_id JOIN users su ON su.user_id = sp.user_id JOIN assessments a ON a.assessment_id = ms.assessment_id JOIN courses c ON c.course_id = a.course_id WHERE ms.submission_status = 'PENDING' AND c.teacher_id = :teacherId ORDER BY ms.created_at`, { teacherId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
    ]);

    const courses = new Map<string, { id: string; code: string; name: string; assessments: CourseAssessment[]; slots: Array<{ id: string; name: string; enrollmentCount: number }>; rosterMap: Map<string, { studentId: string; name: string; registrationNo: string; slotId: string; slotName: string; scores: Record<string, number> }> }>();
    for (const row of courseResult.rows ?? []) courses.set(String(row.id), { id: String(row.id), code: row.code, name: row.name, assessments: [], slots: [], rosterMap: new Map() });
    for (const row of assessmentResult.rows ?? []) courses.get(String(row.courseId))?.assessments.push({ id: String(row.id), name: row.name, maxScore: Number(row.maxScore), weight: Number(row.weight) });
    for (const row of slotResult.rows ?? []) courses.get(String(row.courseId))?.slots.push({ id: String(row.id), name: row.name, enrollmentCount: Number(row.enrollmentCount) });
    for (const row of rosterResult.rows ?? []) {
      const course = courses.get(String(row.courseId));
      if (!course) continue;
      const studentId = String(row.studentId);
      const student = course.rosterMap.get(studentId) ?? { studentId, name: row.name, registrationNo: row.registrationNo, slotId: String(row.slotId), slotName: row.slotName, scores: {} };
      if (row.score != null) student.scores[String(row.assessmentId)] = Number(row.score);
      course.rosterMap.set(studentId, student);
    }
    const attendanceByCourse = new Map<string, TeacherAttendanceRow[]>();
    for (const row of attendanceResult.rows ?? []) attendanceByCourse.set(String(row.courseId), [...(attendanceByCourse.get(String(row.courseId)) ?? []), row]);

    const risks: Array<{ studentId: string; studentName: string; registrationNo: string; courseId: string; courseCode: string; courseName: string; zScore: number | null; attendance: number | null; reasons: string[] }> = [];
    const courseData = [...courses.values()].map((course) => {
      const roster = [...course.rosterMap.values()];
      const rows = attendanceByCourse.get(course.id) ?? [];
      for (const slotId of new Set(roster.map((student) => student.slotId))) {
        const classmates = roster.filter((student) => student.slotId === slotId);
        for (const student of classmates) {
          const zScore = cumulativeStudentZScore(course.assessments, classmates, student.studentId);
          const attendance = rows.filter((row) => String(row.studentId) === student.studentId);
          const attendancePercent = attendance.length ? attendance.filter((row) => Number(row.present) === 1).length / attendance.length * 100 : null;
          const risk = detectAtRiskStudent(zScore, attendancePercent);
          if (risk.atRisk) risks.push({ studentId: student.studentId, studentName: student.name, registrationNo: student.registrationNo, courseId: course.id, courseCode: course.code, courseName: course.name, zScore, attendance: attendancePercent, reasons: risk.reasons });
        }
      }
      return { id: course.id, code: course.code, name: course.name, average: calculateMean(roster.map((student) => weightedCourseScore(course.assessments, student.scores))), enrollmentCount: roster.length, assessments: course.assessments, slots: course.slots, roster };
    });
    const pending = (pendingResult.rows ?? []).map((row) => ({ id: String(row.id), studentName: row.studentName, registrationNo: row.registrationNo, courseId: String(row.courseId), courseCode: row.courseCode, assessmentId: String(row.assessmentId), assessmentName: row.assessmentName, score: Number(row.score), maxScore: Number(row.maxScore), peerScores: JSON.parse(row.peerScores || "[]") as number[], isOutlier: Number(row.isOutlier) === 1, createdAt: row.createdAt.toISOString() }));
    return { courses: courseData, pending, atRisk: risks };
  });
}
