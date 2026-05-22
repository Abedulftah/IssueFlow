import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { withCurrentUserTransaction } from '../database/current-user-transaction';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.usersRepository.findOne({
      where: [{ username: dto.username }, { email: dto.email }],
    });
    if (existing) {
      throw new ConflictException('Username or email already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password ?? 'secret', 10);
    const user = this.usersRepository.create({ ...dto, passwordHash });
    return withCurrentUserTransaction(this.dataSource, (manager) =>
      manager.getRepository(User).save(user),
    );
  }

  findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  async findOne(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username } });
  }

  async findByUsernames(usernames: string[]): Promise<User[]> {
    if (!usernames.length) return [];
    return this.usersRepository
      .createQueryBuilder('user')
      .where('LOWER(user.username) IN (:...usernames)', { usernames })
      .getMany();
  }

  async update(id: number, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.role !== undefined) user.role = dto.role;
    return withCurrentUserTransaction(this.dataSource, (manager) => {
      return manager.getRepository(User).save(user);
    });
  }

  async remove(id: number): Promise<void> {
    const user = await this.findOne(id);
    await withCurrentUserTransaction(this.dataSource, async (manager) => {
      await manager.getRepository(User).remove(user);
    });
  }
}
