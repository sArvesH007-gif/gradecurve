-- Audits each change to an existing mark's score after the update succeeds.
CREATE OR REPLACE TRIGGER marks_score_audit_trg
AFTER UPDATE OF score ON marks
FOR EACH ROW
WHEN (OLD.score <> NEW.score)
BEGIN
  INSERT INTO mark_audit
    (mark_id, student_id, assessment_id, old_score, new_score,
     action_type, changed_at, changed_by_user_id)
  VALUES
    (:OLD.mark_id, :OLD.student_id, :OLD.assessment_id, :OLD.score, :NEW.score,
     'UPDATE', SYSTIMESTAMP, :NEW.entered_by_user_id);
END;
/
