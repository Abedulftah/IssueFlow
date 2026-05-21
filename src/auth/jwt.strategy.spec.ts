import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from './strategies/jwt.strategy';
import { DeniedToken } from './denied-token.entity';

const mockDeniedTokenRepo = {
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
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    jest.clearAllMocks();
  });

  it('returns user payload for a valid, non-denied token', async () => {
    mockDeniedTokenRepo.findOne.mockResolvedValue(null);
    const payload = { sub: 1, username: 'jdoe', role: 'DEVELOPER' };

    const result = await strategy.validate(fakeReq('valid-token') as any, payload);

    expect(result).toEqual({ id: 1, username: 'jdoe', role: 'DEVELOPER' });
  });

  it('throws UnauthorizedException for a denied token', async () => {
    mockDeniedTokenRepo.findOne.mockResolvedValue({ id: 1, token: 'revoked', expiresAt: new Date() });
    const payload = { sub: 1, username: 'jdoe', role: 'DEVELOPER' };

    await expect(strategy.validate(fakeReq('revoked') as any, payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
