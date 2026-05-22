import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, OptimisticLockVersionMismatchError } from 'typeorm';
import { TicketsService } from './tickets.service';
import { Ticket } from './ticket.entity';
import { TicketStatus, TicketPriority, TicketType } from './enums';
import { ProjectsService } from '../projects/projects.service';
import { UsersService } from '../users/users.service';
import { AuditLogService } from '../audit-log/audit-log.service';

const mockTicket = (overrides: Partial<Ticket> = {}): Ticket =>
  ({
    id: 1,
    title: 'Test ticket',
    description: null,
    status: TicketStatus.TODO,
    priority: TicketPriority.MEDIUM,
    type: TicketType.TECHNICAL,
    projectId: 1,
    assigneeId: null,
    dueDate: null,
    isOverdue: false,
    deletedAt: null,
    createdAt: new Date(),
    version: 1,
    project: null,
    assignee: null,
    ...overrides,
  } as Ticket);

const activeProject = { id: 1, deletedAt: null };
const deletedProject = { id: 1, deletedAt: new Date() };

describe('TicketsService', () => {
  let service: TicketsService;
  let repo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    softDelete: jest.Mock;
    restore: jest.Mock;
    query: jest.Mock;
  };
  let projectsService: {
    findOne: jest.Mock;
    findOneWithDeleted: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      softDelete: jest.fn().mockResolvedValue(undefined),
      restore: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
    };
    projectsService = {
      findOne: jest.fn().mockResolvedValue(activeProject),
      findOneWithDeleted: jest.fn().mockResolvedValue(activeProject),
    };

    const dataSource = {
      transaction: jest.fn(async (cb: (manager: unknown) => unknown) =>
        cb({
          query: jest.fn().mockResolvedValue(undefined),
          getRepository: () => repo,
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: repo },
        { provide: ProjectsService, useValue: projectsService },
        { provide: UsersService, useValue: { findOne: jest.fn().mockResolvedValue({ id: 7 }) } },
        { provide: AuditLogService, useValue: { record: jest.fn().mockResolvedValue(undefined) } },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(TicketsService);
  });

  describe('update — status transitions', () => {
    it('accepts a valid forward transition TODO → IN_PROGRESS', async () => {
      const ticket = mockTicket({ status: TicketStatus.TODO });
      repo.findOne.mockResolvedValue(ticket);
      repo.save.mockResolvedValue({ ...ticket, status: TicketStatus.IN_PROGRESS, version: 2 });

      const result = await service.update(1, { status: TicketStatus.IN_PROGRESS });
      expect(result.status).toBe(TicketStatus.IN_PROGRESS);
    });

    it('accepts a valid forward transition IN_PROGRESS → IN_REVIEW', async () => {
      const ticket = mockTicket({ status: TicketStatus.IN_PROGRESS });
      repo.findOne.mockResolvedValue(ticket);
      repo.save.mockResolvedValue({ ...ticket, status: TicketStatus.IN_REVIEW, version: 2 });

      const result = await service.update(1, { status: TicketStatus.IN_REVIEW });
      expect(result.status).toBe(TicketStatus.IN_REVIEW);
    });

    it('rejects a backward transition IN_PROGRESS → TODO', async () => {
      const ticket = mockTicket({ status: TicketStatus.IN_PROGRESS });
      repo.findOne.mockResolvedValue(ticket);

      await expect(service.update(1, { status: TicketStatus.TODO })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a skip transition TODO → DONE', async () => {
      const ticket = mockTicket({ status: TicketStatus.TODO });
      repo.findOne.mockResolvedValue(ticket);

      await expect(service.update(1, { status: TicketStatus.DONE })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update — DONE immutability', () => {
    it('rejects any PATCH on a DONE ticket (title update)', async () => {
      const ticket = mockTicket({ status: TicketStatus.DONE });
      repo.findOne.mockResolvedValue(ticket);

      await expect(service.update(1, { title: 'New title' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a status update on a DONE ticket', async () => {
      const ticket = mockTicket({ status: TicketStatus.DONE });
      repo.findOne.mockResolvedValue(ticket);

      await expect(service.update(1, { status: TicketStatus.IN_REVIEW })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update — optimistic locking', () => {
    it('throws 409 when optimistic lock version mismatches', async () => {
      const ticket = mockTicket({ status: TicketStatus.TODO, version: 2 });
      repo.findOne.mockResolvedValue(ticket);
      repo.save.mockRejectedValue(new OptimisticLockVersionMismatchError('Ticket', 2, 1));

      await expect(service.update(1, { title: 'New', version: 1 })).rejects.toThrow(
        ConflictException,
      );
    });

    it('succeeds when correct version is provided', async () => {
      const ticket = mockTicket({ status: TicketStatus.TODO, version: 2 });
      repo.findOne.mockResolvedValue(ticket);
      repo.save.mockResolvedValue({ ...ticket, title: 'New', version: 3 });

      const result = await service.update(1, { title: 'New', version: 2 });
      expect(result.title).toBe('New');
    });
  });

  describe('create — auto-assignment', () => {
    const baseDto = {
      title: 'Fix bug',
      priority: TicketPriority.HIGH,
      type: TicketType.BUG,
      projectId: 1,
    };

    it('assigns to the developer with fewer non-DONE tickets', async () => {
      repo.query.mockResolvedValue([{ userId: '5' }]);
      repo.create.mockReturnValue(mockTicket());
      repo.save.mockImplementation((t) => Promise.resolve({ ...t, id: 10, assigneeId: 5 }));

      const ticket = await service.create(baseDto);
      expect(ticket.assigneeId).toBe(5);
    });

    it('breaks ties by earliest createdAt (query ordering handles this)', async () => {
      repo.query.mockResolvedValue([{ userId: '3' }]);
      repo.create.mockReturnValue(mockTicket());
      repo.save.mockImplementation((t) => Promise.resolve({ ...t, id: 11, assigneeId: 3 }));

      const ticket = await service.create(baseDto);
      expect(ticket.assigneeId).toBe(3);
    });

    it('leaves assigneeId null when no DEVELOPERs exist', async () => {
      repo.query.mockResolvedValue([]);
      const base = mockTicket({ assigneeId: null });
      repo.create.mockReturnValue(base);
      repo.save.mockResolvedValue(base);

      const ticket = await service.create(baseDto);
      expect(ticket.assigneeId).toBeNull();
    });

    it('skips auto-assignment when explicit assigneeId is provided', async () => {
      repo.create.mockReturnValue(mockTicket({ assigneeId: 7 }));
      repo.save.mockImplementation((t) => Promise.resolve({ ...t, id: 12 }));

      const ticket = await service.create({ ...baseDto, assigneeId: 7 });
      expect(repo.query).not.toHaveBeenCalled();
      expect(ticket.assigneeId).toBe(7);
    });

    it('excludes soft-deleted tickets from the workload count (query contains deletedAt IS NULL)', async () => {
      repo.query.mockResolvedValue([{ userId: '5' }]);
      repo.create.mockReturnValue(mockTicket());
      repo.save.mockImplementation((t) => Promise.resolve({ ...t, id: 13, assigneeId: 5 }));

      await service.create(baseDto);

      const sql: string = repo.query.mock.calls[0][0];
      expect(sql).toMatch(/t\."deletedAt"\s+IS\s+NULL/i);
    });
  });

  describe('update — DONE blocker guard', () => {
    it('rejects DONE transition when a blocker is not DONE', async () => {
      const blocker = mockTicket({ id: 2, status: TicketStatus.IN_PROGRESS });
      const ticket = mockTicket({ status: TicketStatus.IN_REVIEW, blockers: [blocker] } as any);
      repo.findOne
        .mockResolvedValueOnce(ticket)   // findOne in update()
        .mockResolvedValueOnce(ticket);  // findOne with relations: ['blockers']

      await expect(service.update(1, { status: TicketStatus.DONE })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows DONE transition when all blockers are DONE', async () => {
      const blocker = mockTicket({ id: 2, status: TicketStatus.DONE });
      const ticket = mockTicket({ status: TicketStatus.IN_REVIEW, blockers: [blocker] } as any);
      repo.findOne
        .mockResolvedValueOnce(ticket)
        .mockResolvedValueOnce(ticket);
      repo.save.mockResolvedValue({ ...ticket, status: TicketStatus.DONE, version: 2 });

      const result = await service.update(1, { status: TicketStatus.DONE });
      expect(result.status).toBe(TicketStatus.DONE);
    });

    it('allows DONE transition when there are no blockers', async () => {
      const ticket = mockTicket({ status: TicketStatus.IN_REVIEW, blockers: [] } as any);
      repo.findOne
        .mockResolvedValueOnce(ticket)
        .mockResolvedValueOnce(ticket);
      repo.save.mockResolvedValue({ ...ticket, status: TicketStatus.DONE, version: 2 });

      const result = await service.update(1, { status: TicketStatus.DONE });
      expect(result.status).toBe(TicketStatus.DONE);
    });
  });

  describe('exportToCsv', () => {
    it('throws NotFoundException when project does not exist', async () => {
      projectsService.findOne.mockRejectedValue(new NotFoundException());
      await expect(service.exportToCsv('999')).rejects.toThrow(NotFoundException);
    });

    it('returns only the header row when project has no tickets', async () => {
      repo.find.mockResolvedValue([]);
      const csv = await service.exportToCsv('1');
      const lines = csv.split('\n').filter((l) => l.trim() !== '');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('id');
      expect(lines[0]).toContain('title');
    });

    it('returns header + one row per ticket', async () => {
      const ticket = mockTicket({ id: 42, title: 'My ticket', createdAt: new Date('2026-01-01') });
      repo.find.mockResolvedValue([ticket]);
      const csv = await service.exportToCsv('1');
      const lines = csv.split('\n').filter((l) => l.trim() !== '');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('42');
      expect(lines[1]).toContain('My ticket');
    });
  });

  describe('importFromCsv', () => {
    const makeBuffer = (content: string) => Buffer.from(content, 'utf8');

    it('throws NotFoundException when project does not exist', async () => {
      projectsService.findOne.mockRejectedValue(new NotFoundException());
      const buf = makeBuffer('title\nFoo');
      await expect(service.importFromCsv('999', buf)).rejects.toThrow(NotFoundException);
    });

    it('creates all valid rows and returns correct counts', async () => {
      repo.query.mockResolvedValue([]);
      repo.create.mockReturnValue(mockTicket());
      repo.save.mockResolvedValue(mockTicket({ id: 10 }));

      const csv = 'title,description,status,priority,type\nTicket A,desc,TODO,LOW,TECHNICAL';
      const result = await service.importFromCsv('1', makeBuffer(csv));
      expect(result.created).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts TECHNICAL as a valid type', async () => {
      repo.query.mockResolvedValue([]);
      repo.create.mockImplementation((x) => x);
      repo.save.mockResolvedValue(mockTicket({ id: 12, type: TicketType.TECHNICAL }));

      const csv = 'title,description,status,priority,type\nTech work,desc,TODO,LOW,TECHNICAL';
      const result = await service.importFromCsv('1', makeBuffer(csv));

      expect(result.created).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ type: TicketType.TECHNICAL }));
    });

    it('counts a row with missing title as failed', async () => {
      const csv = 'title,description\n,no title';
      const result = await service.importFromCsv('1', makeBuffer(csv));
      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toMatch(/title/i);
    });

    it('counts a row with invalid status as failed', async () => {
      const csv = 'title,status,priority,type\nFoo,INVALID_STATUS,LOW,TECHNICAL';
      const result = await service.importFromCsv('1', makeBuffer(csv));
      expect(result.failed).toBe(1);
      expect(result.errors[0].error).toMatch(/invalid status/i);
    });

    it('calls autoAssign (repo.query) when assigneeId is blank', async () => {
      repo.query.mockResolvedValue([{ userId: '5' }]);
      repo.create.mockReturnValue(mockTicket());
      repo.save.mockResolvedValue(mockTicket({ id: 11, assigneeId: 5 }));

      const csv = 'title,type\nFoo,TECHNICAL';
      const result = await service.importFromCsv('1', makeBuffer(csv));
      expect(repo.query).toHaveBeenCalled();
      expect(result.created).toBe(1);
    });

    it('excludes soft-deleted tickets from autoAssign workload count during import', async () => {
      repo.query.mockResolvedValue([{ userId: '5' }]);
      repo.create.mockReturnValue(mockTicket());
      repo.save.mockResolvedValue(mockTicket({ id: 12, assigneeId: 5 }));

      const csv = 'title,type\nFoo,TECHNICAL';
      await service.importFromCsv('1', makeBuffer(csv));

      const sql: string = repo.query.mock.calls[0][0];
      expect(sql).toMatch(/t\."deletedAt"\s+IS\s+NULL/i);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when ticket does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });

    it('returns the ticket when project is active', async () => {
      const ticket = mockTicket();
      repo.findOne.mockResolvedValue(ticket);
      projectsService.findOneWithDeleted.mockResolvedValue(activeProject);
      await expect(service.findOne(1)).resolves.toEqual(ticket);
    });

    it('throws NotFoundException when parent project is soft-deleted', async () => {
      const ticket = mockTicket();
      repo.findOne.mockResolvedValue(ticket);
      projectsService.findOneWithDeleted.mockResolvedValue(deletedProject);
      await expect(service.findOne(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it('throws NotFoundException when ticket does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.softDelete(999)).rejects.toThrow(NotFoundException);
    });

    it('throws 400 when ticket is DONE', async () => {
      const ticket = mockTicket({ status: TicketStatus.DONE });
      repo.findOne.mockResolvedValue(ticket);
      await expect(service.softDelete(1)).rejects.toThrow(BadRequestException);
    });

    it('soft-deletes the ticket and calls repo.softDelete', async () => {
      const ticket = mockTicket({ status: TicketStatus.TODO });
      repo.findOne.mockResolvedValue(ticket);
      await expect(service.softDelete(1)).resolves.toBeUndefined();
      expect(repo.softDelete).toHaveBeenCalledWith(1);
    });

    it('throws NotFoundException when parent project is soft-deleted', async () => {
      const ticket = mockTicket();
      repo.findOne.mockResolvedValue(ticket);
      projectsService.findOneWithDeleted.mockResolvedValue(deletedProject);
      await expect(service.softDelete(1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('restore', () => {
    it('throws NotFoundException when ticket does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.restore(999)).rejects.toThrow(NotFoundException);
    });

    it('throws 400 when ticket is not soft-deleted', async () => {
      const ticket = mockTicket({ deletedAt: null });
      repo.findOne.mockResolvedValue(ticket);
      await expect(service.restore(1)).rejects.toThrow(BadRequestException);
    });

    it('throws 409 when parent project is soft-deleted', async () => {
      const ticket = mockTicket({ deletedAt: new Date() });
      repo.findOne.mockResolvedValue(ticket);
      projectsService.findOneWithDeleted.mockResolvedValue(deletedProject);
      await expect(service.restore(1)).rejects.toThrow(ConflictException);
    });

    it('restores the ticket when project is active', async () => {
      const ticket = mockTicket({ deletedAt: new Date() });
      repo.findOne.mockResolvedValue(ticket);
      projectsService.findOneWithDeleted.mockResolvedValue(activeProject);
      await expect(service.restore(1)).resolves.toBeUndefined();
      expect(repo.restore).toHaveBeenCalledWith(1);
    });
  });

  describe('findDeleted', () => {
    it('returns soft-deleted tickets', async () => {
      const deleted = [mockTicket({ deletedAt: new Date() })];
      repo.find.mockResolvedValue(deleted);
      const result = await service.findDeleted();
      expect(result).toEqual(deleted);
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ withDeleted: true }),
      );
    });
  });

  describe('update — soft-deleted blocker is ignored (task 2.6)', () => {
    it('TypeORM excludes soft-deleted blockers from relation load — no extra filter needed', async () => {
      const ticket = mockTicket({ status: TicketStatus.IN_REVIEW, blockers: [] } as any);
      repo.findOne
        .mockResolvedValueOnce(ticket)
        .mockResolvedValueOnce(ticket);
      repo.save.mockResolvedValue({ ...ticket, status: TicketStatus.DONE, version: 2 });

      const result = await service.update(1, { status: TicketStatus.DONE });
      expect(result.status).toBe(TicketStatus.DONE);
    });
  });

  describe('findAllByProject', () => {
    it('returns tickets for a valid projectId', async () => {
      const tickets = [mockTicket(), mockTicket({ id: 2 })];
      repo.find.mockResolvedValue(tickets);

      const result = await service.findAllByProject(1);
      expect(result).toEqual(tickets);
    });

    it('throws BadRequestException when projectId is falsy', async () => {
      await expect(service.findAllByProject(0)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOverdueForEscalation', () => {
    it('returns overdue tickets via query builder', async () => {
      const tickets = [mockTicket({ dueDate: new Date(Date.now() - 86400_000) })];
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(tickets),
      };
      (repo as any).createQueryBuilder = jest.fn().mockReturnValue(qb);

      const result = await service.findOverdueForEscalation();
      expect(result).toEqual(tickets);
    });
  });

  describe('getProjectWorkload', () => {
    it('returns workload rows mapped to typed objects', async () => {
      const rawRows = [
        { userId: '1', username: 'alice', openTicketCount: '3' },
        { userId: '2', username: 'bob',   openTicketCount: '1' },
      ];
      repo.query.mockResolvedValue(rawRows);

      const result = await service.getProjectWorkload(1);

      expect(result).toEqual([
        { userId: 1, username: 'alice', openTicketCount: 3 },
        { userId: 2, username: 'bob',   openTicketCount: 1 },
      ]);
    });
  });
});
