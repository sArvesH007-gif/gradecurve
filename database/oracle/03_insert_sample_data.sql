-- Deterministic, fictional GradeCurve fixture data. Re-run only after recreating
-- the schema. It creates 45 demo students, two courses and three class slots.
SET SERVEROUTPUT ON

DECLARE
  TYPE t_num_by_int IS TABLE OF NUMBER INDEX BY PLS_INTEGER;
  TYPE t_num_by_key IS TABLE OF NUMBER INDEX BY VARCHAR2(64);
  TYPE t_text_by_int IS TABLE OF VARCHAR2(32) INDEX BY PLS_INTEGER;
  TYPE t_score_by_int IS TABLE OF NUMBER INDEX BY PLS_INTEGER;
  v_teacher_users t_num_by_int;
  v_teacher_ids t_num_by_int;
  v_course_ids t_num_by_int;
  v_slot_ids t_num_by_int;
  v_student_ids t_num_by_int;
  v_assessment_ids t_num_by_key;
  v_course_codes t_text_by_int;
  v_component_names t_text_by_int;
  v_max_scores t_score_by_int;
  v_weights t_score_by_int;
  v_user_id NUMBER;
  v_student_id NUMBER;
  v_generated_id NUMBER;
  v_assessment_id NUMBER;
  v_submission_id NUMBER;
  v_slot_index PLS_INTEGER;
  v_section_position PLS_INTEGER;
  v_course_offset PLS_INTEGER;
  v_absent_count PLS_INTEGER;
  v_guidance_student_index PLS_INTEGER;
  v_guidance_course_index PLS_INTEGER;
  v_baseline NUMBER;
  v_ability NUMBER;
  v_score NUMBER;
  v_reg_no VARCHAR2(24);
  v_name VARCHAR2(160);
  v_status VARCHAR2(12);
BEGIN
  v_course_codes(1) := 'CSE1004';
  v_course_codes(2) := 'CSE1007';
  v_component_names(1) := 'CAT1'; v_max_scores(1) := 50; v_weights(1) := 0.15;
  v_component_names(2) := 'CAT2'; v_max_scores(2) := 50; v_weights(2) := 0.15;
  v_component_names(3) := 'DA1';  v_max_scores(3) := 10; v_weights(3) := 0.10;
  v_component_names(4) := 'DA2';  v_max_scores(4) := 10; v_weights(4) := 0.10;
  v_component_names(5) := 'DA3';  v_max_scores(5) := 10; v_weights(5) := 0.10;
  v_component_names(6) := 'FAT';  v_max_scores(6) := 100; v_weights(6) := 0.40;

  INSERT INTO users (username, full_name, password_hash, user_role)
  VALUES ('dr.sharma@gradecurve.demo', 'Demo Faculty One', 'DEMO_ONLY_NO_LOGIN', 'TEACHER')
  RETURNING user_id INTO v_generated_id;
  v_teacher_users(1) := v_generated_id;
  INSERT INTO teacher_profiles (user_id) VALUES (v_teacher_users(1))
  RETURNING teacher_id INTO v_generated_id;
  v_teacher_ids(1) := v_generated_id;
  INSERT INTO users (username, full_name, password_hash, user_role)
  VALUES ('ananya@gradecurve.demo', 'Demo Faculty Two', 'DEMO_ONLY_NO_LOGIN', 'TEACHER')
  RETURNING user_id INTO v_generated_id;
  v_teacher_users(2) := v_generated_id;
  INSERT INTO teacher_profiles (user_id) VALUES (v_teacher_users(2))
  RETURNING teacher_id INTO v_generated_id;
  v_teacher_ids(2) := v_generated_id;

  INSERT INTO courses (code, name, teacher_id)
  VALUES ('CSE1004', 'Network Essentials', v_teacher_ids(1))
  RETURNING course_id INTO v_generated_id;
  v_course_ids(1) := v_generated_id;
  INSERT INTO courses (code, name, teacher_id)
  VALUES ('CSE1007', 'Database Management Systems', v_teacher_ids(2))
  RETURNING course_id INTO v_generated_id;
  v_course_ids(2) := v_generated_id;

  INSERT INTO class_slots (name, teacher_id) VALUES ('L31+L32', v_teacher_ids(1)) RETURNING slot_id INTO v_generated_id;
  v_slot_ids(1) := v_generated_id;
  INSERT INTO class_slots (name, teacher_id) VALUES ('A1', v_teacher_ids(2)) RETURNING slot_id INTO v_generated_id;
  v_slot_ids(2) := v_generated_id;
  INSERT INTO class_slots (name, teacher_id) VALUES ('B2', v_teacher_ids(1)) RETURNING slot_id INTO v_generated_id;
  v_slot_ids(3) := v_generated_id;

  FOR c IN 1..2 LOOP
    FOR s IN 1..3 LOOP
      INSERT INTO course_slots (course_id, slot_id) VALUES (v_course_ids(c), v_slot_ids(s));
    END LOOP;
    FOR a IN 1..6 LOOP
      INSERT INTO assessments (course_id, name, max_score, weight)
      VALUES (v_course_ids(c), v_component_names(a), v_max_scores(a), v_weights(a))
      RETURNING assessment_id INTO v_assessment_id;
      v_assessment_ids(v_course_codes(c) || ':' || v_component_names(a)) := v_assessment_id;
    END LOOP;
  END LOOP;

  FOR i IN 1..45 LOOP
    v_reg_no := '24BCE' || LPAD(TO_CHAR(i), 4, '0');
    v_name := 'Demo Student ' || LPAD(TO_CHAR(i), 2, '0');
    v_slot_index := FLOOR((i - 1) / 15) + 1;
    INSERT INTO users (username, full_name, password_hash, user_role)
    VALUES (v_reg_no, v_name, 'DEMO_ONLY_NO_LOGIN', 'STUDENT')
    RETURNING user_id INTO v_user_id;
    INSERT INTO student_profiles (user_id, registration_no, active_slot_id)
    VALUES (v_user_id, v_reg_no, v_slot_ids(v_slot_index))
    RETURNING student_id INTO v_generated_id;
    v_student_id := v_generated_id;
    v_student_ids(i) := v_student_id;

    FOR c IN 1..2 LOOP
      INSERT INTO enrollments (student_id, course_id, slot_id)
      VALUES (v_student_id, v_course_ids(c), v_slot_ids(v_slot_index));
      v_course_offset := CASE WHEN c = 1 THEN 7 ELSE 19 END;
      v_section_position := MOD(i - 1, 15);
      v_ability := CASE WHEN v_section_position >= 12 THEN 18
                        WHEN v_section_position <= 2 THEN -14 ELSE 0 END;

      FOR a IN 1..6 LOOP
        IF NOT (a = 6 AND MOD(i - 1, 9) = 0) THEN
          v_baseline := 35 + MOD((i - 1) * 17 + v_course_offset + (a - 1) * 13, 45);
          v_score := ROUND(v_max_scores(a) * (v_baseline + v_ability) / 100, 1);
          INSERT INTO marks (student_id, assessment_id, score, mark_source, entered_by_user_id)
          VALUES (v_student_id,
                  v_assessment_ids(v_course_codes(c) || ':' || v_component_names(a)),
                  v_score, 'FACULTY', v_teacher_users(c));
        END IF;
      END LOOP;

      IF i IN (5, 17, 37) THEN
        v_absent_count := 4;
      ELSE
        v_absent_count := MOD((i - 1) * 3 + v_course_offset, 3);
      END IF;
      FOR d IN 0..11 LOOP
        INSERT INTO attendance (student_id, course_id, attendance_date, present)
        VALUES (v_student_id, v_course_ids(c), DATE '2026-08-01' + d * 3,
                CASE WHEN d >= v_absent_count THEN 1 ELSE 0 END);
      END LOOP;
    END LOOP;
  END LOOP;

  FOR j IN 0..4 LOOP
    v_student_id := v_student_ids(j * 9 + 1);
    v_assessment_id := v_assessment_ids('CSE1004:FAT');
    v_score := 64 + MOD(j * 9, 4) * 5;
    v_status := CASE WHEN j = 0 THEN 'APPROVED' ELSE 'PENDING' END;
    INSERT INTO mark_submissions
      (student_id, assessment_id, score, peer_scores_json, submission_status, is_outlier, reason)
    VALUES
      (v_student_id, v_assessment_id, v_score, '[52,61,68,74,81]', v_status,
       CASE WHEN j = 4 THEN 1 ELSE 0 END,
       'Fictional demo fallback mark awaiting or completed faculty review.')
    RETURNING submission_id INTO v_submission_id;
    IF j = 0 THEN
      INSERT INTO marks (student_id, assessment_id, score, mark_source, entered_by_user_id)
      VALUES (v_student_id, v_assessment_id, v_score, 'APPROVED_FALLBACK', v_teacher_users(1));
      INSERT INTO mark_verifications (submission_id, reviewer_id, decision, official_score, note)
      VALUES (v_submission_id, v_teacher_users(1), 'APPROVED', v_score, 'Seeded demo verification.');
    END IF;
  END LOOP;

  INSERT INTO study_matches (requester_id, peer_id, course_id, message)
  VALUES (v_student_ids(1), v_student_ids(13), v_course_ids(2),
          'Fictional demo study group request for database normalization.');

  FOR j IN 1..3 LOOP
    v_guidance_student_index := CASE j WHEN 1 THEN 5 WHEN 2 THEN 17 ELSE 37 END;
    v_guidance_course_index := CASE WHEN MOD(j, 2) = 1 THEN 1 ELSE 2 END;
    INSERT INTO guidance_alerts (student_id, teacher_user_id, course_id, message, alert_status, sent_at)
    VALUES (v_student_ids(v_guidance_student_index),
            v_teacher_users(1), v_course_ids(v_guidance_course_index),
            'Fictional demo supportive check-in about recent progress and attendance.',
            'SENT', SYSTIMESTAMP);
  END LOOP;

  COMMIT;
  DBMS_OUTPUT.PUT_LINE('Seeded 45 fictional students, 2 courses, 3 slots, 12 assessments, and 1,080 attendance rows.');
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
/
