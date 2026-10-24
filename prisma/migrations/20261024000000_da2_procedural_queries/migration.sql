-- GradeCurve DA2 procedural queries (PostgreSQL PL/pgSQL).
-- Assessment.weight is stored as a fraction (0.15 for 15%), and maxScore is raw.

CREATE OR REPLACE FUNCTION public.student_academic_summary(p_user_id TEXT)
RETURNS TABLE (
  student_id TEXT,
  registration_no TEXT,
  course_id TEXT,
  course_code TEXT,
  course_name TEXT,
  class_slot TEXT,
  assessment_count BIGINT,
  recorded_assessment_count BIGINT,
  earned_weighted_points DOUBLE PRECISION
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM "User" WHERE id = p_user_id AND role = 'STUDENT'::"UserRole"
  ) THEN
    RAISE EXCEPTION 'Student user % was not found', p_user_id USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT sp.id, sp."registrationNo", c.id, c.code, c.name, slot.name,
         COUNT(a.id)::BIGINT, COUNT(m.id)::BIGINT,
         COALESCE(SUM(CASE
           WHEN m.id IS NOT NULL AND m.score >= 0 AND m.score <= a."maxScore"
             AND a."maxScore" > 0 AND a.weight >= 0
           THEN (m.score / a."maxScore") * a.weight * 100
           ELSE 0
         END), 0)::DOUBLE PRECISION
  FROM "StudentProfile" sp
  JOIN "Enrollment" e ON e."studentId" = sp.id
  JOIN "Course" c ON c.id = e."courseId"
  JOIN "ClassSlot" slot ON slot.id = e."slotId"
  JOIN "Assessment" a ON a."courseId" = c.id
  LEFT JOIN "Mark" m ON m."studentId" = sp.id AND m."assessmentId" = a.id
  WHERE sp."userId" = p_user_id
  GROUP BY sp.id, sp."registrationNo", c.id, c.code, c.name, slot.name
  ORDER BY c.code, slot.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.student_course_assessment_marks(
  p_student_id TEXT, p_course_id TEXT
)
RETURNS TABLE (
  assessment_id TEXT, assessment_name TEXT, maximum_marks DOUBLE PRECISION,
  weight DOUBLE PRECISION, obtained_marks DOUBLE PRECISION, weighted_points DOUBLE PRECISION
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Enrollment" WHERE "studentId" = p_student_id AND "courseId" = p_course_id
  ) THEN
    RAISE EXCEPTION 'Student % is not enrolled in course %', p_student_id, p_course_id USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT a.id, a.name, a."maxScore", a.weight, m.score,
         CASE WHEN m.score IS NULL OR a."maxScore" <= 0 OR m.score < 0
                    OR m.score > a."maxScore" OR a.weight < 0 THEN NULL
              ELSE (m.score / a."maxScore") * a.weight * 100 END
  FROM "Assessment" a
  LEFT JOIN "Mark" m ON m."assessmentId" = a.id AND m."studentId" = p_student_id
  WHERE a."courseId" = p_course_id
  ORDER BY a.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.course_assessment_statistics(p_course_id TEXT)
RETURNS TABLE (
  assessment_id TEXT, assessment_name TEXT, maximum_marks DOUBLE PRECISION,
  student_count BIGINT, mean_score DOUBLE PRECISION, standard_deviation DOUBLE PRECISION,
  minimum_score DOUBLE PRECISION, maximum_score DOUBLE PRECISION
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Course" WHERE id = p_course_id) THEN
    RAISE EXCEPTION 'Course % was not found', p_course_id USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT a.id, a.name, a."maxScore", COUNT(m.id)::BIGINT,
         AVG(m.score)::DOUBLE PRECISION, COALESCE(STDDEV_POP(m.score), 0)::DOUBLE PRECISION,
         MIN(m.score)::DOUBLE PRECISION, MAX(m.score)::DOUBLE PRECISION
  FROM "Assessment" a
  LEFT JOIN "Mark" m ON m."assessmentId" = a.id
    AND m.score >= 0 AND m.score <= a."maxScore" AND a."maxScore" > 0
  WHERE a."courseId" = p_course_id
  GROUP BY a.id, a.name, a."maxScore"
  ORDER BY a.name;
END;
$$;

CREATE OR REPLACE PROCEDURE public.upsert_assessment_mark(
  p_teacher_user_id TEXT, p_student_id TEXT, p_assessment_id TEXT, p_score DOUBLE PRECISION
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_course_id TEXT;
  v_max_score DOUBLE PRECISION;
BEGIN
  IF p_score IS NULL OR p_score::TEXT IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Score must be a finite number' USING ERRCODE = '22023';
  END IF;
  SELECT a."courseId", a."maxScore" INTO v_course_id, v_max_score
  FROM "Assessment" a WHERE a.id = p_assessment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assessment % was not found', p_assessment_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Course" c JOIN "TeacherProfile" tp ON tp.id = c."teacherId"
    WHERE c.id = v_course_id AND tp."userId" = p_teacher_user_id
  ) THEN
    RAISE EXCEPTION 'Teacher is not assigned to this assessment course' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Enrollment" WHERE "studentId" = p_student_id AND "courseId" = v_course_id
  ) THEN
    RAISE EXCEPTION 'Student is not enrolled in the assessment course' USING ERRCODE = 'P0002';
  END IF;
  IF v_max_score <= 0 OR p_score < 0 OR p_score > v_max_score THEN
    RAISE EXCEPTION 'Score must be between 0 and %', v_max_score USING ERRCODE = '22023';
  END IF;

  INSERT INTO "Mark" (id, "studentId", "assessmentId", score, source, "enteredById", "createdAt", "updatedAt")
  VALUES ('da2_' || md5(random()::TEXT || clock_timestamp()::TEXT), p_student_id, p_assessment_id,
          p_score, 'FACULTY'::"MarkSource", p_teacher_user_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("studentId", "assessmentId") DO UPDATE
    SET score = EXCLUDED.score, source = EXCLUDED.source,
        "enteredById" = EXCLUDED."enteredById", "updatedAt" = CURRENT_TIMESTAMP;
END;
$$;

CREATE OR REPLACE PROCEDURE public.record_course_attendance(
  p_teacher_user_id TEXT, p_student_id TEXT, p_course_id TEXT, p_date DATE, p_present BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_date IS NULL OR p_present IS NULL THEN
    RAISE EXCEPTION 'Attendance date and presence value are required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Course" c JOIN "TeacherProfile" tp ON tp.id = c."teacherId"
    WHERE c.id = p_course_id AND tp."userId" = p_teacher_user_id
  ) THEN
    RAISE EXCEPTION 'Teacher is not assigned to course %', p_course_id USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Enrollment" WHERE "studentId" = p_student_id AND "courseId" = p_course_id
  ) THEN
    RAISE EXCEPTION 'Student is not enrolled in course %', p_course_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO "Attendance" (id, "studentId", "courseId", date, present)
  VALUES ('da2_' || md5(random()::TEXT || clock_timestamp()::TEXT), p_student_id, p_course_id, p_date, p_present)
  ON CONFLICT ("studentId", "courseId", date) DO UPDATE SET present = EXCLUDED.present;
END;
$$;

CREATE OR REPLACE FUNCTION public.student_weighted_course_score(
  p_student_id TEXT, p_course_id TEXT
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_score DOUBLE PRECISION;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Enrollment" WHERE "studentId" = p_student_id AND "courseId" = p_course_id
  ) THEN
    RAISE EXCEPTION 'Student % is not enrolled in course %', p_student_id, p_course_id USING ERRCODE = 'P0002';
  END IF;
  SELECT COALESCE(SUM((m.score / NULLIF(a."maxScore", 0)) * a.weight * 100), 0)::DOUBLE PRECISION
  INTO v_score
  FROM "Mark" m JOIN "Assessment" a ON a.id = m."assessmentId"
  WHERE m."studentId" = p_student_id AND a."courseId" = p_course_id
    AND m.score >= 0 AND m.score <= a."maxScore" AND a."maxScore" > 0 AND a.weight >= 0;
  RETURN v_score;
END;
$$;

CREATE OR REPLACE FUNCTION public.students_in_course_slot(p_course_id TEXT, p_slot_id TEXT)
RETURNS TABLE (student_id TEXT, registration_no TEXT, student_name TEXT, slot_name TEXT)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "CourseSlot" WHERE "courseId" = p_course_id AND "slotId" = p_slot_id) THEN
    RAISE EXCEPTION 'Course is not offered in the requested slot' USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY
  SELECT sp.id, sp."registrationNo", u.name, slot.name
  FROM "Enrollment" e
  JOIN "StudentProfile" sp ON sp.id = e."studentId"
  JOIN "User" u ON u.id = sp."userId"
  JOIN "ClassSlot" slot ON slot.id = e."slotId"
  WHERE e."courseId" = p_course_id AND e."slotId" = p_slot_id
  ORDER BY sp."registrationNo";
END;
$$;

CREATE OR REPLACE FUNCTION public.student_course_attendance_summary(
  p_student_id TEXT, p_course_id TEXT
)
RETURNS TABLE (classes_attended BIGINT, classes_recorded BIGINT, attendance_percent DOUBLE PRECISION)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Enrollment" WHERE "studentId" = p_student_id AND "courseId" = p_course_id
  ) THEN
    RAISE EXCEPTION 'Student % is not enrolled in course %', p_student_id, p_course_id USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY
  SELECT COUNT(*) FILTER (WHERE at.present)::BIGINT, COUNT(*)::BIGINT,
         CASE WHEN COUNT(*) = 0 THEN NULL
              ELSE (COUNT(*) FILTER (WHERE at.present)::DOUBLE PRECISION / COUNT(*)) * 100 END
  FROM "Attendance" at
  WHERE at."studentId" = p_student_id AND at."courseId" = p_course_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.students_at_risk(p_course_id TEXT)
RETURNS TABLE (
  student_id TEXT, registration_no TEXT, student_name TEXT, slot_name TEXT,
  weighted_score DOUBLE PRECISION, cumulative_z_score DOUBLE PRECISION,
  attendance_percent DOUBLE PRECISION, risk_reasons TEXT[]
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Course" WHERE id = p_course_id) THEN
    RAISE EXCEPTION 'Course % was not found', p_course_id USING ERRCODE = 'P0002';
  END IF;
  RETURN QUERY
  WITH
  target_sets AS (
    SELECT e."studentId" AS target_id, e."slotId" AS target_slot_id,
           COALESCE(ARRAY_AGG(m."assessmentId") FILTER (WHERE m.id IS NOT NULL AND a.id IS NOT NULL), ARRAY[]::TEXT[]) AS assessment_ids,
           COUNT(m.id) FILTER (WHERE a.id IS NOT NULL)::INTEGER AS assessment_count
    FROM "Enrollment" e
    LEFT JOIN "Mark" m ON m."studentId" = e."studentId"
    LEFT JOIN "Assessment" a ON a.id = m."assessmentId" AND a."courseId" = p_course_id
    WHERE e."courseId" = p_course_id
    GROUP BY e."studentId"
  ),
  compared AS (
    SELECT t.target_id, peer."studentId" AS peer_id,
           SUM((pm.score / NULLIF(a."maxScore", 0)) * a.weight * 100)::DOUBLE PRECISION AS score,
           t.assessment_count
    FROM target_sets t
    JOIN "Enrollment" peer_enrollment ON peer_enrollment."courseId" = p_course_id
      AND peer_enrollment."slotId" = t.target_slot_id
    JOIN "Mark" pm ON pm."studentId" = peer_enrollment."studentId"
    JOIN "Assessment" a ON a.id = pm."assessmentId" AND a.id = ANY(t.assessment_ids)
    JOIN "StudentProfile" peer ON peer.id = peer_enrollment."studentId"
    WHERE t.assessment_count > 0 AND pm.score >= 0 AND pm.score <= a."maxScore" AND a."maxScore" > 0
    GROUP BY t.target_id, peer."studentId", t.assessment_count
    HAVING COUNT(DISTINCT a.id) = t.assessment_count
  ),
  z_scores AS (
    SELECT target_id, MAX(score) FILTER (WHERE peer_id = target_id) AS own_score,
           AVG(score) AS cohort_mean, COALESCE(STDDEV_POP(score), 0) AS cohort_sd
    FROM compared GROUP BY target_id
  ),
  attendance AS (
    SELECT e."studentId" AS student_id, COUNT(at.date)::BIGINT AS class_count,
           COUNT(at.date) FILTER (WHERE at.present)::BIGINT AS attended_count,
           CASE WHEN COUNT(at.date) = 0 THEN NULL ELSE
             COUNT(at.date) FILTER (WHERE at.present)::DOUBLE PRECISION / COUNT(at.date) * 100 END AS attendance_pct
    FROM "Enrollment" e LEFT JOIN "Attendance" at
      ON at."studentId" = e."studentId" AND at."courseId" = e."courseId"
    WHERE e."courseId" = p_course_id GROUP BY e."studentId"
  ),
  results AS (
    SELECT sp.id AS student_id, sp."registrationNo" AS registration_no, u.name AS student_name,
           slot.name AS slot_name, public.student_weighted_course_score(sp.id, p_course_id) AS weighted_score,
           CASE WHEN z.own_score IS NULL OR z.cohort_mean IS NULL THEN NULL
                WHEN z.cohort_sd = 0 THEN CASE WHEN z.own_score = z.cohort_mean THEN 0.0
                                              WHEN z.own_score > z.cohort_mean THEN 'Infinity'::DOUBLE PRECISION
                                              ELSE '-Infinity'::DOUBLE PRECISION END
                ELSE (z.own_score - z.cohort_mean) / z.cohort_sd END AS z_score,
           at.attendance_pct
    FROM "Enrollment" e
    JOIN "StudentProfile" sp ON sp.id = e."studentId"
    JOIN "User" u ON u.id = sp."userId"
    JOIN "ClassSlot" slot ON slot.id = e."slotId"
    LEFT JOIN z_scores z ON z.target_id = sp.id
    JOIN attendance at ON at.student_id = sp.id
    WHERE e."courseId" = p_course_id
  )
  SELECT r.student_id, r.registration_no, r.student_name, r.slot_name, r.weighted_score,
         r.z_score, r.attendance_pct,
         ARRAY_REMOVE(ARRAY[
           CASE WHEN r.z_score < -1 THEN 'Cumulative Z-score is below -1.0' END,
           CASE WHEN r.attendance_pct < 75 THEN 'Attendance is below 75%' END
         ]::TEXT[], NULL)
  FROM results r
  WHERE r.z_score < -1 OR r.attendance_pct < 75
  ORDER BY r.registration_no;
END;
$$;
