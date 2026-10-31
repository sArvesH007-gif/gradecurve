-- Executable Oracle exception demonstrations. Each expected error is caught,
-- logged, and leaves no failed DML statement committed.
SET SERVEROUTPUT ON SIZE UNLIMITED

DECLARE
  v_student_id NUMBER;
  v_slot_id NUMBER;
  v_teacher_user_id NUMBER;
BEGIN
  BEGIN
    SELECT student_id INTO v_student_id
    FROM student_profiles WHERE registration_no = 'NO-SUCH-DEMO-STUDENT';
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      DBMS_OUTPUT.PUT_LINE('NO_DATA_FOUND handled for an unknown registration number.');
  END;

  SELECT user_id INTO v_teacher_user_id
  FROM users WHERE username = 'dr.sharma@gradecurve.demo';
  BEGIN
    SELECT sl.slot_id INTO v_slot_id
    FROM class_slots sl
    JOIN teacher_profiles tp ON tp.teacher_id = sl.teacher_id
    WHERE tp.user_id = v_teacher_user_id;
  EXCEPTION
    WHEN TOO_MANY_ROWS THEN
      DBMS_OUTPUT.PUT_LINE('TOO_MANY_ROWS handled when a faculty member owns multiple slots.');
  END;

  BEGIN
    INSERT INTO class_slots (name, teacher_id)
    SELECT name, teacher_id FROM class_slots WHERE name = 'L31+L32';
  EXCEPTION
    WHEN DUP_VAL_ON_INDEX THEN
      DBMS_OUTPUT.PUT_LINE('DUP_VAL_ON_INDEX handled for a duplicate class-slot name.');
  END;

  BEGIN
    RAISE_APPLICATION_ERROR(-20050, 'Intentional custom exception demonstration.');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLCODE = -20050 THEN
        DBMS_OUTPUT.PUT_LINE('Custom RAISE_APPLICATION_ERROR handled: ' || SQLERRM);
      ELSE
        RAISE;
      END IF;
  END;
END;
/
