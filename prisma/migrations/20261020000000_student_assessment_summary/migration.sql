CREATE OR REPLACE FUNCTION public.student_assessment_summary(p_user_id TEXT)
RETURNS TABLE (
  registration_no TEXT,
  course_id TEXT,
  course_code TEXT,
  course_name TEXT,
  class_slot TEXT,
  assessment_id TEXT,
  assessment_name TEXT,
  obtained_marks DOUBLE PRECISION,
  maximum_marks DOUBLE PRECISION,
  weight DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp."registrationNo",
    c."id",
    c."code",
    c."name",
    slot."name",
    a."id",
    a."name",
    m."score",
    a."maxScore",
    a."weight"
  FROM "StudentProfile" AS sp
  JOIN "User" AS u
    ON u."id" = sp."userId"
   AND u."role" = 'STUDENT'::"UserRole"
  JOIN "Enrollment" AS e ON e."studentId" = sp."id"
  JOIN "Course" AS c ON c."id" = e."courseId"
  JOIN "ClassSlot" AS slot ON slot."id" = e."slotId"
  JOIN "Assessment" AS a ON a."courseId" = c."id"
  LEFT JOIN "Mark" AS m
    ON m."studentId" = sp."id"
   AND m."assessmentId" = a."id"
  WHERE u."id" = p_user_id
  ORDER BY c."code", slot."name", a."name";
END;
$$;
