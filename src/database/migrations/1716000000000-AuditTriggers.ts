import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditTriggers1716000000000 implements MigrationInterface {
  name = 'AuditTriggers1716000000000';

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
      BEGIN
        -- Derive semantic action from TG_OP + soft-delete columns
        IF TG_OP = 'INSERT' THEN
          v_action := 'CREATE';
        ELSIF TG_OP = 'DELETE' THEN
          v_action := 'DELETE';
        ELSIF TG_OP = 'UPDATE'
              AND NEW."deletedAt" IS NOT NULL
              AND OLD."deletedAt" IS NULL THEN
          v_action := 'DELETE';
        ELSIF TG_OP = 'UPDATE'
              AND OLD."deletedAt" IS NOT NULL
              AND NEW."deletedAt" IS NULL THEN
          v_action := 'RESTORE';
        ELSE
          v_action := 'UPDATE';
        END IF;

        -- Entity ID: junction table ticket_blocker has no id column
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

        -- Actor identity from session variable; default to 'SYSTEM' when unset
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

    const tables: Array<{ table: string; entityType: string }> = [
      { table: 'tickets', entityType: 'TICKET' },
      { table: 'projects', entityType: 'PROJECT' },
      { table: 'users', entityType: 'USER' },
      { table: 'comments', entityType: 'COMMENT' },
      { table: 'attachments', entityType: 'ATTACHMENT' },
      { table: 'ticket_blocker', entityType: 'TICKET_DEPENDENCY' },
    ];

    for (const { table, entityType } of tables) {
      await queryRunner.query(`
        CREATE TRIGGER audit_${table}
        AFTER INSERT OR UPDATE OR DELETE ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION issueflow_audit_trigger('${entityType}');
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const tables = ['tickets', 'projects', 'users', 'comments', 'attachments', 'ticket_blocker'];
    for (const table of tables) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS audit_${table} ON "${table}";`);
    }
    await queryRunner.query(`DROP FUNCTION IF EXISTS issueflow_audit_trigger();`);
  }
}
