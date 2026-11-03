import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
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
import { ApplicationsService } from '../applications/applications.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private carrier: CarrierService,
    private applications: ApplicationsService,
  ) {}

  async requestOtp(dto: RequestOtpDto) {
    const mobile = normalizeMobile(dto.mobile);
    const appCode = dto.app?.trim() || 'examKade';
    
    let operator = dto.operator;
    if (!operator) {
      if (/^(9470|9471|070|071)/.test(mobile)) {
        operator = Operator.MOBITEL;
      } else {
        operator = Operator.DIALOG;
      }
    }

    const { app: appRecord, creds } = await this.applications.getCarrierCredentials(appCode, operator);
    const resolvedAppCode = appRecord?.code || appCode;
    const resolvedAppId = appRecord?.id || null;

    console.log('[Auth] requestOtp →', { mobile, operator, appCode: resolvedAppCode, rawMobile: dto.mobile });

    let result: { referenceNo?: string; statusCode?: string; statusDetail?: string };
    try {
      result = await this.carrier.requestOtp(dto.mobile, operator, creds);
      console.log('[Auth] Carrier returned →', JSON.stringify(result));
    } catch (err) {
      console.log('[Auth] Carrier threw error →', err?.message || err);
      if (err instanceof BadRequestException) {
        throw err;
      }
      if (this.config.get('NODE_ENV') !== 'production') {
        const referenceNo = `dev-${Date.now()}`;
        await this.prisma.otpSession.create({
          data: {
            referenceNo,
            mobile,
            operator,
            appCode: resolvedAppCode,
            appId: resolvedAppId,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        });
        console.log('[Auth] Dev fallback (carrier error) → referenceNo:', referenceNo);
        return { referenceNo, devMode: true };
      }
      throw new UnauthorizedException('Failed to send OTP');
    }

    // E1351 = user already subscribed → unsubscribe first, then retry OTP
    if (result.statusCode === 'E1351') {
      console.log('[Auth] User already subscribed, attempting unsubscribe before retry');
      const existingUser = await this.prisma.user.findFirst({
        where: {
          mobile,
          appCode: resolvedAppCode,
        },
      });

      if (existingUser?.subscriberId) {
        try {
          await this.carrier.unsubscribe(existingUser.subscriberId, operator, creds);
          console.log('[Auth] Unsubscribed successfully, retrying OTP request');
        } catch (unsubErr) {
          console.log('[Auth] Unsubscribe failed →', unsubErr?.message || unsubErr);
          // Continue to retry OTP anyway — the carrier might still allow it
        }
      } else {
        console.log('[Auth] No stored subscriberId found for unsubscribe');
      }

      // Retry OTP request after unsubscribe
      try {
        result = await this.carrier.requestOtp(dto.mobile, operator, creds);
        console.log('[Auth] Retry OTP returned →', JSON.stringify(result));
      } catch (retryErr) {
        console.log('[Auth] Retry OTP failed →', retryErr?.message || retryErr);
        throw new BadRequestException('Failed to send OTP after unsubscribe. Please try again.');
      }
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
            appCode: resolvedAppCode,
            appId: resolvedAppId,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        });
        console.log('[Auth] Dev fallback (no ref) → referenceNo:', devRef);
        return { referenceNo: devRef, devMode: true };
      }
      throw new UnauthorizedException('No reference number from carrier');
    }

    // Invalidate any older sessions for this mobile & app
    await this.prisma.otpSession.deleteMany({
      where: {
        mobile,
        appCode: resolvedAppCode,
      },
    });

    await this.prisma.otpSession.create({
      data: {
        referenceNo,
        mobile,
        operator,
        appCode: resolvedAppCode,
        appId: resolvedAppId,
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
      throw new UnauthorizedException('OTP session expired. If you requested a new OTP, please use the latest code.');
    }

    const appCode = session.appCode || dto.app?.trim() || 'examKade';
    const { app: appRecord, creds } = await this.applications.getCarrierCredentials(appCode, session.operator);
    const resolvedAppCode = appRecord?.code || appCode;
    const resolvedAppId = appRecord?.id || session.appId || null;

    console.log('[Auth] Session found →', { mobile: session.mobile, operator: session.operator, appCode: resolvedAppCode });

    const isDevOtp =
      dto.referenceNo.startsWith('dev-') && dto.otp === '123456';

    let maskedSubscriberId: string | null = null;

    if (!isDevOtp) {
      try {
        const verifyResult = await this.carrier.verifyOtp(
          dto.referenceNo,
          dto.otp,
          session.operator,
          creds,
        );
        console.log('[Auth] Carrier verify response →', JSON.stringify(verifyResult));

        // Capture the masked subscriberId from the carrier response
        if (verifyResult.subscriberId && typeof verifyResult.subscriberId === 'string') {
          maskedSubscriberId = verifyResult.subscriberId;
          console.log('[Auth] Masked subscriberId →', maskedSubscriberId);
        }
      } catch (err) {
        console.log('[Auth] Carrier verify error →', err?.message || err);
        if (err instanceof BadRequestException) {
          throw err;
        }
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

    // Use masked subscriberId from carrier if available, otherwise fall back to raw MSISDN
    const subscriberId = maskedSubscriberId || toSubscriberId(session.mobile);

    const user = await this.prisma.user.upsert({
      where: {
        mobile_appCode: {
          mobile: session.mobile,
          appCode: resolvedAppCode,
        },
      },
      create: {
        mobile: session.mobile,
        name: dto.name || null,
        operator: session.operator,
        subscriberId,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscribedAt: new Date(),
        registrationSource: (source || dto.source || 'WEB') as any,
        appCode: resolvedAppCode,
        appId: resolvedAppId,
      },
      update: {
        operator: session.operator,
        subscriberId,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscribedAt: new Date(),
        ...(dto.name ? { name: dto.name } : {}),
        ...(resolvedAppId ? { appId: resolvedAppId } : {}),
      },
      include: {
        app: true,
      },
    });

    await this.prisma.otpSession.delete({ where: { id: session.id } });

    console.log('[Auth] User logged in →', { userId: user.id, mobile: user.mobile, appCode: user.appCode, status: user.subscriptionStatus });
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { app: true },
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async unsubscribe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { app: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.subscriptionStatus !== SubscriptionStatus.ACTIVE) {
      throw new UnauthorizedException('User is not active');
    }
    if (!user.subscriberId) {
      throw new UnauthorizedException('Missing subscriber ID');
    }

    if (/^tel:\d+$/.test(user.subscriberId)) {
      throw new BadRequestException(
        'Please log in again before unsubscribing. Your session needs to be refreshed.',
      );
    }

    const { creds } = await this.applications.getCarrierCredentials(
      user.appCode || user.app?.code,
      user.operator,
    );

    try {
      await this.carrier.unsubscribe(user.subscriberId, user.operator, creds);
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
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
