import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

function adminCookieExtractor(req: Request): string | null {
  return req?.cookies?.['admin_token'] || null;
}

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        adminCookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey:
        config.get<string>('ADMIN_JWT_SECRET') ||
        config.get<string>('JWT_SECRET') ||
        'dev-admin-secret',
    });
  }

  validate(payload: { sub: string; email?: string; role?: string }) {
    if (payload.role !== 'admin') {
      throw new UnauthorizedException();
    }
    return { sub: payload.sub, email: payload.email, role: payload.role };
  }
}
