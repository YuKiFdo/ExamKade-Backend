import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

function cookieExtractor(req: Request): string | null {
  if (req?.cookies?.['access_token']) {
    return req.cookies['access_token'];
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'dev-secret',
    });
  }

  validate(payload: { sub: string; mobile?: string; type?: string }) {
    if (payload.type && payload.type !== 'user') {
      throw new UnauthorizedException();
    }
    return { sub: payload.sub, mobile: payload.mobile, type: payload.type };
  }
}
