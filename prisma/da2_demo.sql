-- GradeCurve DA2 demonstration (run with psql from the prisma directory).
-- The include installs the migration's procedural definitions before calls.
-- Sample IDs are selected from the deterministic demo seed, not hard-coded.
-- Each procedure call is rolled back so the demo does not change seeded records.
\ir migrations/20261024000000_da2_procedural_queries/migration.sql

BEGIN;

-- 1. Existing retrieval function: assessment rows for a signed-in student.
SELECT * FROM public.student_assessment_summary(
  (SELECT id FROM "User" WHERE username = '24BCE0001')
);

-- 2. Aggregate academic summary by the student's enrolled course.
SELECT * FROM public.student_academic_summary(
  (SELECT id FROM "User" WHERE username = '24BCE0001')
);

-- 3. Raw assessment marks and their weighted course points.
SELECT * FROM public.student_course_assessment_marks(
  (SELECT id FROM "StudentProfile" WHERE "registrationNo" = '24BCE0001'),
  (SELECT id FROM "Course" WHERE code = 'CSE1004')
);

-- 4. Per-assessment class mean, population standard deviation, and range.
SELECT * FROM public.course_assessment_statistics(
  (SELECT id FROM "Course" WHERE code = 'CSE1004')
);

-- 5. Weighted total, using Assessment.weight fractions and raw maxScore.
SELECT public.student_weighted_course_score(
  (SELECT id FROM "StudentProfile" WHERE "registrationNo" = '24BCE0001'),
  (SELECT id FROM "Course" WHERE code = 'CSE1004')
) AS weighted_course_points;

-- 6. Enrolled roster for a course and its first offered slot.
SELECT * FROM public.students_in_course_slot(
  (SELECT id FROM "Course" WHERE code = 'CSE1004'),
  (SELECT slotId FROM "CourseSlot" WHERE courseId =
    (SELECT id FROM "Course" WHERE code = 'CSE1004') ORDER BY slotId LIMIT 1)
);

-- 7. Attendance totals and percentage for the demo student.
SELECT * FROM public.student_course_attendance_summary(
  (SELECT id FROM "StudentProfile" WHERE "registrationNo" = '24BCE0001'),
  (SELECT id FROM "Course" WHERE code = 'CSE1004')
);

-- 8. Students matching the project's risk rules: cumulative course-slot
-- Z-score below -1.0 or attendance below 75%.
SELECT * FROM public.students_at_risk(
  (SELECT id FROM "Course" WHERE code = 'CSE1004')
);

-- 9. Update an existing CAT1 mark via the validated teacher procedure.
CALL public.upsert_assessment_mark(
  (SELECT u.id FROM "User" u JOIN "TeacherProfile" tp ON tp."userId" = u.id
   JOIN "Course" c ON c."teacherId" = tp.id WHERE c.code = 'CSE1004'),
  (SELECT id FROM "StudentProfile" WHERE "registrationNo" = '24BCE0001'),
  (SELECT id FROM "Assessment" WHERE "courseId" =
    (SELECT id FROM "Course" WHERE code = 'CSE1004') AND name = 'CAT1'),
  35.0
);

-- 10. Upsert attendance for an enrolled student and assigned teacher.
CALL public.record_course_attendance(
  (SELECT u.id FROM "User" u JOIN "TeacherProfile" tp ON tp."userId" = u.id
   JOIN "Course" c ON c."teacherId" = tp.id WHERE c.code = 'CSE1004'),
  (SELECT id FROM "StudentProfile" WHERE "registrationNo" = '24BCE0001'),
  (SELECT id FROM "Course" WHERE code = 'CSE1004'),
  DATE '2026-08-01', TRUE
);

ROLLBACK;

-- Negative-path checks: each nested block passes only when the expected
-- validation exception is raised. These checks do not leave data behind.
DO $$
DECLARE
  v_teacher_id TEXT;
  v_student_id TEXT;
  v_assessment_id TEXT;
BEGIN
  BEGIN
    PERFORM * FROM public.student_course_assessment_marks('missing', 'missing');
    RAISE EXCEPTION 'Expected missing-enrollment error was not raised';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    NULL;
  END;

  SELECT u.id INTO v_teacher_id
  FROM "User" u JOIN "TeacherProfile" tp ON tp."userId" = u.id
  JOIN "Course" c ON c."teacherId" = tp.id WHERE c.code = 'CSE1004';
  SELECT id INTO v_student_id FROM "StudentProfile" WHERE "registrationNo" = '24BCE0001';
  SELECT id INTO v_assessment_id FROM "Assessment"
  WHERE "courseId" = (SELECT id FROM "Course" WHERE code = 'CSE1004') AND name = 'CAT1';

  BEGIN
    CALL public.upsert_assessment_mark(v_teacher_id, v_student_id, v_assessment_id, 51.0);
    RAISE EXCEPTION 'Expected score-range error was not raised';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  BEGIN
    CALL public.record_course_attendance(
      v_teacher_id, 'missing-student',
      (SELECT id FROM "Course" WHERE code = 'CSE1004'), DATE '2026-08-01', TRUE
    );
    RAISE EXCEPTION 'Expected missing-enrollment error was not raised';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    NULL;
  END;
  RAISE NOTICE 'DA2 missing-record and invalid-score checks passed';
END;
$$;

-- Expected behavior: the SELECTs return the seeded student's courses and
-- marks, class statistics, weighted points, roster, attendance, and risk rows.
-- The two positive CALLs complete; ROLLBACK restores the prior seeded values.
