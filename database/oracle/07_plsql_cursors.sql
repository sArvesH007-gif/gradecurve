-- Three cursor demonstrations, each parameterized by Oracle IDs.

CREATE OR REPLACE PROCEDURE print_course_students_explicit (
  p_course_id IN NUMBER
) AS
  CURSOR c_students IS
    SELECT sp.registration_no, u.full_name, sl.name AS slot_name
    FROM enrollments e
    JOIN student_profiles sp ON sp.student_id = e.student_id
    JOIN users u ON u.user_id = sp.user_id
    JOIN class_slots sl ON sl.slot_id = e.slot_id
    WHERE e.course_id = p_course_id
    ORDER BY sp.registration_no;
  v_row c_students%ROWTYPE;
BEGIN
  OPEN c_students;
  LOOP
    FETCH c_students INTO v_row;
    EXIT WHEN c_students%NOTFOUND;
    DBMS_OUTPUT.PUT_LINE(v_row.registration_no || ' | ' || v_row.full_name ||
                         ' | ' || v_row.slot_name);
  END LOOP;
  CLOSE c_students;
EXCEPTION
  WHEN OTHERS THEN
    IF c_students%ISOPEN THEN CLOSE c_students; END IF;
    RAISE;
END;
/

CREATE OR REPLACE PROCEDURE print_course_students_for_loop (
  p_course_id IN NUMBER
) AS
BEGIN
  FOR rec IN (
    SELECT sp.registration_no, u.full_name, sl.name AS slot_name
    FROM enrollments e
    JOIN student_profiles sp ON sp.student_id = e.student_id
    JOIN users u ON u.user_id = sp.user_id
    JOIN class_slots sl ON sl.slot_id = e.slot_id
    WHERE e.course_id = p_course_id
    ORDER BY sp.registration_no
  ) LOOP
    DBMS_OUTPUT.PUT_LINE(rec.registration_no || ' | ' || rec.full_name ||
                         ' | ' || rec.slot_name);
  END LOOP;
END;
/

CREATE OR REPLACE PROCEDURE print_course_slot_students (
  p_course_id IN NUMBER,
  p_slot_id IN NUMBER
) AS
  CURSOR c_students(cp_course_id NUMBER, cp_slot_id NUMBER) IS
    SELECT sp.registration_no, u.full_name
    FROM enrollments e
    JOIN student_profiles sp ON sp.student_id = e.student_id
    JOIN users u ON u.user_id = sp.user_id
    WHERE e.course_id = cp_course_id AND e.slot_id = cp_slot_id
    ORDER BY sp.registration_no;
BEGIN
  FOR rec IN c_students(p_course_id, p_slot_id) LOOP
    DBMS_OUTPUT.PUT_LINE(rec.registration_no || ' | ' || rec.full_name);
  END LOOP;
END;
/
