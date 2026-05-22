import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { RecordAuditLogDto } from './dto/record-audit-log.dto';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

@Injectable()
export class AuditLogService implements OnModuleInit {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.installAuditTriggers();
    } catch (err) {
      this.logger.error('Failed to install audit triggers', err);
    }
  }

  private async installAuditTriggers(): Promise<void> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query(`
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

      const tables: Array<{ table: string; entityType: string }> = [
        { table: 'tickets', entityType: 'TICKET' },
        { table: 'projects', entityType: 'PROJECT' },
        { table: 'users', entityType: 'USER' },
        { table: 'comments', entityType: 'COMMENT' },
        { table: 'attachments', entityType: 'ATTACHMENT' },
        { table: 'ticket_blocker', entityType: 'TICKET_DEPENDENCY' },
      ];

      for (const { table, entityType } of tables) {
        await runner.query(`DROP TRIGGER IF EXISTS audit_${table} ON "${table}";`);
        await runner.query(`
          CREATE TRIGGER audit_${table}
          AFTER INSERT OR UPDATE OR DELETE ON "${table}"
          FOR EACH ROW EXECUTE FUNCTION issueflow_audit_trigger('${entityType}');
        `);
      }
    } finally {
      await runner.release();
    }
  }

  async record(dto: RecordAuditLogDto): Promise<void> {
    try {
      const entry = this.auditLogRepository.create(dto);
      await this.auditLogRepository.save(entry);
    } catch (err) {
      this.logger.error('Failed to write audit log entry', err);
    }
  }

  async findAll(query: QueryAuditLogDto): Promise<(Omit<AuditLog, 'entityId' | 'performedBy'> & { entityId: number | string; performedBy: number | string })[]> {
    const { entityType, entityId, action, actor } = query;

    const where: FindOptionsWhere<AuditLog> = {};
    if (entityType !== undefined) where.entityType = entityType;
    if (entityId !== undefined) where.entityId = entityId;
    if (action !== undefined) where.action = action;
    if (actor !== undefined) where.actor = actor;

    const logs = await this.auditLogRepository.find({
      where,
      order: { timestamp: 'DESC' },
    });

    return logs.map((log) => {
      const parsedEntityId = Number(log.entityId);
      const parsedPerformedBy = Number(log.performedBy);
      return {
        ...log,
        entityId: isNaN(parsedEntityId) ? log.entityId : parsedEntityId,
        performedBy: isNaN(parsedPerformedBy) ? log.performedBy : parsedPerformedBy,
      };
    });
  }
}
