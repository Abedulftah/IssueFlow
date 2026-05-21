import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { RecordAuditLogDto } from './dto/record-audit-log.dto';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

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
