import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './user.entity';
import { UsersService } from './users.service';
import { TicketsService } from '../tickets/tickets.service';
import { Ticket } from '../tickets/ticket.entity';

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
});

const mockTicketsService = () => ({
  findByAssignee: jest.fn().mockResolvedValue([]),
  reAutoAssign: jest.fn().mockResolvedValue(undefined),
});

describe('UsersService', () => {
  let service: UsersService;
  let repo: ReturnType<typeof mockRepo>;
  let ticketsService: ReturnType<typeof mockTicketsService>;

  beforeEach(async () => {
    const repoValue = mockRepo();
    const ticketsServiceValue = mockTicketsService();
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
        UsersService,
        { provide: getRepositoryToken(User), useValue: repoValue },
        { provide: DataSource, useValue: dataSource },
        { provide: TicketsService, useValue: ticketsServiceValue },
      ],
    }).compile();

    service = module.get(UsersService);
    repo = module.get(getRepositoryToken(User));
    ticketsService = module.get(TicketsService);
  });

  describe('create', () => {
    it('hashes explicit password and saves user', async () => {
      repo.findOne.mockResolvedValue(null);
      const entity = { id: 1, username: 'jdoe', passwordHash: 'hashed' } as User;
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      const result = await service.create({
        username: 'jdoe',
        email: 'jdoe@example.com',
        fullName: 'John Doe',
        role: UserRole.DEVELOPER,
        password: 'mypass',
      });

      expect(repo.save).toHaveBeenCalled();
      const saved = repo.create.mock.calls[0][0];
      expect(await bcrypt.compare('mypass', saved.passwordHash)).toBe(true);
      expect(result).toBe(entity);
    });

    it('throws ConflictException when username is already taken', async () => {
      repo.findOne.mockResolvedValue({ id: 1 } as User);

      await expect(
        service.create({
          username: 'jdoe',
          email: 'unique@example.com',
          fullName: 'John',
          role: UserRole.DEVELOPER,
          password: 'mypass',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when email is already taken', async () => {
      repo.findOne.mockResolvedValue({ id: 1 } as User);

      await expect(
        service.create({
          username: 'unique_user',
          email: 'jdoe@example.com',
          fullName: 'John',
          role: UserRole.DEVELOPER,
          password: 'mypass',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    it('returns user when found', async () => {
      const user = { id: 1 } as User;
      repo.findOne.mockResolvedValue(user);
      expect(await service.findOne(1)).toBe(user);
    });

    it('throws NotFoundException when user does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('returns all users', async () => {
      const users = [{ id: 1 } as User, { id: 2 } as User];
      repo.find.mockResolvedValue(users);
      await expect(service.findAll()).resolves.toEqual(users);
    });
  });

  describe('findByUsername', () => {
    it('returns user when found', async () => {
      const user = { id: 1, username: 'jdoe' } as User;
      repo.findOne.mockResolvedValue(user);
      await expect(service.findByUsername('jdoe')).resolves.toBe(user);
    });

    it('returns null when not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findByUsername('ghost')).resolves.toBeNull();
    });
  });

  describe('findByUsernames', () => {
    it('returns empty array without hitting the DB when given an empty list', async () => {
      await expect(service.findByUsernames([])).resolves.toEqual([]);
    });

    it('uses createQueryBuilder to find users by username list', async () => {
      const users = [{ id: 1, username: 'jdoe' } as User];
      const qb = {
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(users),
      };
      (repo as any).createQueryBuilder = jest.fn().mockReturnValue(qb);

      await expect(service.findByUsernames(['jdoe'])).resolves.toEqual(users);
      expect(qb.where).toHaveBeenCalledWith(
        'LOWER(user.username) IN (:...usernames)',
        { usernames: ['jdoe'] },
      );
    });

    it('lowercases mixed-case input before binding to the query', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      (repo as any).createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.findByUsernames(['JDoe', 'ALICE', 'Bob']);

      expect(qb.where).toHaveBeenCalledWith(
        'LOWER(user.username) IN (:...usernames)',
        { usernames: ['jdoe', 'alice', 'bob'] },
      );
    });
  });

  describe('update', () => {
    it('updates role and returns saved user', async () => {
      const user = { id: 1, role: UserRole.DEVELOPER, fullName: 'John' } as User;
      repo.findOne.mockResolvedValue(user);
      repo.save.mockResolvedValue({ ...user, role: UserRole.ADMIN });

      const result = await service.update(1, { role: UserRole.ADMIN });
      expect(result.role).toBe(UserRole.ADMIN);
    });

    it('re-auto-assigns all tickets (including soft-deleted) when DEVELOPER becomes ADMIN', async () => {
      const user = { id: 1, role: UserRole.DEVELOPER, fullName: 'Dev' } as User;
      repo.findOne.mockResolvedValue(user);
      repo.save.mockResolvedValue({ ...user, role: UserRole.ADMIN });

      const tickets = [
        { id: 10, projectId: 1, deletedAt: null } as Ticket,
        { id: 11, projectId: 1, deletedAt: new Date() } as Ticket,
      ];
      ticketsService.findByAssignee.mockResolvedValue(tickets);

      await service.update(1, { role: UserRole.ADMIN });

      expect(ticketsService.findByAssignee).toHaveBeenCalledWith(1);
      expect(ticketsService.reAutoAssign).toHaveBeenCalledTimes(2);
      expect(ticketsService.reAutoAssign).toHaveBeenCalledWith(10, 1);
      expect(ticketsService.reAutoAssign).toHaveBeenCalledWith(11, 1);
    });

    it('does not re-auto-assign when user is already ADMIN', async () => {
      const user = { id: 1, role: UserRole.ADMIN, fullName: 'Admin' } as User;
      repo.findOne.mockResolvedValue(user);
      repo.save.mockResolvedValue({ ...user, fullName: 'Admin Updated' });

      await service.update(1, { role: UserRole.ADMIN, fullName: 'Admin Updated' });

      expect(ticketsService.findByAssignee).not.toHaveBeenCalled();
      expect(ticketsService.reAutoAssign).not.toHaveBeenCalled();
    });

    it('does not re-auto-assign when only fullName is updated', async () => {
      const user = { id: 1, role: UserRole.DEVELOPER, fullName: 'Dev' } as User;
      repo.findOne.mockResolvedValue(user);
      repo.save.mockResolvedValue({ ...user, fullName: 'Developer Updated' });

      await service.update(1, { fullName: 'Developer Updated' });

      expect(ticketsService.findByAssignee).not.toHaveBeenCalled();
      expect(ticketsService.reAutoAssign).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes existing user', async () => {
      const user = { id: 1 } as User;
      repo.findOne.mockResolvedValue(user);
      repo.remove.mockResolvedValue(undefined);

      await expect(service.remove(1)).resolves.toBeUndefined();
      expect(repo.remove).toHaveBeenCalledWith(user);
    });

    it('re-auto-assigns active and soft-deleted tickets when user is deleted', async () => {
      const user = { id: 1 } as User;
      repo.findOne.mockResolvedValue(user);
      repo.remove.mockResolvedValue(undefined);

      const tickets = [
        { id: 10, projectId: 1, deletedAt: null } as Ticket,
        { id: 11, projectId: 2, deletedAt: new Date() } as Ticket,
      ];
      ticketsService.findByAssignee.mockResolvedValue(tickets);

      await service.remove(1);

      expect(ticketsService.findByAssignee).toHaveBeenCalledWith(1);
      expect(ticketsService.reAutoAssign).toHaveBeenCalledTimes(2);
      expect(ticketsService.reAutoAssign).toHaveBeenCalledWith(10, 1);
      expect(ticketsService.reAutoAssign).toHaveBeenCalledWith(11, 2);
    });

    it('does not call reAutoAssign when user had no assigned tickets', async () => {
      const user = { id: 1 } as User;
      repo.findOne.mockResolvedValue(user);
      repo.remove.mockResolvedValue(undefined);
      ticketsService.findByAssignee.mockResolvedValue([]);

      await service.remove(1);

      expect(ticketsService.reAutoAssign).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when user does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
