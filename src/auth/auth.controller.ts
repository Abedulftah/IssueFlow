import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request) {
    const token = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    if (token) {
      await this.authService.logout(token);
    }
  }

  @Get('me')
  getMe(@Req() req: Request & { user: { id: number } }) {
    return this.authService.getMe(req.user.id);
  }
}
