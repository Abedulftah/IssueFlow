import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

const mockAuditLogService = () => ({
  findAll: jest.fn(),
});

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let service: ReturnType<typeof mockAuditLogService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [{ provide: AuditLogService, useFactory: mockAuditLogService }],
    }).compile();

    controller = module.get(AuditLogController);
    service = module.get(AuditLogService);
  });

  describe('findAll', () => {
    it('delegates to service with the query dto', async () => {
      const logs = [{ id: 1, action: 'CREATE', entityType: 'Ticket', entityId: 1 }];
      service.findAll.mockResolvedValue(logs);
      const query = { entityType: 'Ticket', action: 'CREATE' };

      const result = await controller.findAll(query as any);

      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result).toBe(logs);
    });

    it('returns empty array when no logs match', async () => {
      service.findAll.mockResolvedValue([]);
      const result = await controller.findAll({} as any);
      expect(result).toEqual([]);
    });
  });
});
