-- Reusable package API. Its implementation delegates to the validated
-- standalone GradeCurve routines defined in files 05 and 06.
CREATE OR REPLACE PACKAGE gradecurve_academic_pkg AS
  PROCEDURE save_mark(p_teacher_user_id IN NUMBER, p_student_id IN NUMBER,
                      p_assessment_id IN NUMBER, p_score IN NUMBER);
  PROCEDURE save_attendance(p_teacher_user_id IN NUMBER, p_student_id IN NUMBER,
                            p_course_id IN NUMBER, p_attendance_date IN DATE,
                            p_present IN NUMBER);
  PROCEDURE print_student_summary(p_student_id IN NUMBER);
  PROCEDURE remove_empty_course(p_teacher_user_id IN NUMBER, p_course_id IN NUMBER);
  PROCEDURE remove_empty_student(p_teacher_user_id IN NUMBER, p_student_id IN NUMBER);
  FUNCTION weighted_score(p_student_id IN NUMBER, p_course_id IN NUMBER) RETURN NUMBER;
  FUNCTION attendance_percent(p_student_id IN NUMBER, p_course_id IN NUMBER) RETURN NUMBER;
  FUNCTION performance_status(p_student_id IN NUMBER, p_course_id IN NUMBER) RETURN VARCHAR2;
END gradecurve_academic_pkg;
/

CREATE OR REPLACE PACKAGE BODY gradecurve_academic_pkg AS
  PROCEDURE save_mark(p_teacher_user_id IN NUMBER, p_student_id IN NUMBER,
                      p_assessment_id IN NUMBER, p_score IN NUMBER) IS
  BEGIN
    upsert_assessment_mark(p_teacher_user_id, p_student_id, p_assessment_id, p_score);
  END save_mark;

  PROCEDURE save_attendance(p_teacher_user_id IN NUMBER, p_student_id IN NUMBER,
                            p_course_id IN NUMBER, p_attendance_date IN DATE,
                            p_present IN NUMBER) IS
  BEGIN
    record_course_attendance(p_teacher_user_id, p_student_id, p_course_id,
                             p_attendance_date, p_present);
  END save_attendance;

  PROCEDURE print_student_summary(p_student_id IN NUMBER) IS
  BEGIN
    generate_student_academic_summary(p_student_id);
  END print_student_summary;

  PROCEDURE remove_empty_course(p_teacher_user_id IN NUMBER, p_course_id IN NUMBER) IS
  BEGIN
    delete_empty_course(p_teacher_user_id, p_course_id);
  END remove_empty_course;

  PROCEDURE remove_empty_student(p_teacher_user_id IN NUMBER, p_student_id IN NUMBER) IS
  BEGIN
    delete_empty_student(p_teacher_user_id, p_student_id);
  END remove_empty_student;

  FUNCTION weighted_score(p_student_id IN NUMBER, p_course_id IN NUMBER) RETURN NUMBER IS
  BEGIN
    RETURN weighted_course_score(p_student_id, p_course_id);
  END weighted_score;

  FUNCTION attendance_percent(p_student_id IN NUMBER, p_course_id IN NUMBER) RETURN NUMBER IS
  BEGIN
    RETURN course_attendance_percent(p_student_id, p_course_id);
  END attendance_percent;

  FUNCTION performance_status(p_student_id IN NUMBER, p_course_id IN NUMBER) RETURN VARCHAR2 IS
  BEGIN
    RETURN academic_performance_status(p_student_id, p_course_id);
  END performance_status;
END gradecurve_academic_pkg;
/
