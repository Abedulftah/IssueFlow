import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixAuditTriggerDeletedAt1716000000001 implements MigrationInterface {
  name = 'FixAuditTriggerDeletedAt1716000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION issueflow_audit_trigger()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      DECLARE
        v_action       TEXT;
        v_entity_id    TEXT;
        v_performed_by TEXT;
        v_new_json     JSONB;
        v_old_json     JSONB;
      BEGIN
        IF TG_OP = 'INSERT' THEN
          v_action := 'CREATE';
        ELSIF TG_OP = 'DELETE' THEN
          v_action := 'DELETE';
        ELSIF TG_OP = 'UPDATE' THEN
          v_new_json := row_to_json(NEW)::jsonb;
          v_old_json := row_to_json(OLD)::jsonb;
          IF (v_new_json->>'deletedAt') IS NOT NULL AND (v_old_json->>'deletedAt') IS NULL THEN
            v_action := 'DELETE';
          ELSIF (v_old_json->>'deletedAt') IS NOT NULL AND (v_new_json->>'deletedAt') IS NULL THEN
            v_action := 'RESTORE';
          ELSE
            v_action := 'UPDATE';
          END IF;
        ELSE
          v_action := 'UPDATE';
        END IF;

        IF TG_TABLE_NAME = 'ticket_blocker' THEN
          IF TG_OP = 'DELETE' THEN
            v_entity_id := OLD.blocked_id::text || '-' || OLD.blocker_id::text;
          ELSE
            v_entity_id := NEW.blocked_id::text || '-' || NEW.blocker_id::text;
          END IF;
        ELSE
          IF TG_OP = 'DELETE' THEN
            v_entity_id := OLD.id::text;
          ELSE
            v_entity_id := NEW.id::text;
          END IF;
        END IF;

        v_performed_by := COALESCE(
          NULLIF(current_setting('issueflow.current_user_id', true), ''),
          'SYSTEM'
        );

        INSERT INTO audit_logs (action, "entityType", "entityId", "performedBy", actor, timestamp)
        VALUES (
          v_action,
          TG_ARGV[0],
          v_entity_id,
          v_performed_by,
          'USER',
          NOW()
        );

        RETURN NULL;
      END;
      $$;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Restoring the original is not needed; the function is replaced in place.
  }
}
