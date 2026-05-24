import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Project } from './project.entity';
import { Ticket } from '../tickets/ticket.entity';
import { Attachment } from '../attachments/attachment.entity';
import { Comment } from '../comments/comment.entity';
import { ProjectsService } from './projects.service';
import { UsersService } from '../users/users.service';

const mockProject = (overrides: Partial<Project> = {}): Project =>
  ({ id: 1, name: 'Test', description: 'Desc', ownerId: 1, deletedAt: null, ...overrides } as Project);

describe('ProjectsService', () => {
  let service: ProjectsService;
  let repo: jest.Mocked<Pick<Repository<Project>, 'create' | 'save' | 'find' | 'findOne' | 'softDelete' | 'restore'>>;
  let usersService: jest.Mocked<UsersService>;

  let ticketRepo: { find: jest.Mock; softDelete: jest.Mock; restore: jest.Mock };
  let attachmentRepo: { softDelete: jest.Mock; restore: jest.Mock };
  let commentRepo: { softDelete: jest.Mock; restore: jest.Mock };

  beforeEach(async () => {
    const repoValue = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      softDelete: jest.fn().mockResolvedValue(undefined),
      restore: jest.fn().mockResolvedValue(undefined),
    };

    ticketRepo = {
      find: jest.fn().mockResolvedValue([]),
      softDelete: jest.fn().mockResolvedValue(undefined),
      restore: jest.fn().mockResolvedValue(undefined),
    };

    attachmentRepo = {
      softDelete: jest.fn().mockResolvedValue(undefined),
      restore: jest.fn().mockResolvedValue(undefined),
    };

    commentRepo = {
      softDelete: jest.fn().mockResolvedValue(undefined),
      restore: jest.fn().mockResolvedValue(undefined),
    };

    const mockQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };

    const dataSource = {
      transaction: jest.fn(async (cb: (manager: unknown) => unknown) =>
        cb({
          query: jest.fn().mockResolvedValue(undefined),
          createQueryBuilder: jest.fn(() => mockQb),
          getRepository: (entity: unknown) => {
            if (entity === Ticket) return ticketRepo;
            if (entity === Attachment) return attachmentRepo;
            if (entity === Comment) return commentRepo;
            return repoValue;
          },
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

  });

  describe('softDelete', () => {
    it('throws NotFoundException when project does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.softDelete(9999)).rejects.toThrow(NotFoundException);
    });

    it('soft-deletes the project when it exists', async () => {
      repo.findOne.mockResolvedValue(mockProject());
      await expect(service.softDelete(1)).resolves.not.toThrow();
    });

    it('does not cascade to tickets when project has no tickets', async () => {
      repo.findOne.mockResolvedValue(mockProject());
      ticketRepo.find.mockResolvedValue([]);
      await service.softDelete(1);
      expect(attachmentRepo.softDelete).not.toHaveBeenCalled();
      expect(commentRepo.softDelete).not.toHaveBeenCalled();
    });

    it('cascades softDelete to attachments and comments when project has tickets', async () => {
      repo.findOne.mockResolvedValue(mockProject());
      ticketRepo.find.mockResolvedValue([{ id: 10 }, { id: 11 }]);
      await service.softDelete(1);
      expect(attachmentRepo.softDelete).toHaveBeenCalled();
      expect(commentRepo.softDelete).toHaveBeenCalled();
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

    it('restores project and cascade-deleted tickets filtered by matching deletedAt', async () => {
      const deletedAt = new Date('2024-06-01T12:00:00Z');
      repo.findOne.mockResolvedValue(mockProject({ deletedAt }));
      ticketRepo.find.mockResolvedValue([{ id: 10 }, { id: 11 }]);

      await service.restore(1);

      expect(repo.restore).toHaveBeenCalledWith(1);
      // Must filter by the project's exact deletedAt so independently-deleted tickets are skipped
      expect(ticketRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: 1, deletedAt }, withDeleted: true }),
      );
      expect(ticketRepo.restore).toHaveBeenCalledWith([10, 11]);
      expect(attachmentRepo.restore).toHaveBeenCalled();
      expect(commentRepo.restore).toHaveBeenCalled();
    });

    it('does not restore tickets, attachments, or comments when no cascade-deleted tickets exist', async () => {
      repo.findOne.mockResolvedValue(mockProject({ deletedAt: new Date() }));
      ticketRepo.find.mockResolvedValue([]);

      await service.restore(1);

      expect(repo.restore).toHaveBeenCalledWith(1);
      expect(ticketRepo.restore).not.toHaveBeenCalled();
      expect(attachmentRepo.restore).not.toHaveBeenCalled();
      expect(commentRepo.restore).not.toHaveBeenCalled();
    });
  });
});
