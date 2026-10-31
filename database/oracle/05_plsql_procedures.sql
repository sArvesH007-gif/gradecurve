-- Oracle PL/SQL procedures with role, ownership, enrollment, and range checks.

CREATE OR REPLACE PROCEDURE upsert_assessment_mark (
  p_teacher_user_id IN NUMBER,
  p_student_id IN NUMBER,
  p_assessment_id IN NUMBER,
  p_score IN NUMBER
) AS
  v_course_id NUMBER;
  v_max_score NUMBER;
  v_count NUMBER;
BEGIN
  IF p_score IS NULL THEN
    RAISE_APPLICATION_ERROR(-20001, 'A mark score is required.');
  END IF;

  SELECT course_id, max_score INTO v_course_id, v_max_score
  FROM assessments WHERE assessment_id = p_assessment_id;
  IF p_score < 0 OR p_score > v_max_score THEN
    RAISE_APPLICATION_ERROR(-20002, 'Mark must be between zero and the assessment maximum.');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM courses c
  JOIN teacher_profiles tp ON tp.teacher_id = c.teacher_id
  WHERE c.course_id = v_course_id AND tp.user_id = p_teacher_user_id;
  IF v_count = 0 THEN
    RAISE_APPLICATION_ERROR(-20003, 'Teacher is not assigned to this course.');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM enrollments WHERE student_id = p_student_id AND course_id = v_course_id;
  IF v_count = 0 THEN
    RAISE_APPLICATION_ERROR(-20004, 'Student is not enrolled in this course.');
  END IF;

  MERGE INTO marks target
  USING (SELECT p_student_id AS student_id, p_assessment_id AS assessment_id,
                p_score AS score FROM dual) source
  ON (target.student_id = source.student_id AND target.assessment_id = source.assessment_id)
  WHEN MATCHED THEN UPDATE SET target.score = source.score,
                               target.mark_source = 'FACULTY',
                               target.entered_by_user_id = p_teacher_user_id,
                               target.updated_at = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT
    (student_id, assessment_id, score, mark_source, entered_by_user_id)
    VALUES (source.student_id, source.assessment_id, source.score, 'FACULTY', p_teacher_user_id);
END;
/

CREATE OR REPLACE PROCEDURE record_course_attendance (
  p_teacher_user_id IN NUMBER,
  p_student_id IN NUMBER,
  p_course_id IN NUMBER,
  p_attendance_date IN DATE,
  p_present IN NUMBER
) AS
  v_count NUMBER;
BEGIN
  IF p_attendance_date IS NULL OR p_present NOT IN (0, 1) OR p_present IS NULL THEN
    RAISE_APPLICATION_ERROR(-20005, 'Attendance date and a 0/1 presence value are required.');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM courses c
  JOIN teacher_profiles tp ON tp.teacher_id = c.teacher_id
  WHERE c.course_id = p_course_id AND tp.user_id = p_teacher_user_id;
  IF v_count = 0 THEN
    RAISE_APPLICATION_ERROR(-20006, 'Teacher is not assigned to this course.');
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM enrollments WHERE student_id = p_student_id AND course_id = p_course_id;
  IF v_count = 0 THEN
    RAISE_APPLICATION_ERROR(-20007, 'Student is not enrolled in this course.');
  END IF;

  MERGE INTO attendance target
  USING (SELECT p_student_id AS student_id, p_course_id AS course_id,
                TRUNC(p_attendance_date) AS attendance_date,
                p_present AS present FROM dual) source
  ON (target.student_id = source.student_id AND target.course_id = source.course_id
      AND target.attendance_date = source.attendance_date)
  WHEN MATCHED THEN UPDATE SET target.present = source.present
  WHEN NOT MATCHED THEN INSERT (student_id, course_id, attendance_date, present)
    VALUES (source.student_id, source.course_id, source.attendance_date, source.present);
END;
/

CREATE OR REPLACE PROCEDURE generate_student_academic_summary (
  p_student_id IN NUMBER
) AS
  v_registration_no VARCHAR2(24);
  v_course_count PLS_INTEGER := 0;
BEGIN
  SELECT registration_no INTO v_registration_no
  FROM student_profiles WHERE student_id = p_student_id;
  DBMS_OUTPUT.PUT_LINE('Academic summary for ' || v_registration_no);
  FOR rec IN (
    SELECT c.code, c.name, sl.name AS slot_name,
           COUNT(a.assessment_id) AS assessment_count,
           COUNT(m.mark_id) AS marked_count,
           ROUND(NVL(SUM(CASE WHEN m.mark_id IS NOT NULL
                    THEN (m.score / a.max_score) * a.weight * 100 ELSE 0 END), 0), 2) AS weighted_points
    FROM enrollments e
    JOIN courses c ON c.course_id = e.course_id
    JOIN class_slots sl ON sl.slot_id = e.slot_id
    JOIN assessments a ON a.course_id = c.course_id
    LEFT JOIN marks m ON m.student_id = e.student_id AND m.assessment_id = a.assessment_id
    WHERE e.student_id = p_student_id
    GROUP BY c.code, c.name, sl.name
    ORDER BY c.code
  ) LOOP
    v_course_count := v_course_count + 1;
    DBMS_OUTPUT.PUT_LINE(rec.code || ' | ' || rec.name || ' | slot ' || rec.slot_name ||
      ' | assessments ' || rec.marked_count || '/' || rec.assessment_count ||
      ' | weighted points ' || TO_CHAR(rec.weighted_points, 'FM990D00'));
  END LOOP;
  IF v_course_count = 0 THEN
    DBMS_OUTPUT.PUT_LINE('No course enrollments were found.');
  END IF;
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RAISE_APPLICATION_ERROR(-20008, 'Student profile was not found.');
END;
/

CREATE OR REPLACE PROCEDURE delete_empty_course (
  p_teacher_user_id IN NUMBER,
  p_course_id IN NUMBER
) AS
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM courses c
  JOIN teacher_profiles tp ON tp.teacher_id = c.teacher_id
  WHERE c.course_id = p_course_id AND tp.user_id = p_teacher_user_id;
  IF v_count = 0 THEN
    RAISE_APPLICATION_ERROR(-20009, 'Course was not found for this teacher.');
  END IF;

  SELECT (SELECT COUNT(*) FROM enrollments WHERE course_id = p_course_id) +
         (SELECT COUNT(*) FROM attendance WHERE course_id = p_course_id) +
         (SELECT COUNT(*) FROM study_matches WHERE course_id = p_course_id) +
         (SELECT COUNT(*) FROM guidance_alerts WHERE course_id = p_course_id) +
         (SELECT COUNT(*) FROM marks m JOIN assessments a ON a.assessment_id = m.assessment_id
          WHERE a.course_id = p_course_id) +
         (SELECT COUNT(*) FROM mark_submissions ms JOIN assessments a ON a.assessment_id = ms.assessment_id
          WHERE a.course_id = p_course_id)
  INTO v_count FROM dual;
  IF v_count > 0 THEN
    RAISE_APPLICATION_ERROR(-20010, 'Only an unused course with no learner activity can be deleted.');
  END IF;

  DELETE FROM course_slots WHERE course_id = p_course_id;
  DELETE FROM assessments WHERE course_id = p_course_id;
  DELETE FROM courses WHERE course_id = p_course_id;
END;
/

CREATE OR REPLACE PROCEDURE delete_empty_student (
  p_teacher_user_id IN NUMBER,
  p_student_id IN NUMBER
) AS
  v_count NUMBER;
  v_student_user_id NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM student_profiles sp
  JOIN class_slots sl ON sl.slot_id = sp.active_slot_id
  JOIN teacher_profiles tp ON tp.teacher_id = sl.teacher_id
  WHERE sp.student_id = p_student_id AND tp.user_id = p_teacher_user_id;
  IF v_count = 0 THEN
    RAISE_APPLICATION_ERROR(-20014, 'Student was not found in this teacher''s class slots.');
  END IF;

  SELECT (SELECT COUNT(*) FROM marks WHERE student_id = p_student_id) +
         (SELECT COUNT(*) FROM attendance WHERE student_id = p_student_id) +
         (SELECT COUNT(*) FROM mark_submissions WHERE student_id = p_student_id) +
         (SELECT COUNT(*) FROM study_matches WHERE requester_id = p_student_id OR peer_id = p_student_id) +
         (SELECT COUNT(*) FROM guidance_alerts WHERE student_id = p_student_id)
  INTO v_count FROM dual;
  IF v_count > 0 THEN
    RAISE_APPLICATION_ERROR(-20015, 'Student with marks, attendance, submissions, or support activity cannot be deleted.');
  END IF;

  SELECT user_id INTO v_student_user_id
  FROM student_profiles WHERE student_id = p_student_id;
  DELETE FROM student_profiles WHERE student_id = p_student_id;
  DELETE FROM users WHERE user_id = v_student_user_id;
END;
/
