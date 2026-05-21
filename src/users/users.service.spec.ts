import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './user.entity';
import { UsersService } from './users.service';
const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useFactory: mockRepo },
      ],
    }).compile();

    service = module.get(UsersService);
    repo = module.get(getRepositoryToken(User));
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

    it('defaults to hashing "secret" when no password provided', async () => {
      repo.findOne.mockResolvedValue(null);
      const entity = { id: 2 } as User;
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      await service.create({
        username: 'jane',
        email: 'jane@example.com',
        fullName: 'Jane',
        role: UserRole.ADMIN,
      });

      const saved = repo.create.mock.calls[0][0];
      expect(await bcrypt.compare('secret', saved.passwordHash)).toBe(true);
    });

    it('throws ConflictException when username or email already exists', async () => {
      repo.findOne.mockResolvedValue({ id: 1 } as User);

      await expect(
        service.create({
          username: 'jdoe',
          email: 'jdoe@example.com',
          fullName: 'John',
          role: UserRole.DEVELOPER,
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

  describe('update', () => {
    it('updates role and returns saved user', async () => {
      const user = { id: 1, role: UserRole.DEVELOPER, fullName: 'John' } as User;
      repo.findOne.mockResolvedValue(user);
      repo.save.mockResolvedValue({ ...user, role: UserRole.ADMIN });

      const result = await service.update(1, { role: UserRole.ADMIN });
      expect(result.role).toBe(UserRole.ADMIN);
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

    it('throws NotFoundException when user does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
