-- Oracle PL/SQL functions using the confirmed GradeCurve assessment weights.

CREATE OR REPLACE FUNCTION weighted_course_score (
  p_student_id IN NUMBER,
  p_course_id IN NUMBER
) RETURN NUMBER AS
  v_score NUMBER;
  v_enrollment_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_enrollment_count
  FROM enrollments WHERE student_id = p_student_id AND course_id = p_course_id;
  IF v_enrollment_count = 0 THEN
    RAISE_APPLICATION_ERROR(-20011, 'Student is not enrolled in this course.');
  END IF;

  SELECT NVL(SUM((m.score / NULLIF(a.max_score, 0)) * a.weight * 100), 0)
  INTO v_score
  FROM marks m
  JOIN assessments a ON a.assessment_id = m.assessment_id
  WHERE m.student_id = p_student_id AND a.course_id = p_course_id
    AND m.score BETWEEN 0 AND a.max_score AND a.max_score > 0 AND a.weight >= 0;
  RETURN ROUND(v_score, 4);
END;
/

CREATE OR REPLACE FUNCTION course_attendance_percent (
  p_student_id IN NUMBER,
  p_course_id IN NUMBER
) RETURN NUMBER AS
  v_total NUMBER;
  v_attended NUMBER;
  v_enrollment_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_enrollment_count
  FROM enrollments WHERE student_id = p_student_id AND course_id = p_course_id;
  IF v_enrollment_count = 0 THEN
    RAISE_APPLICATION_ERROR(-20012, 'Student is not enrolled in this course.');
  END IF;

  SELECT COUNT(*), NVL(SUM(CASE WHEN present = 1 THEN 1 ELSE 0 END), 0)
  INTO v_total, v_attended
  FROM attendance WHERE student_id = p_student_id AND course_id = p_course_id;
  IF v_total = 0 THEN
    RETURN NULL;
  END IF;
  RETURN ROUND(100 * v_attended / v_total, 2);
END;
/

CREATE OR REPLACE FUNCTION academic_performance_status (
  p_student_id IN NUMBER,
  p_course_id IN NUMBER
) RETURN VARCHAR2 AS
  v_score NUMBER;
BEGIN
  v_score := weighted_course_score(p_student_id, p_course_id);
  IF v_score >= 85 THEN
    RETURN 'EXCELLENT';
  ELSIF v_score >= 70 THEN
    RETURN 'ON_TRACK';
  ELSIF v_score >= 50 THEN
    RETURN 'NEEDS_SUPPORT';
  ELSE
    RETURN 'AT_RISK';
  END IF;
END;
/
