import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { DeniedToken } from './denied-token.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(DeniedToken)
    private readonly deniedTokenRepo: Repository<DeniedToken>,
  ) {}

  async login(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const payload = { sub: user.id, username: user.username, role: user.role };
    const accessToken = this.jwtService.sign(payload);
    return { accessToken, tokenType: 'Bearer', expiresIn: 3600 };
  }

  async logout(token: string): Promise<void> {
    const decoded = this.jwtService.decode(token) as { exp?: number };
    const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 3600_000);
    const denied = this.deniedTokenRepo.create({ token, expiresAt });
    await this.deniedTokenRepo.save(denied);
  }

  async getMe(userId: number) {
    return this.usersService.findOne(userId);
  }
}
