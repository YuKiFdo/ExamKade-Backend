import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Operator } from '@prisma/client';
import { toSubscriberId } from '../common/utils/slug.util';

@Injectable()
export class CarrierService {
  constructor(private config: ConfigService) { }

  async requestOtp(mobile: string, operator: Operator) {
    const subscriberId = toSubscriberId(mobile);
    const payload = this.buildRequestPayload(subscriberId, operator);

    const url =
      operator === Operator.DIALOG
        ? 'https://api.dialog.lk/subscription/otp/request'
        : 'https://api.mspace.lk/otp/request';

    console.log('[Carrier] OTP Request →', { url, payload });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.log('[Carrier] OTP Request FAILED →', res.status, text);
      throw new BadRequestException(
        `Carrier OTP request failed: ${res.status} ${text}`,
      );
    }

    const body = await res.json();
    console.log('[Carrier] OTP Response ←', JSON.stringify(body, null, 2));
    return body as { referenceNo?: string; statusCode?: string };
  }

  async verifyOtp(referenceNo: string, otp: string, operator: Operator) {
    const payload = {
      applicationId: this.getAppId(operator),
      password: this.getPassword(operator),
      referenceNo,
      otp,
    };

    const url =
      operator === Operator.DIALOG
        ? 'https://api.dialog.lk/subscription/otp/verify'
        : 'https://api.mspace.lk/otp/verify';

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(
        `Carrier OTP verify failed: ${res.status} ${text}`,
      );
    }

    return res.json() as Promise<Record<string, unknown>>;
  }

  async unsubscribe(subscriberId: string, operator: Operator) {
    const payload = {
      applicationId: this.getAppId(operator),
      password: this.getPassword(operator),
      subscriberId,
      action: "0",
    };

    const url =
      operator === Operator.DIALOG
        ? 'https://api.dialog.lk/subscription/send'
        : 'https://api.mspace.lk/subscription/send';

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new BadRequestException(
        `Carrier unsubscribe failed: ${res.status} ${text}`,
      );
    }

    return res.json() as Promise<Record<string, unknown>>;
  }

  private buildRequestPayload(subscriberId: string, operator: Operator) {
    return {
      applicationId: this.getAppId(operator),
      password: this.getPassword(operator),
      subscriberId,
      applicationHash:
        operator === Operator.DIALOG
          ? this.config.get('DIALOG_APPLICATION_HASH') || 'abcdefgh'
          : this.config.get('MOBITEL_APPLICATION_HASH') || 'abcdefgh',
      applicationMetaData: {
        client: 'MOBILEAPP',
        device: 'Xiaomi Mi 11 Lite',
        os: 'Android',
        // appCode: this.config.get('CORS_ORIGIN') || 'http://localhost:3000',
        appCode: 'https://play.google.com/store/apps/'
      },
    };
  }

  private getAppId(operator: Operator) {
    const key =
      operator === Operator.DIALOG
        ? 'DIALOG_APPLICATION_ID'
        : 'MOBITEL_APPLICATION_ID';
    const val = this.config.get<string>(key);
    if (!val) {
      throw new BadRequestException(
        `${key} is not configured. Set carrier credentials in .env`,
      );
    }
    return val;
  }

  private getPassword(operator: Operator) {
    const key =
      operator === Operator.DIALOG ? 'DIALOG_PASSWORD' : 'MOBITEL_PASSWORD';
    const val = this.config.get<string>(key);
    if (!val) {
      throw new BadRequestException(
        `${key} is not configured. Set carrier credentials in .env`,
      );
    }
    return val;
  }
}
