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
        operator = Operator.DIALOG; // Default to DIALOG for 077, 076, 074, etc.
      }
    }

    let result: { referenceNo?: string };
    try {
      result = await this.carrier.requestOtp(dto.mobile, operator);
    } catch {
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
        return { referenceNo, devMode: true };
      }
      throw new UnauthorizedException('Failed to send OTP');
    }

    const referenceNo = result.referenceNo;
    if (!referenceNo) {
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

    return { referenceNo };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const session = await this.prisma.otpSession.findUnique({
      where: { referenceNo: dto.referenceNo },
    });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('OTP session expired');
    }

    const isDevOtp =
      dto.referenceNo.startsWith('dev-') && dto.otp === '123456';

    if (!isDevOtp) {
      try {
        await this.carrier.verifyOtp(
          dto.referenceNo,
          dto.otp,
          session.operator,
        );
      } catch {
        if (this.config.get('NODE_ENV') === 'production') {
          throw new UnauthorizedException('Invalid OTP');
        }
        if (dto.otp !== '123456') {
          throw new UnauthorizedException('Invalid OTP');
        }
      }
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
      },
      update: {
        operator: session.operator,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscribedAt: new Date(),
        ...(dto.name ? { name: dto.name } : {}),
      },
    });

    await this.prisma.otpSession.delete({ where: { id: session.id } });

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
}
