import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Not, Repository } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Ticket } from './ticket.entity';
import { TicketPriority, TicketStatus, TicketType } from './enums';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { ImportResultDto } from './dto/import-result.dto';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ActorType } from '../audit-log/enums/actor-type.enum';
import { parseCsv, toCsvRow } from './csv.util';
import { withCurrentUserTransaction } from '../database/current-user-transaction';

const CSV_EXPORT_HEADERS = ['id', 'title', 'description', 'status', 'priority', 'type', 'assigneeId'];

const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.TODO]: [TicketStatus.IN_PROGRESS],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.IN_REVIEW],
  [TicketStatus.IN_REVIEW]: [TicketStatus.DONE],
  [TicketStatus.DONE]: [],
};

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketsRepository: Repository<Ticket>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly projectsService: ProjectsService,
    @Inject(forwardRef(() => UsersService)) private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAllByProject(projectId: number): Promise<Ticket[]> {
    if (!projectId) throw new BadRequestException('projectId is required');
    return this.ticketsRepository.find({ where: { projectId } });
  }

  async findOne(id: number): Promise<Ticket> {
    const ticket = await this.ticketsRepository.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    await this.assertProjectActive(ticket.projectId);
    return ticket;
  }

  async findDeleted(projectId?: number): Promise<Ticket[]> {
    return this.ticketsRepository.find({
      withDeleted: true,
      where: projectId !== undefined
        ? { deletedAt: Not(IsNull()), projectId }
        : { deletedAt: Not(IsNull()) },
    });
  }

  async create(dto: CreateTicketDto): Promise<Ticket> {
    await this.projectsService.findOne(dto.projectId);

    if (dto.assigneeId) {
      await this.usersService.findOne(dto.assigneeId);
    }

    let assigneeId: number | null = dto.assigneeId ?? null;
    const autoAssigned = !assigneeId;
    if (!assigneeId) {
      assigneeId = await this.autoAssign(dto.projectId);
    }

    const ticket = this.ticketsRepository.create({
      title: dto.title,
      description: dto.description ?? null,
      status: dto.status ?? TicketStatus.TODO,
      priority: dto.priority,
      type: dto.type,
      projectId: dto.projectId,
      assigneeId: assigneeId,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      isOverdue: false,
    });

    // Preserve per-request user auditing for ticket creation by using the
    // current-user transaction helper (this sets issueflow.current_user_id so
    // the DB trigger records the CREATE as performed by the requesting user).
    const saved = await withCurrentUserTransaction(this.dataSource, (manager) => {
      return manager.getRepository(Ticket).save(ticket);
    });

    if (autoAssigned && assigneeId !== null) {
      await this.auditLogService.record({
        action: 'AUTO_ASSIGN',
        entityType: 'TICKET',
        entityId: String(saved.id),
        performedBy: 'SYSTEM',
        actor: ActorType.SYSTEM,
      });
    }

    return saved;
  }

  async update(id: number, dto: UpdateTicketDto): Promise<Ticket> {
    const ticket = await this.findOne(id); // assertProjectActive called inside findOne

    if (ticket.status === TicketStatus.DONE) {
      throw new BadRequestException('A DONE ticket cannot be updated');
    }

    if (dto.status !== undefined && dto.status !== ticket.status) {
      const allowed = STATUS_TRANSITIONS[ticket.status];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Cannot transition status from ${ticket.status} to ${dto.status}`,
        );
      }

      if (dto.status === TicketStatus.DONE) {
        const withBlockers = await this.ticketsRepository.findOne({
          where: { id },
          relations: ['blockers'],
        });
        const unresolved = (withBlockers?.blockers ?? []).filter(
          (b) => b.status !== TicketStatus.DONE,
        );
        if (unresolved.length > 0) {
          throw new BadRequestException(
            `Cannot mark as DONE: unresolved blockers: ${unresolved.map((b) => b.id).join(', ')}`,
          );
        }
      }
    }

    // Optimistic concurrency check: reject if the client's known version is stale
    if (dto.version !== undefined && ticket.version !== dto.version) {
      throw new ConflictException('Ticket was modified by another request');
    }

    Object.assign(ticket, {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.priority !== undefined && { priority: dto.priority, isOverdue: false }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.assigneeId !== undefined && { assigneeId: dto.assigneeId }),
      ...(dto.dueDate !== undefined && { dueDate: new Date(dto.dueDate) }),
    });

    const saved = await withCurrentUserTransaction(this.dataSource, (manager) => {
      return manager.getRepository(Ticket).save(ticket);
    });

    return saved;
  }

  async findOverdueForEscalation(): Promise<Ticket[]> {
    return this.ticketsRepository
      .createQueryBuilder('ticket')
      .where('ticket.dueDate IS NOT NULL')
      .andWhere('ticket.dueDate < :now', { now: new Date() })
      .andWhere('ticket.status != :done', { done: TicketStatus.DONE })
      .andWhere('ticket.deletedAt IS NULL')
      .getMany();
  }

  async softDelete(id: number): Promise<void> {
    const ticket = await this.findOne(id); // assertProjectActive called inside findOne
    if (ticket.status === TicketStatus.DONE) {
      throw new BadRequestException('A DONE ticket cannot be deleted');
    }
    await withCurrentUserTransaction(this.dataSource, async (manager) => {
      await manager.getRepository(Ticket).softDelete(id);
    });
  }

  async restore(id: number): Promise<void> {
    const ticket = await this.ticketsRepository.findOne({ where: { id }, withDeleted: true });
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    if (!ticket.deletedAt) throw new BadRequestException('Ticket is not deleted');

    const project = await this.projectsService.findOneWithDeleted(ticket.projectId);
    if (!project || project.deletedAt !== null) {
      throw new ConflictException('Parent project is soft-deleted; restore the project first');
    }

    await withCurrentUserTransaction(this.dataSource, async (manager) => {
      await manager.getRepository(Ticket).restore(id);
    });
  }

  async exportToCsv(projectId: string): Promise<string> {
    const pid = parseInt(projectId, 10);
    if (isNaN(pid)) throw new NotFoundException(`Project ${projectId} not found`);
    await this.projectsService.findOne(pid);

    const tickets = await this.ticketsRepository.find({ where: { projectId: pid } });
    const header = toCsvRow(CSV_EXPORT_HEADERS);
    const rows = tickets.map((t) =>
      toCsvRow([
        String(t.id),
        t.title,
        t.description ?? '',
        t.status,
        t.priority,
        t.type,
        t.assigneeId != null ? String(t.assigneeId) : '',
      ]),
    );
    return [header, ...rows].join('\n');
  }

  async importFromCsv(projectId: string, fileBuffer: Buffer): Promise<ImportResultDto> {
    const pid = parseInt(projectId, 10);
    if (isNaN(pid)) throw new NotFoundException(`Project ${projectId} not found`);
    await this.projectsService.findOne(pid);

    const rows = parseCsv(fileBuffer.toString('utf8'));
    let created = 0;
    let failed = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // 1-based, skipping header row
      const row = rows[i];

      try {
        const title = row['title'] ?? '';
        if (!title) throw new Error('title is required');

        const rawStatus = row['status'] ?? '';
        const status: TicketStatus = rawStatus
          ? this.parseEnum(rawStatus, TicketStatus, 'status')
          : TicketStatus.TODO;

        const rawPriority = row['priority'] ?? '';
        const priority: TicketPriority = rawPriority
          ? this.parseEnum(rawPriority, TicketPriority, 'priority')
          : TicketPriority.LOW;

        const rawType = row['type'] ?? '';
        const type: TicketType = rawType
          ? this.parseEnum(rawType, TicketType, 'type')
          : TicketType.TECHNICAL;

        const rawAssigneeId = row['assigneeId'] ?? '';
        let assigneeId: number | null = rawAssigneeId ? parseInt(rawAssigneeId, 10) : null;
        const autoAssigned = !assigneeId;
        if (!assigneeId) {
          assigneeId = await this.autoAssign(pid);
        }

        const rawDueDate = row['dueDate'] ?? '';
        const dueDate = rawDueDate ? new Date(rawDueDate) : null;

        const ticket = this.ticketsRepository.create({
          title,
          description: row['description'] ?? null,
          status,
          priority,
          type,
          projectId: pid,
          assigneeId,
          dueDate,
          isOverdue: false,
        });
        // Save each imported ticket with skip_audit so the DB trigger does not
        // emit a CREATE audit row; we will explicitly record AUTO_ASSIGN.
        const saved = await this.dataSource.transaction(async (manager) => {
          await manager.query('SELECT set_config($1, $2, true)', [
            'issueflow.skip_audit',
            '1',
          ]);
          return manager.getRepository(Ticket).save(ticket);
        });

        if (autoAssigned && assigneeId !== null) {
          await this.auditLogService.record({
            action: 'AUTO_ASSIGN',
            entityType: 'TICKET',
            entityId: String(saved.id),
            performedBy: 'SYSTEM',
            actor: ActorType.SYSTEM,
          });
        }

        created++;
      } catch (err) {
        failed++;
        errors.push({ row: rowNum, error: (err as Error).message });
      }
    }

    return { created, failed, errors };
  }

  private async assertProjectActive(projectId: number): Promise<void> {
    const project = await this.projectsService.findOneWithDeleted(projectId);
    if (!project || project.deletedAt !== null) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
  }

  private parseEnum<T extends Record<string, string>>(
    value: string,
    enumObj: T,
    fieldName: string,
  ): T[keyof T] {
    const valid = Object.values(enumObj) as string[];
    if (!valid.includes(value)) {
      throw new Error(`invalid ${fieldName}: ${value}`);
    }
    return value as T[keyof T];
  }

  async getProjectWorkload(
    projectId: number,
  ): Promise<{ userId: number; username: string; openTicketCount: number }[]> {
    const rows: { userId: string; username: string; openTicketCount: string }[] =
      await this.ticketsRepository.query(
        `SELECT u.id AS "userId", u.username, COUNT(t.id)::int AS "openTicketCount"
         FROM users u
         INNER JOIN (
           SELECT DISTINCT "assigneeId" FROM tickets
           WHERE "projectId" = $1 AND "deletedAt" IS NULL
         ) linked ON linked."assigneeId" = u.id
         LEFT JOIN tickets t
           ON t."assigneeId" = u.id
          AND t."projectId" = $1
          AND t.status != $2
          AND t."deletedAt" IS NULL
         WHERE u.role = $3
         GROUP BY u.id, u.username
         ORDER BY COUNT(t.id) ASC`,
        [projectId, TicketStatus.DONE, UserRole.DEVELOPER],
      );
    return rows.map((r) => ({
      userId: Number(r.userId),
      username: r.username,
      openTicketCount: Number(r.openTicketCount),
    }));
  }

  async findByAssignee(userId: number): Promise<Ticket[]> {
    return this.ticketsRepository.find({ where: { assigneeId: userId }, withDeleted: true });
  }

  async reAutoAssign(ticketId: number, projectId: number): Promise<void> {
    const newAssigneeId = await this.autoAssign(projectId);
    await this.ticketsRepository.update({ id: ticketId }, { assigneeId: newAssigneeId });
    if (newAssigneeId !== null) {
      await this.auditLogService.record({
        action: 'AUTO_ASSIGN',
        entityType: 'TICKET',
        entityId: String(ticketId),
        performedBy: 'SYSTEM',
        actor: ActorType.SYSTEM,
      });
    }
  }

  private async autoAssign(projectId: number): Promise<number | null> {
    const rows: { userId: string }[] = await this.ticketsRepository.query(
      `SELECT u.id AS "userId"
       FROM users u
       INNER JOIN (
         SELECT DISTINCT "assigneeId" FROM tickets
         WHERE "projectId" = $1 AND "deletedAt" IS NULL
       ) linked ON linked."assigneeId" = u.id
       LEFT JOIN tickets t
         ON t."assigneeId" = u.id
        AND t."projectId" = $1
        AND t.status != $2
        AND t."deletedAt" IS NULL
       WHERE u.role = $3
       GROUP BY u.id, u."createdAt"
       ORDER BY COUNT(t.id) ASC, u."createdAt" ASC
       LIMIT 1`,
      [projectId, TicketStatus.DONE, UserRole.DEVELOPER],
    );
    return rows.length ? Number(rows[0].userId) : null;
  }
}
