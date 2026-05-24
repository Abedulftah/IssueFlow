import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './user.entity';

@Injectable()
export class AdminSeedService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureDefaultAdmin();
  }

  async ensureDefaultAdmin(): Promise<void> {
    const existing = await this.usersRepository.findOne({ where: { username: 'admin' } });
    if (existing) return;
    const passwordHash = await bcrypt.hash('admin', 10);
    const admin = this.usersRepository.create({
      username: 'admin',
      email: 'admin@admin.com',
      fullName: 'admin',
      role: UserRole.ADMIN,
      passwordHash,
    });
    await this.usersRepository.save(admin);
  }
}
