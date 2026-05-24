import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { TicketsService } from '../tickets/tickets.service';

const mockProjectsService = () => ({
  findAll: jest.fn(),
  findDeleted: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
});

const mockTicketsService = () => ({
  getProjectWorkload: jest.fn(),
});

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let projectsService: ReturnType<typeof mockProjectsService>;
  let ticketsService: ReturnType<typeof mockTicketsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        { provide: ProjectsService, useFactory: mockProjectsService },
        { provide: TicketsService, useFactory: mockTicketsService },
      ],
    })
      .overrideGuard(require('../auth/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(ProjectsController);
    projectsService = module.get(ProjectsService);
    ticketsService = module.get(TicketsService);
  });

  describe('findAll', () => {
    it('delegates to projectsService.findAll', async () => {
      const projects = [{ id: 1 }, { id: 2 }];
      projectsService.findAll.mockResolvedValue(projects);
      expect(await controller.findAll()).toBe(projects);
    });
  });

  describe('findDeleted', () => {
    it('delegates to projectsService.findDeleted', async () => {
      projectsService.findDeleted.mockResolvedValue([]);
      const result = await controller.findDeleted();
      expect(projectsService.findDeleted).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('getWorkload', () => {
    it('verifies project exists then returns workload', async () => {
      projectsService.findOne.mockResolvedValue({ id: 1 });
      const workload = [{ userId: 2, username: 'dev', openTicketCount: 3 }];
      ticketsService.getProjectWorkload.mockResolvedValue(workload);

      const result = await controller.getWorkload(1);

      expect(projectsService.findOne).toHaveBeenCalledWith(1);
      expect(ticketsService.getProjectWorkload).toHaveBeenCalledWith(1);
      expect(result).toBe(workload);
    });
  });

  describe('findOne', () => {
    it('delegates to projectsService.findOne', async () => {
      const project = { id: 5 };
      projectsService.findOne.mockResolvedValue(project);
      expect(await controller.findOne(5)).toBe(project);
      expect(projectsService.findOne).toHaveBeenCalledWith(5);
    });
  });

  describe('create', () => {
    it('delegates to projectsService.create', async () => {
      const project = { id: 1, name: 'P1' };
      projectsService.create.mockResolvedValue(project);
      const dto = { name: 'P1', description: '' };

      expect(await controller.create(dto as any)).toBe(project);
      expect(projectsService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('calls projectsService.update', async () => {
      projectsService.findOne.mockResolvedValue({ id: 1, ownerId: 1 });
      projectsService.update.mockResolvedValue(undefined);
      const req = { user: { role: 'ADMIN', id: 1 } };
      await controller.update(1, { name: 'Updated' }, req);
      expect(projectsService.update).toHaveBeenCalledWith(1, { name: 'Updated' });
    });
  });

  describe('softDelete', () => {
    it('delegates to projectsService.softDelete', async () => {
      projectsService.softDelete.mockResolvedValue(undefined);
      await controller.softDelete(1);
      expect(projectsService.softDelete).toHaveBeenCalledWith(1);
    });
  });

  describe('restore', () => {
    it('delegates to projectsService.restore', async () => {
      const project = { id: 1 };
      projectsService.restore.mockResolvedValue(project);
      expect(await controller.restore(1)).toBe(project);
      expect(projectsService.restore).toHaveBeenCalledWith(1);
    });
  });
});
