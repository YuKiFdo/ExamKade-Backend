import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Operator } from '@prisma/client';
import { toSubscriberId } from '../common/utils/slug.util';
import { CARRIER_ERROR_CODES } from './carrier-errors';

@Injectable()
export class CarrierService {
  constructor(private config: ConfigService) { }

  private checkResponse(body: any) {
    if (body && body.statusCode && body.statusCode !== 'S1000') {
      const desc = CARRIER_ERROR_CODES[body.statusCode] || body.statusDetail || 'Unknown carrier error';
      throw new BadRequestException(`Carrier error: [${body.statusCode}] ${desc}`);
    }
  }

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

    // E1351 = "User is already subscribed" — this is fine for re-login,
    // the carrier still sends the OTP, so we just need the referenceNo.
    if (body?.statusCode !== 'E1351') {
      this.checkResponse(body);
    } else {
      console.log('[Carrier] User already subscribed, proceeding with OTP');
    }

    return body as { referenceNo?: string; statusCode?: string; statusDetail?: string };
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

    const body = await res.json();
    this.checkResponse(body);
    return body as Record<string, unknown>;
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

    console.log('[Carrier] Unsubscribe Request →', { url, payload });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.log('[Carrier] Unsubscribe FAILED →', res.status, text);
      throw new BadRequestException(
        `Carrier unsubscribe failed: ${res.status} ${text}`,
      );
    }

    const body = (await res.json()) as Record<string, any>;
    console.log('[Carrier] Unsubscribe Response ←', JSON.stringify(body, null, 2));

    this.checkResponse(body);

    return body;
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
