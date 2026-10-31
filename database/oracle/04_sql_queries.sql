-- Twelve distinct Oracle SQL read queries for the GradeCurve demo.
-- SQL*Plus substitution variables are demo inputs, not application SQL.
DEFINE student_reg_no = 24BCE0001
DEFINE course_code = CSE1004
DEFINE slot_name = L31+L32

-- Q1. Student profile and active class slot.
SELECT sp.registration_no, u.full_name, sp.program, sp.semester, s.name AS active_slot
FROM student_profiles sp
JOIN users u ON u.user_id = sp.user_id
JOIN class_slots s ON s.slot_id = sp.active_slot_id
WHERE sp.registration_no = '&&student_reg_no';

-- Q2. Course enrollments and faculty ownership for one student.
SELECT c.code, c.name AS course_name, sl.name AS enrolled_slot,
       t.full_name AS faculty_name, e.enrolled_at
FROM enrollments e
JOIN student_profiles sp ON sp.student_id = e.student_id
JOIN courses c ON c.course_id = e.course_id
JOIN class_slots sl ON sl.slot_id = e.slot_id
JOIN teacher_profiles tp ON tp.teacher_id = c.teacher_id
JOIN users t ON t.user_id = tp.user_id
WHERE sp.registration_no = '&&student_reg_no'
ORDER BY c.code;

-- Q3. Student attendance totals and percentage by course.
SELECT c.code, c.name,
       COUNT(a.attendance_id) AS classes_recorded,
       SUM(CASE WHEN a.present = 1 THEN 1 ELSE 0 END) AS classes_attended,
       ROUND(100 * SUM(CASE WHEN a.present = 1 THEN 1 ELSE 0 END)
             / NULLIF(COUNT(a.attendance_id), 0), 1) AS attendance_percent
FROM student_profiles sp
JOIN enrollments e ON e.student_id = sp.student_id
JOIN courses c ON c.course_id = e.course_id
LEFT JOIN attendance a ON a.student_id = sp.student_id AND a.course_id = c.course_id
WHERE sp.registration_no = '&&student_reg_no'
GROUP BY c.code, c.name
ORDER BY c.code;

-- Q4. Raw assessment marks alongside the maximum and grade weight.
SELECT c.code, a.name AS assessment, a.max_score, a.weight,
       m.score AS raw_score, ROUND(m.score / a.max_score * 100, 1) AS raw_percent
FROM student_profiles sp
JOIN marks m ON m.student_id = sp.student_id
JOIN assessments a ON a.assessment_id = m.assessment_id
JOIN courses c ON c.course_id = a.course_id
WHERE sp.registration_no = '&&student_reg_no'
ORDER BY c.code, a.name;

-- Q5. Course-wide mean, population deviation, range, and number of submitted marks.
SELECT c.code, a.name AS assessment, COUNT(m.mark_id) AS marked_students,
       ROUND(AVG(m.score), 2) AS mean_score,
       ROUND(NVL(STDDEV_POP(m.score), 0), 2) AS population_sd,
       MIN(m.score) AS minimum_score, MAX(m.score) AS maximum_score
FROM courses c
JOIN assessments a ON a.course_id = c.course_id
LEFT JOIN marks m ON m.assessment_id = a.assessment_id
WHERE c.code = '&&course_code'
GROUP BY c.code, a.name
ORDER BY a.name;

-- Q6. One student's weighted performance for a course.
SELECT sp.registration_no, c.code,
       ROUND(SUM((m.score / a.max_score) * a.weight * 100), 2) AS earned_weighted_points,
       ROUND(SUM(CASE WHEN m.mark_id IS NOT NULL THEN a.weight * 100 ELSE 0 END), 2) AS graded_weight_percent
FROM student_profiles sp
JOIN enrollments e ON e.student_id = sp.student_id
JOIN courses c ON c.course_id = e.course_id
JOIN assessments a ON a.course_id = c.course_id
LEFT JOIN marks m ON m.student_id = sp.student_id AND m.assessment_id = a.assessment_id
WHERE sp.registration_no = '&&student_reg_no' AND c.code = '&&course_code'
GROUP BY sp.registration_no, c.code;

-- Q7. Course roster and class-slot information.
SELECT sl.name AS class_slot, sp.registration_no, u.full_name
FROM enrollments e
JOIN class_slots sl ON sl.slot_id = e.slot_id
JOIN student_profiles sp ON sp.student_id = e.student_id
JOIN users u ON u.user_id = sp.user_id
JOIN courses c ON c.course_id = e.course_id
WHERE c.code = '&&course_code' AND sl.name = '&&slot_name'
ORDER BY sp.registration_no;

-- Q8. Students below the project's 75 percent attendance support threshold.
SELECT c.code, sp.registration_no, u.full_name,
       ROUND(100 * SUM(CASE WHEN a.present = 1 THEN 1 ELSE 0 END)
             / NULLIF(COUNT(a.attendance_id), 0), 1) AS attendance_percent
FROM attendance a
JOIN student_profiles sp ON sp.student_id = a.student_id
JOIN users u ON u.user_id = sp.user_id
JOIN courses c ON c.course_id = a.course_id
WHERE c.code = '&&course_code'
GROUP BY c.code, sp.registration_no, u.full_name
HAVING 100 * SUM(CASE WHEN a.present = 1 THEN 1 ELSE 0 END)
       / NULLIF(COUNT(a.attendance_id), 0) < 75
ORDER BY attendance_percent, sp.registration_no;

-- Q9. Missing marks, including assessments with no student mark row.
SELECT sp.registration_no, u.full_name, c.code, a.name AS missing_assessment
FROM enrollments e
JOIN student_profiles sp ON sp.student_id = e.student_id
JOIN users u ON u.user_id = sp.user_id
JOIN courses c ON c.course_id = e.course_id
JOIN assessments a ON a.course_id = c.course_id
LEFT JOIN marks m ON m.student_id = sp.student_id AND m.assessment_id = a.assessment_id
WHERE c.code = '&&course_code' AND m.mark_id IS NULL
ORDER BY sp.registration_no, a.name;

-- Q10. Academic summary for every student in one course (weighted points and attendance).
WITH weighted AS (
  SELECT e.student_id, c.course_id,
         ROUND(NVL(SUM(CASE WHEN m.mark_id IS NOT NULL
                   THEN (m.score / a.max_score) * a.weight * 100 ELSE 0 END), 0), 2) AS weighted_points
  FROM enrollments e
  JOIN courses c ON c.course_id = e.course_id
  JOIN assessments a ON a.course_id = c.course_id
  LEFT JOIN marks m ON m.student_id = e.student_id AND m.assessment_id = a.assessment_id
  WHERE c.code = '&&course_code'
  GROUP BY e.student_id, c.course_id
), attendance_rollup AS (
  SELECT student_id, course_id, COUNT(*) AS class_count,
         SUM(CASE WHEN present = 1 THEN 1 ELSE 0 END) AS attended_count
  FROM attendance GROUP BY student_id, course_id
)
SELECT sp.registration_no, u.full_name, w.weighted_points,
       ROUND(100 * ar.attended_count / NULLIF(ar.class_count, 0), 1) AS attendance_percent
FROM weighted w
JOIN student_profiles sp ON sp.student_id = w.student_id
JOIN users u ON u.user_id = sp.user_id
LEFT JOIN attendance_rollup ar ON ar.student_id = w.student_id AND ar.course_id = w.course_id
ORDER BY w.weighted_points DESC, sp.registration_no;

-- Q11. Faculty verification queue with submitted peer marks.
SELECT ms.submission_id, sp.registration_no, c.code, a.name AS assessment,
       ms.score AS reported_score, ms.peer_scores_json, ms.is_outlier, ms.created_at
FROM mark_submissions ms
JOIN student_profiles sp ON sp.student_id = ms.student_id
JOIN assessments a ON a.assessment_id = ms.assessment_id
JOIN courses c ON c.course_id = a.course_id
WHERE ms.submission_status = 'PENDING' AND c.code = '&&course_code'
ORDER BY ms.created_at, ms.submission_id;

-- Q12. Course offerings, faculty, slots, and enrolled roster counts.
SELECT c.code, c.name AS course_name, t.full_name AS faculty_name,
       sl.name AS class_slot, COUNT(e.enrollment_id) AS enrolled_students
FROM courses c
JOIN teacher_profiles tp ON tp.teacher_id = c.teacher_id
JOIN users t ON t.user_id = tp.user_id
JOIN course_slots cs ON cs.course_id = c.course_id
JOIN class_slots sl ON sl.slot_id = cs.slot_id
LEFT JOIN enrollments e ON e.course_id = c.course_id AND e.slot_id = sl.slot_id
WHERE c.code = '&&course_code'
GROUP BY c.code, c.name, t.full_name, sl.name
ORDER BY sl.name;
