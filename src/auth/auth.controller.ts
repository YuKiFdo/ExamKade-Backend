import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import { PrismaService } from '../prisma/prisma.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  @Public()
  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Public()
  @Post('otp/verify')
  async verifyOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    const { user, token } = await this.authService.verifyOtp(dto);
    this.setAuthCookie(res, token);
    return { user: { id: user.id, mobile: user.mobile, name: user.name, subscriptionStatus: user.subscriptionStatus } };
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token', this.cookieOptions());
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser('sub') userId: string) {
    return this.authService.getMe(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('unsubscribe')
  unsubscribe(@CurrentUser('sub') userId: string) {
    return this.authService.unsubscribe(userId);
  }

  @Public()
  @Get('settings/login-warning')
  async getPublicLoginWarning() {
    const setting = await this.prisma.setting.findUnique({ where: { key: 'login_warning' } });
    return { showWarning: setting?.value === 'true' };
  }

  private setAuthCookie(res: Response, token: string) {
    res.cookie('access_token', token, this.cookieOptions());
  }

  private cookieOptions() {
    const secure = this.config.get('COOKIE_SECURE') === 'true';
    return {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    };
  }
}
