import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const mockAuthService = () => ({
  login: jest.fn(),
  logout: jest.fn(),
  getMe: jest.fn(),
});

describe('AuthController', () => {
  let controller: AuthController;
  let service: ReturnType<typeof mockAuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useFactory: mockAuthService }],
    }).compile();

    controller = module.get(AuthController);
    service = module.get(AuthService);
  });

  describe('login', () => {
    it('delegates to authService.login and returns the token response', async () => {
      const tokenResponse = { accessToken: 'tok', tokenType: 'Bearer', expiresIn: 3600 };
      service.login.mockResolvedValue(tokenResponse);

      const result = await controller.login({ username: 'jdoe', password: 'pass' });

      expect(service.login).toHaveBeenCalledWith('jdoe', 'pass');
      expect(result).toBe(tokenResponse);
    });
  });

  describe('logout', () => {
    it('strips Bearer prefix and calls authService.logout', async () => {
      service.logout.mockResolvedValue(undefined);
      const req = { headers: { authorization: 'Bearer my-token' } } as unknown as Request;

      await controller.logout(req);

      expect(service.logout).toHaveBeenCalledWith('my-token');
    });

    it('does nothing when Authorization header is absent', async () => {
      const req = { headers: {} } as unknown as Request;
      await controller.logout(req);
      expect(service.logout).not.toHaveBeenCalled();
    });
  });

  describe('getMe', () => {
    it('delegates to authService.getMe with the user id from the request', async () => {
      const user = { id: 7, username: 'jdoe' };
      service.getMe.mockResolvedValue(user);
      const req = { user: { id: 7 } } as unknown as Request & { user: { id: number } };

      const result = await controller.getMe(req);

      expect(service.getMe).toHaveBeenCalledWith(7);
      expect(result).toBe(user);
    });
  });
});
