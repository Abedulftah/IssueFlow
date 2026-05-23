import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from './strategies/jwt.strategy';
import { DeniedToken } from './denied-token.entity';
import { UsersService } from '../users/users.service';

const mockDeniedTokenRepo = {
  findOne: jest.fn(),
};

const mockUsersService = {
  findOne: jest.fn(),
};

const fakeReq = (token: string) => ({
  headers: { authorization: `Bearer ${token}` },
});

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: getRepositoryToken(DeniedToken), useValue: mockDeniedTokenRepo },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    jest.clearAllMocks();
  });

  it('returns user payload for a valid, non-denied token', async () => {
    mockDeniedTokenRepo.findOne.mockResolvedValue(null);
    mockUsersService.findOne.mockResolvedValue({ id: 1, authVersion: 'v1' });
    const payload = { sub: 1, username: 'jdoe', role: 'DEVELOPER', authVersion: 'v1' };

    const result = await strategy.validate(fakeReq('valid-token') as any, payload);

    expect(result).toEqual({ id: 1, username: 'jdoe', role: 'DEVELOPER' });
  });

  it('throws UnauthorizedException for a denied token', async () => {
    mockDeniedTokenRepo.findOne.mockResolvedValue({ id: 1, token: 'revoked', expiresAt: new Date() });
    mockUsersService.findOne.mockResolvedValue({ id: 1, authVersion: 'v1' });
    const payload = { sub: 1, username: 'jdoe', role: 'DEVELOPER', authVersion: 'v1' };

    await expect(strategy.validate(fakeReq('revoked') as any, payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the token subject no longer exists', async () => {
    mockDeniedTokenRepo.findOne.mockResolvedValue(null);
    mockUsersService.findOne.mockResolvedValue(null);
    const payload = { sub: 1, username: 'jdoe', role: 'DEVELOPER', authVersion: 'v1' };

    await expect(strategy.validate(fakeReq('valid-token') as any, payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the token authVersion does not match', async () => {
    mockDeniedTokenRepo.findOne.mockResolvedValue(null);
    mockUsersService.findOne.mockResolvedValue({ id: 1, authVersion: 'v2' });
    const payload = { sub: 1, username: 'jdoe', role: 'DEVELOPER', authVersion: 'v1' };

    await expect(strategy.validate(fakeReq('valid-token') as any, payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
