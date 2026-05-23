import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { DeniedToken } from './denied-token.entity';

const mockUsersService = {
  findByUsername: jest.fn(),
  findOne: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('signed-token'),
  decode: jest.fn().mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
};

const mockDeniedTokenRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: getRepositoryToken(DeniedToken), useValue: mockDeniedTokenRepo },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('returns accessToken on valid credentials', async () => {
      const hash = await bcrypt.hash('pass123', 10);
      mockUsersService.findByUsername.mockResolvedValue({
        id: 1,
        username: 'jdoe',
        role: 'DEVELOPER',
        passwordHash: hash,
        authVersion: 'v1',
      });
      mockJwtService.sign.mockReturnValue('jwt-abc');

      const result = await service.login('jdoe', 'pass123');

      expect(result).toEqual({ accessToken: 'jwt-abc', tokenType: 'Bearer', expiresIn: 3600 });
    });

    it('throws 401 for invalid password', async () => {
      const hash = await bcrypt.hash('correct', 10);
      mockUsersService.findByUsername.mockResolvedValue({
        id: 1,
        username: 'jdoe',
        role: 'DEVELOPER',
        passwordHash: hash,
        authVersion: 'v1',
      });

      await expect(service.login('jdoe', 'wrong')).rejects.toThrow(UnauthorizedException);
    });

    it('throws 401 for unknown username', async () => {
      mockUsersService.findByUsername.mockResolvedValue(null);

      await expect(service.login('nobody', 'pass')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('adds the token to the deny-list', async () => {
      mockJwtService.decode.mockReturnValue({ exp: 9999999999 });
      mockDeniedTokenRepo.create.mockReturnValue({ token: 'tok', expiresAt: new Date() });
      mockDeniedTokenRepo.save.mockResolvedValue({});

      await service.logout('tok');

      expect(mockDeniedTokenRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'tok' }),
      );
      expect(mockDeniedTokenRepo.save).toHaveBeenCalled();
    });
  });
});
