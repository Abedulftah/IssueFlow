import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Project } from './project.entity';
import { ProjectsService } from './projects.service';
import { UsersService } from '../users/users.service';

const mockProject = (overrides: Partial<Project> = {}): Project =>
  ({ id: 1, name: 'Test', description: 'Desc', ownerId: 1, deletedAt: null, ...overrides } as Project);

describe('ProjectsService', () => {
  let service: ProjectsService;
  let repo: jest.Mocked<Pick<Repository<Project>, 'create' | 'save' | 'find' | 'findOne' | 'softDelete' | 'restore'>>;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(async () => {
    const repoValue = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      softDelete: jest.fn().mockResolvedValue(undefined),
      restore: jest.fn().mockResolvedValue(undefined),
    };

    const dataSource = {
      transaction: jest.fn(async (cb: (manager: unknown) => unknown) =>
        cb({
          query: jest.fn().mockResolvedValue(undefined),
          getRepository: () => repoValue,
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getRepositoryToken(Project), useValue: repoValue },
        { provide: DataSource, useValue: dataSource },
        { provide: UsersService, useValue: { findOne: jest.fn() } },
      ],
    }).compile();

    service = module.get(ProjectsService);
    repo = module.get(getRepositoryToken(Project));
    usersService = module.get(UsersService);
  });

  describe('create', () => {
    it('throws 404 when owner does not exist', async () => {
      usersService.findOne.mockRejectedValue(new NotFoundException());
      await expect(
        service.create({ name: 'X', description: 'Y', ownerId: 9999 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the saved project on success', async () => {
      const dto = { name: 'Proj', description: 'Desc', ownerId: 1 };
      const created = mockProject(dto);
      usersService.findOne.mockResolvedValue({ id: 1 } as any);
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.create(dto);
      expect(result).toEqual(created);
      expect(repo.save).toHaveBeenCalledWith(created);
    });
  });

  describe('findAll', () => {
    it('returns all projects', async () => {
      const projects = [mockProject(), mockProject({ id: 2, name: 'B' })];
      repo.find.mockResolvedValue(projects);
      await expect(service.findAll()).resolves.toEqual(projects);
    });
  });

  describe('findOne', () => {
    it('returns the project when it exists', async () => {
      const project = mockProject();
      repo.findOne.mockResolvedValue(project);
      await expect(service.findOne(1)).resolves.toEqual(project);
    });

    it('throws NotFoundException when project does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne(9999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOneWithDeleted', () => {
    it('returns project including soft-deleted ones', async () => {
      const project = mockProject({ deletedAt: new Date() });
      repo.findOne.mockResolvedValue(project);
      await expect(service.findOneWithDeleted(1)).resolves.toEqual(project);
    });

    it('returns null when project does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOneWithDeleted(9999)).resolves.toBeNull();
    });
  });

  describe('findDeleted', () => {
    it('returns only soft-deleted projects', async () => {
      const deleted = [mockProject({ deletedAt: new Date() })];
      repo.find.mockResolvedValue(deleted);
      const result = await service.findDeleted();
      expect(result).toEqual(deleted);
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ withDeleted: true }));
    });
  });

  describe('update', () => {
    it('throws NotFoundException when project does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.update(9999, { name: 'New' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates only provided fields and leaves others unchanged', async () => {
      const project = mockProject({ name: 'Old', description: 'Keep' });
      repo.findOne.mockResolvedValue(project);
      repo.save.mockResolvedValue({ ...project, name: 'New' } as Project);

      await service.update(1, { name: 'New' });
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'New', description: 'Keep' }));
    });

    it('sets session userId when userId is provided', async () => {
      const project = mockProject();
      repo.findOne.mockResolvedValue(project);
      repo.save.mockResolvedValue(project);

      await service.update(1, { name: 'Updated' }, 7);
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('throws NotFoundException when project does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.softDelete(9999)).rejects.toThrow(NotFoundException);
    });

    it('calls softDelete on the repository when project exists', async () => {
      repo.findOne.mockResolvedValue(mockProject());
      await service.softDelete(1);
      expect(repo.softDelete).toHaveBeenCalledWith(1);
    });

    it('does NOT call softDelete on tickets (no cascade)', async () => {
      repo.findOne.mockResolvedValue(mockProject());
      await service.softDelete(1);
      expect(repo.softDelete).toHaveBeenCalledTimes(1);
    });

    it('sets session userId when userId is provided', async () => {
      repo.findOne.mockResolvedValue(mockProject());
      await service.softDelete(1, 5);
      expect(repo.softDelete).toHaveBeenCalledWith(1);
    });
  });

  describe('restore', () => {
    it('throws NotFoundException when project does not exist (even with withDeleted)', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.restore(9999)).rejects.toThrow(NotFoundException);
    });

    it('throws 400 when project is not soft-deleted', async () => {
      repo.findOne.mockResolvedValue(mockProject({ deletedAt: null }));
      await expect(service.restore(1)).rejects.toThrow(BadRequestException);
    });

    it('calls restore on the repository when project is soft-deleted', async () => {
      repo.findOne.mockResolvedValue(mockProject({ deletedAt: new Date() }));
      await service.restore(1);
      expect(repo.restore).toHaveBeenCalledWith(1);
    });

    it('sets session userId when userId is provided', async () => {
      repo.findOne.mockResolvedValue(mockProject({ deletedAt: new Date() }));
      await service.restore(1, 3);
      expect(repo.restore).toHaveBeenCalledWith(1);
    });
  });
});
