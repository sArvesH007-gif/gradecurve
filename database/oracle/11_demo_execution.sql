-- Run after @00_setup.sql. This is an executable SQL*Plus faculty demo.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET SERVEROUTPUT ON SIZE UNLIMITED
SET LINESIZE 180
SET PAGESIZE 100

PROMPT === Twelve GradeCurve SQL query demonstrations ===
@@04_sql_queries.sql

PROMPT === Reusable PL/SQL package and calculations ===
DECLARE
  v_teacher_user_id NUMBER;
  v_student_id NUMBER;
  v_teacher_id NUMBER;
  v_course_id NUMBER;
  v_assessment_id NUMBER;
  v_slot_id NUMBER;
  v_demo_course_id NUMBER;
  v_points NUMBER;
  v_attendance NUMBER;
  v_status VARCHAR2(30);
BEGIN
  SELECT u.user_id INTO v_teacher_user_id
  FROM users u WHERE u.username = 'dr.sharma@gradecurve.demo';
  SELECT teacher_id INTO v_teacher_id
  FROM teacher_profiles WHERE user_id = v_teacher_user_id;
  SELECT student_id INTO v_student_id
  FROM student_profiles WHERE registration_no = '24BCE0001';
  SELECT course_id INTO v_course_id FROM courses WHERE code = 'CSE1004';
  SELECT assessment_id INTO v_assessment_id
  FROM assessments WHERE course_id = v_course_id AND name = 'CAT1';
  SELECT slot_id INTO v_slot_id FROM class_slots WHERE name = 'L31+L32';

  gradecurve_academic_pkg.print_student_summary(v_student_id);
  v_points := gradecurve_academic_pkg.weighted_score(v_student_id, v_course_id);
  v_attendance := gradecurve_academic_pkg.attendance_percent(v_student_id, v_course_id);
  v_status := gradecurve_academic_pkg.performance_status(v_student_id, v_course_id);
  DBMS_OUTPUT.PUT_LINE('Weighted points=' || TO_CHAR(v_points, 'FM990D00') ||
                       ', attendance=' || TO_CHAR(v_attendance, 'FM990D00') ||
                       '%, status=' || v_status);

  gradecurve_academic_pkg.save_mark(v_teacher_user_id, v_student_id, v_assessment_id, 36.5);
  gradecurve_academic_pkg.save_attendance(v_teacher_user_id, v_student_id, v_course_id,
                                           DATE '2026-08-01', 1);
  print_course_students_explicit(v_course_id);
  print_course_students_for_loop(v_course_id);
  print_course_slot_students(v_course_id, v_slot_id);

  INSERT INTO courses (code, name, semester, teacher_id)
  VALUES ('ORCLDEMO1', 'Oracle CRUD demo course', 5, v_teacher_id)
  RETURNING course_id INTO v_demo_course_id;
  INSERT INTO course_slots (course_id, slot_id) VALUES (v_demo_course_id, v_slot_id);
  gradecurve_academic_pkg.remove_empty_course(v_teacher_user_id, v_demo_course_id);
  COMMIT;
END;
/

PROMPT === Expected Oracle exceptions ===
@@10_exception_handling.sql

PROMPT === Mark audit rows created by the mark-update demonstration ===
SELECT ma.audit_id, sp.registration_no, a.name AS assessment,
       ma.old_score, ma.new_score, ma.action_type, ma.changed_at
FROM mark_audit ma
JOIN student_profiles sp ON sp.student_id = ma.student_id
JOIN assessments a ON a.assessment_id = ma.assessment_id
ORDER BY ma.audit_id;

PROMPT === Oracle database row counts ===
SELECT 'USERS' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL SELECT 'STUDENT_PROFILES', COUNT(*) FROM student_profiles
UNION ALL SELECT 'TEACHER_PROFILES', COUNT(*) FROM teacher_profiles
UNION ALL SELECT 'COURSES', COUNT(*) FROM courses
UNION ALL SELECT 'CLASS_SLOTS', COUNT(*) FROM class_slots
UNION ALL SELECT 'COURSE_SLOTS', COUNT(*) FROM course_slots
UNION ALL SELECT 'ENROLLMENTS', COUNT(*) FROM enrollments
UNION ALL SELECT 'ASSESSMENTS', COUNT(*) FROM assessments
UNION ALL SELECT 'MARKS', COUNT(*) FROM marks
UNION ALL SELECT 'MARK_SUBMISSIONS', COUNT(*) FROM mark_submissions
UNION ALL SELECT 'MARK_VERIFICATIONS', COUNT(*) FROM mark_verifications
UNION ALL SELECT 'ATTENDANCE', COUNT(*) FROM attendance
UNION ALL SELECT 'STUDY_MATCHES', COUNT(*) FROM study_matches
UNION ALL SELECT 'GUIDANCE_ALERTS', COUNT(*) FROM guidance_alerts
UNION ALL SELECT 'MARK_AUDIT', COUNT(*) FROM mark_audit
ORDER BY table_name;
