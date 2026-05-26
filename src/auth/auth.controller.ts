import {
  Body,
  Controller,
  Get,
  Post,
  Req,
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
import type { Request, Response } from 'express';

import { PrismaService } from '../prisma/prisma.service';

import { ClientTypes } from '../common/decorators/client-types.decorator';
import { SwaggerClientType } from '../common/decorators/swagger-client-type.decorator';
import { ApiOperation, ApiQuery } from '@nestjs/swagger';

@ClientTypes('both')
@SwaggerClientType('both')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  @Public()
  @ApiOperation({ summary: 'Request OTP for login' })
  @Post('otp/request')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Public()
  @ApiOperation({ summary: 'Verify OTP and login' })
  @Post('otp/verify')
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const source = req.originalUrl?.includes('/mobile') ? 'MOBILE' : 'WEB';
    const { user, token } = await this.authService.verifyOtp(dto, source);
    this.setAuthCookie(res, token);
    return { user: { id: user.id, mobile: user.mobile, name: user.name, subscriptionStatus: user.subscriptionStatus } };
  }

  @Public()
  @ApiOperation({ summary: 'Logout user' })
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token', this.cookieOptions());
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user profile' })
  @Get('me')
  me(@CurrentUser('sub') userId: string) {
    return this.authService.getMe(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Unsubscribe from service' })
  @Post('unsubscribe')
  unsubscribe(@CurrentUser('sub') userId: string) {
    return this.authService.unsubscribe(userId);
  }

  @Public()
  @ApiOperation({ summary: 'Get public login warning setting' })
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
    const domain = this.config.get('COOKIE_DOMAIN');
    return {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
      ...(domain ? { domain } : {}),
    };
  }
}
