"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UppercaseAuditEntityTypes1716000000002 = void 0;
class UppercaseAuditEntityTypes1716000000002 {
    constructor() {
        this.name = 'UppercaseAuditEntityTypes1716000000002';
    }
    async up(queryRunner) {
        const tables = [
            { table: 'tickets', entityType: 'TICKET' },
            { table: 'projects', entityType: 'PROJECT' },
            { table: 'users', entityType: 'USER' },
            { table: 'comments', entityType: 'COMMENT' },
            { table: 'attachments', entityType: 'ATTACHMENT' },
            { table: 'ticket_blocker', entityType: 'TICKET_DEPENDENCY' },
        ];
        for (const { table } of tables) {
            await queryRunner.query(`DROP TRIGGER IF EXISTS audit_${table} ON "${table}";`);
        }
        for (const { table, entityType } of tables) {
            await queryRunner.query(`
        CREATE TRIGGER audit_${table}
        AFTER INSERT OR UPDATE OR DELETE ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION issueflow_audit_trigger('${entityType}');
      `);
        }
        await queryRunner.query(`
      UPDATE audit_logs SET "entityType" =
        CASE "entityType"
          WHEN 'Ticket'           THEN 'TICKET'
          WHEN 'Project'          THEN 'PROJECT'
          WHEN 'User'             THEN 'USER'
          WHEN 'Comment'          THEN 'COMMENT'
          WHEN 'Attachment'       THEN 'ATTACHMENT'
          WHEN 'TicketDependency' THEN 'TICKET_DEPENDENCY'
          ELSE "entityType"
        END
      WHERE "entityType" IN ('Ticket','Project','User','Comment','Attachment','TicketDependency');
    `);
    }
    async down(queryRunner) {
        const tables = [
            { table: 'tickets', entityType: 'Ticket' },
            { table: 'projects', entityType: 'Project' },
            { table: 'users', entityType: 'User' },
            { table: 'comments', entityType: 'Comment' },
            { table: 'attachments', entityType: 'Attachment' },
            { table: 'ticket_blocker', entityType: 'TicketDependency' },
        ];
        for (const { table } of tables) {
            await queryRunner.query(`DROP TRIGGER IF EXISTS audit_${table} ON "${table}";`);
        }
        for (const { table, entityType } of tables) {
            await queryRunner.query(`
        CREATE TRIGGER audit_${table}
        AFTER INSERT OR UPDATE OR DELETE ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION issueflow_audit_trigger('${entityType}');
      `);
        }
    }
}
exports.UppercaseAuditEntityTypes1716000000002 = UppercaseAuditEntityTypes1716000000002;
