import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './entities/audit-log.entity';
import { ActorType } from './enums/actor-type.enum';

const mockRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
});

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getRepositoryToken(AuditLog), useFactory: mockRepo },
      ],
    }).compile();

    service = module.get(AuditLogService);
    repo = module.get(getRepositoryToken(AuditLog));
  });

  describe('record()', () => {
    const dto = {
      action: 'CREATE',
      entityType: 'Ticket',
      entityId: '42',
      performedBy: '1',
      actor: ActorType.USER,
    };

    it('inserts one row with the provided fields', async () => {
      const entry = { ...dto, id: 1, timestamp: new Date() } as AuditLog;
      repo.create.mockReturnValue(entry);
      repo.save.mockResolvedValue(entry);

      await service.record(dto);

      expect(repo.create).toHaveBeenCalledWith(dto);
      expect(repo.save).toHaveBeenCalledWith(entry);
    });

    it('does not rethrow when save fails', async () => {
      repo.create.mockReturnValue({});
      repo.save.mockRejectedValue(new Error('DB down'));

      await expect(service.record(dto)).resolves.toBeUndefined();
    });

    it('records SYSTEM actor correctly', async () => {
      const systemDto = {
        action: 'AUTO_ASSIGN',
        entityType: 'Ticket',
        entityId: '7',
        performedBy: 'SYSTEM',
        actor: ActorType.SYSTEM,
      };
      const entry = { ...systemDto, id: 2, timestamp: new Date() } as AuditLog;
      repo.create.mockReturnValue(entry);
      repo.save.mockResolvedValue(entry);

      await service.record(systemDto);

      expect(repo.create).toHaveBeenCalledWith(systemDto);
    });
  });

  describe('findAll()', () => {
    const entries = [
      { id: 1, action: 'CREATE', entityType: 'Ticket', entityId: '1', performedBy: '1', actor: ActorType.USER },
      { id: 2, action: 'AUTO_ASSIGN', entityType: 'Ticket', entityId: '1', performedBy: 'SYSTEM', actor: ActorType.SYSTEM },
    ] as AuditLog[];

    it('returns a plain array of entries with entityId coerced to number', async () => {
      repo.find.mockResolvedValue(entries);

      const result = await service.findAll({});

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toMatchObject({ ...entries[0], entityId: 1, performedBy: 1 });
      expect(result[1]).toMatchObject({ ...entries[1], entityId: 1, performedBy: 'SYSTEM' });
    });

    it('applies entityType + entityId filters', async () => {
      repo.find.mockResolvedValue([entries[0]]);

      await service.findAll({ entityType: 'Ticket', entityId: '1' });

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: 'Ticket', entityId: '1' },
        }),
      );
    });

    it('applies actor filter', async () => {
      repo.find.mockResolvedValue([entries[1]]);

      await service.findAll({ actor: ActorType.SYSTEM });

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { actor: ActorType.SYSTEM },
        }),
      );
    });

    it('applies action filter', async () => {
      repo.find.mockResolvedValue([entries[1]]);

      await service.findAll({ action: 'AUTO_ASSIGN' });

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { action: 'AUTO_ASSIGN' },
        }),
      );
    });

    it('orders by timestamp DESC', async () => {
      repo.find.mockResolvedValue([]);

      await service.findAll({});

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { timestamp: 'DESC' } }),
      );
    });
  });
});
