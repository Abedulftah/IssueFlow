import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { DeniedToken } from '../denied-token.entity';
import { resolveJwtSecret } from '../jwt-secret';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(DeniedToken)
    private readonly deniedTokenRepo: Repository<DeniedToken>,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(),
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    payload: { sub: number; username: string; role: string; authVersion?: string },
  ) {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (token) {
      const denied = await this.deniedTokenRepo.findOne({ where: { token } });
      if (denied) throw new UnauthorizedException('Token has been revoked');
    }

    const user = await this.usersService.findOne(payload.sub).catch(() => null);
    if (!user || !user.authVersion || user.authVersion !== payload.authVersion) {
      throw new UnauthorizedException('User no longer exists');
    }
    return { id: payload.sub, username: payload.username, role: payload.role };
  }
}
