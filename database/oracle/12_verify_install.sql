-- Post-install assertions for Oracle SQL*Plus. Empty result sets indicate pass.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET PAGESIZE 100
SET LINESIZE 160

PROMPT === Invalid PL/SQL objects (expected: no rows) ===
SELECT object_type, object_name, status
FROM user_objects
WHERE object_type IN ('FUNCTION', 'PROCEDURE', 'PACKAGE', 'PACKAGE BODY', 'TRIGGER')
  AND status <> 'VALID'
ORDER BY object_type, object_name;

PROMPT === PL/SQL compiler errors (expected: no rows) ===
SELECT name, type, line, position, text
FROM user_errors
ORDER BY name, sequence;

PROMPT === Assessment weight validation (expected: no rows) ===
SELECT c.code, SUM(a.weight) AS total_weight
FROM courses c JOIN assessments a ON a.course_id = c.course_id
GROUP BY c.code
HAVING ABS(SUM(a.weight) - 1) > 0.00001;

PROMPT === Seed table counts ===
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

PROMPT === Installed table count ===
SELECT COUNT(*) AS gradecurve_tables FROM user_tables
WHERE table_name IN (
  'USERS', 'STUDENT_PROFILES', 'TEACHER_PROFILES', 'COURSES', 'CLASS_SLOTS',
  'COURSE_SLOTS', 'ENROLLMENTS', 'ASSESSMENTS', 'MARKS', 'MARK_SUBMISSIONS',
  'MARK_VERIFICATIONS', 'ATTENDANCE', 'STUDY_MATCHES', 'GUIDANCE_ALERTS', 'MARK_AUDIT'
);
