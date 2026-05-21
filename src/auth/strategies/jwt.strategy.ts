import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { DeniedToken } from '../denied-token.entity';
import { resolveJwtSecret } from '../jwt-secret';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(DeniedToken)
    private readonly deniedTokenRepo: Repository<DeniedToken>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: { sub: number; username: string; role: string }) {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (token) {
      const denied = await this.deniedTokenRepo.findOne({ where: { token } });
      if (denied) throw new UnauthorizedException('Token has been revoked');
    }
    return { id: payload.sub, username: payload.username, role: payload.role };
  }
}
