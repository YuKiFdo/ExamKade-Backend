import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  Operator,
  SubscriptionStatus,
} from '@prisma/client';
import { CarrierService } from './carrier.service';
import { normalizeMobile } from '../common/utils/slug.util';
import { toSubscriberId } from '../common/utils/slug.util';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private carrier: CarrierService,
  ) {}

  async requestOtp(dto: RequestOtpDto) {
    const mobile = normalizeMobile(dto.mobile);
    
    let operator = dto.operator;
    if (!operator) {
      if (/^(9470|9471|070|071)/.test(mobile)) {
        operator = Operator.MOBITEL;
      } else {
        operator = Operator.DIALOG;
      }
    }

    console.log('[Auth] requestOtp →', { mobile, operator, rawMobile: dto.mobile });

    let result: { referenceNo?: string };
    try {
      result = await this.carrier.requestOtp(dto.mobile, operator);
      console.log('[Auth] Carrier returned →', JSON.stringify(result));
    } catch (err) {
      console.log('[Auth] Carrier threw error →', err?.message || err);
      if (this.config.get('NODE_ENV') !== 'production') {
        const referenceNo = `dev-${Date.now()}`;
        await this.prisma.otpSession.create({
          data: {
            referenceNo,
            mobile,
            operator,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        });
        console.log('[Auth] Dev fallback (carrier error) → referenceNo:', referenceNo);
        return { referenceNo, devMode: true };
      }
      throw new UnauthorizedException('Failed to send OTP');
    }

    const referenceNo = result.referenceNo;
    if (!referenceNo) {
      console.log('[Auth] No referenceNo in carrier response');
      if (this.config.get('NODE_ENV') !== 'production') {
        const devRef = `dev-${Date.now()}`;
        await this.prisma.otpSession.create({
          data: {
            referenceNo: devRef,
            mobile,
            operator,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        });
        console.log('[Auth] Dev fallback (no ref) → referenceNo:', devRef);
        return { referenceNo: devRef, devMode: true };
      }
      throw new UnauthorizedException('No reference number from carrier');
    }

    await this.prisma.otpSession.create({
      data: {
        referenceNo,
        mobile,
        operator,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    console.log('[Auth] OTP session created → referenceNo:', referenceNo);
    return { referenceNo };
  }

  async verifyOtp(dto: VerifyOtpDto, source?: 'WEB' | 'MOBILE') {
    console.log('[Auth] verifyOtp →', { referenceNo: dto.referenceNo, otp: dto.otp });

    const session = await this.prisma.otpSession.findUnique({
      where: { referenceNo: dto.referenceNo },
    });
    if (!session || session.expiresAt < new Date()) {
      console.log('[Auth] OTP session expired or not found');
      throw new UnauthorizedException('OTP session expired');
    }

    console.log('[Auth] Session found →', { mobile: session.mobile, operator: session.operator });

    const isDevOtp =
      dto.referenceNo.startsWith('dev-') && dto.otp === '123456';

    if (!isDevOtp) {
      try {
        const verifyResult = await this.carrier.verifyOtp(
          dto.referenceNo,
          dto.otp,
          session.operator,
        );
        console.log('[Auth] Carrier verify response →', JSON.stringify(verifyResult));
      } catch (err) {
        console.log('[Auth] Carrier verify error →', err?.message || err);
        if (this.config.get('NODE_ENV') === 'production') {
          throw new UnauthorizedException('Invalid OTP');
        }
        if (dto.otp !== '123456') {
          throw new UnauthorizedException('Invalid OTP');
        }
        console.log('[Auth] Dev fallback accepted OTP 123456');
      }
    } else {
      console.log('[Auth] Dev OTP accepted');
    }

    const user = await this.prisma.user.upsert({
      where: { mobile: session.mobile },
      create: {
        mobile: session.mobile,
        name: dto.name || null,
        operator: session.operator,
        subscriberId: toSubscriberId(session.mobile),
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscribedAt: new Date(),
        // @ts-ignore - TS server cache issue with Prisma types
        registrationSource: source || (dto as any).source || 'WEB',
      },
      update: {
        operator: session.operator,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscribedAt: new Date(),
        ...(dto.name ? { name: dto.name } : {}),
      },
    });

    await this.prisma.otpSession.delete({ where: { id: session.id } });

    console.log('[Auth] User logged in →', { userId: user.id, mobile: user.mobile, status: user.subscriptionStatus });
    const token = this.signUserToken(user.id, user.mobile);
    return { user, token };
  }

  signUserToken(sub: string, mobile: string) {
    return this.jwt.sign(
      { sub, mobile, type: 'user' },
      {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN') || '7d',
      },
    );
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async unsubscribe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (user.subscriptionStatus !== SubscriptionStatus.ACTIVE) {
      throw new UnauthorizedException('User is not active');
    }
    if (!user.subscriberId) {
      throw new UnauthorizedException('Missing subscriber ID');
    }

    try {
      await this.carrier.unsubscribe(user.subscriberId, user.operator);
    } catch (err) {
      if (this.config.get('NODE_ENV') === 'production') {
        throw new UnauthorizedException('Failed to unsubscribe from carrier');
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: SubscriptionStatus.INACTIVE,
      },
    });
  }
}
