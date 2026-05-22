import { Test, TestingModule } from '@nestjs/testing';
import { User, UserRole } from './user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CommentsService } from '../comments/comments.service';

const mockService = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
});

describe('UsersController', () => {
  let controller: UsersController;
  let service: ReturnType<typeof mockService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useFactory: mockService },
        { provide: CommentsService, useValue: { getMentionsForUser: jest.fn() } },
      ],
    }).compile();

    controller = module.get(UsersController);
    service = module.get(UsersService);
  });

  it('create — returns user from service (passwordHash excluded by global interceptor)', async () => {
    const user = Object.assign(new User(), {
      id: 1,
      username: 'jdoe',
      email: 'jdoe@example.com',
      fullName: 'John Doe',
      role: UserRole.DEVELOPER,
      passwordHash: 'should-not-appear',
    });
    service.create.mockResolvedValue(user);

    const result = await controller.create({
      username: 'jdoe',
      email: 'jdoe@example.com',
      fullName: 'John Doe',
      role: UserRole.DEVELOPER,
    });

    expect(result).toBe(user);
    expect(result).toHaveProperty('passwordHash');
  });

  it('findAll — delegates to service', async () => {
    const users = [{ id: 1 }, { id: 2 }] as User[];
    service.findAll.mockResolvedValue(users);
    expect(await controller.findAll()).toBe(users);
  });

  it('findOne — delegates to service with parsed id', async () => {
    const user = { id: 5 } as User;
    service.findOne.mockResolvedValue(user);
    expect(await controller.findOne(5)).toBe(user);
    expect(service.findOne).toHaveBeenCalledWith(5);
  });

  it('update — delegates to service', async () => {
    service.update.mockResolvedValue({ id: 1, role: UserRole.ADMIN } as User);
    await controller.update(1, { role: UserRole.ADMIN });
    expect(service.update).toHaveBeenCalledWith(1, { role: UserRole.ADMIN });
  });

  it('remove — delegates to service', async () => {
    service.remove.mockResolvedValue(undefined);
    await controller.remove(1);
    expect(service.remove).toHaveBeenCalledWith(1);
  });
});
