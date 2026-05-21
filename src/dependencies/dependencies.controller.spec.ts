import { Test, TestingModule } from '@nestjs/testing';
import { DependenciesController } from './dependencies.controller';
import { DependenciesService } from './dependencies.service';
import { TicketStatus, TicketPriority } from '../tickets/enums';

const mockDependenciesService = () => ({
  getDependencies: jest.fn(),
  addDependency: jest.fn(),
  removeDependency: jest.fn(),
});

describe('DependenciesController', () => {
  let controller: DependenciesController;
  let service: ReturnType<typeof mockDependenciesService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DependenciesController],
      providers: [{ provide: DependenciesService, useFactory: mockDependenciesService }],
    })
      .overrideGuard(require('../auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(DependenciesController);
    service = module.get(DependenciesService);
  });

  describe('getDependencies', () => {
    it('returns mapped blocker objects', async () => {
      const blockers = [
        { id: 2, title: 'Blocker', status: TicketStatus.TODO, priority: TicketPriority.LOW },
      ];
      service.getDependencies.mockResolvedValue(blockers);

      const result = await controller.getDependencies(1);

      expect(service.getDependencies).toHaveBeenCalledWith(1);
      expect(result).toEqual([{ id: 2, title: 'Blocker', status: TicketStatus.TODO }]);
    });

    it('returns empty array when ticket has no blockers', async () => {
      service.getDependencies.mockResolvedValue([]);
      expect(await controller.getDependencies(1)).toEqual([]);
    });
  });

  describe('addDependency', () => {
    it('delegates to service with id and blockedBy', async () => {
      service.addDependency.mockResolvedValue(undefined);

      await controller.addDependency(1, { blockedBy: 2 });

      expect(service.addDependency).toHaveBeenCalledWith(1, 2);
    });
  });

  describe('removeDependency', () => {
    it('delegates to service with id and blockerId', async () => {
      service.removeDependency.mockResolvedValue(undefined);

      await controller.removeDependency(1, 2);

      expect(service.removeDependency).toHaveBeenCalledWith(1, 2);
    });
  });
});
