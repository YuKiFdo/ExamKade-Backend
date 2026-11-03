import { Injectable, OnModuleInit, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Operator, Application } from '@prisma/client';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { CarrierCredentials } from '../auth/carrier.service';

@Injectable()
export class ApplicationsService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async onModuleInit() {
    // Auto-seed default examKade application if it doesn't exist
    try {
      let app = await this.prisma.application.findFirst({
        where: {
          code: { in: ['examKade', 'examkade'], mode: 'insensitive' },
        },
      });

      if (!app) {
        const dialogAppId = this.config.get<string>('DIALOG_APPLICATION_ID') || null;
        const dialogPassword = this.config.get<string>('DIALOG_PASSWORD') || null;
        const dialogAppHash = this.config.get<string>('DIALOG_APPLICATION_HASH') || 'abcdefgh';
        const mobitelAppId = this.config.get<string>('MOBITEL_APPLICATION_ID') || null;
        const mobitelPassword = this.config.get<string>('MOBITEL_PASSWORD') || null;
        const mobitelAppHash = this.config.get<string>('MOBITEL_APPLICATION_HASH') || 'abcdefgh';

        app = await this.prisma.application.create({
          data: {
            name: 'Exam Kade',
            code: 'examKade',
            dialogAppId,
            dialogPassword,
            dialogAppHash,
            mobitelAppId,
            mobitelPassword,
            mobitelAppHash,
          },
        });
        console.log('[Applications] Seeded default application "examKade" from environment');
      }

      // Ensure any existing users without appId are linked to default examKade
      const userRes = await this.prisma.user.updateMany({
        where: {
          appId: null,
        },
        data: {
          appCode: 'examKade',
          appId: app.id,
        },
      });
      if (userRes.count > 0) {
        console.log(`[Applications] Linked ${userRes.count} existing user(s) to default application "examKade"`);
      }

      // Also ensure any OtpSessions without appId are linked to default examKade
      await this.prisma.otpSession.updateMany({
        where: {
          appId: null,
        },
        data: {
          appCode: 'examKade',
          appId: app.id,
        },
      });
    } catch (err) {
      console.warn('[Applications] Failed to check/seed default application:', err?.message || err);
    }
  }

  async findAll() {
    return this.prisma.application.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });
  }

  async findById(id: string) {
    const app = await this.prisma.application.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true },
        },
      },
    });
    if (!app) throw new NotFoundException(`Application with id ${id} not found`);
    return app;
  }

  async findByCode(code: string) {
    return this.prisma.application.findFirst({
      where: {
        code: { equals: code.trim(), mode: 'insensitive' },
      },
    });
  }

  async create(dto: CreateApplicationDto) {
    const code = dto.code.trim();
    const existing = await this.prisma.application.findFirst({
      where: {
        code: { equals: code, mode: 'insensitive' },
      },
    });
    if (existing) {
      throw new BadRequestException(`Application with code "${code}" already exists`);
    }

    return this.prisma.application.create({
      data: {
        name: dto.name.trim(),
        code,
        dialogAppId: dto.dialogAppId?.trim() || null,
        dialogPassword: dto.dialogPassword?.trim() || null,
        dialogAppHash: dto.dialogAppHash?.trim() || 'abcdefgh',
        mobitelAppId: dto.mobitelAppId?.trim() || null,
        mobitelPassword: dto.mobitelPassword?.trim() || null,
        mobitelAppHash: dto.mobitelAppHash?.trim() || 'abcdefgh',
      },
    });
  }

  async update(id: string, dto: UpdateApplicationDto) {
    await this.findById(id);

    if (dto.code) {
      const code = dto.code.trim();
      const duplicate = await this.prisma.application.findFirst({
        where: {
          code: { equals: code, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (duplicate) {
        throw new BadRequestException(`Application with code "${code}" already exists`);
      }
    }

    return this.prisma.application.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.code ? { code: dto.code.trim() } : {}),
        ...(dto.dialogAppId !== undefined ? { dialogAppId: dto.dialogAppId?.trim() || null } : {}),
        ...(dto.dialogPassword !== undefined ? { dialogPassword: dto.dialogPassword?.trim() || null } : {}),
        ...(dto.dialogAppHash !== undefined ? { dialogAppHash: dto.dialogAppHash?.trim() || 'abcdefgh' } : {}),
        ...(dto.mobitelAppId !== undefined ? { mobitelAppId: dto.mobitelAppId?.trim() || null } : {}),
        ...(dto.mobitelPassword !== undefined ? { mobitelPassword: dto.mobitelPassword?.trim() || null } : {}),
        ...(dto.mobitelAppHash !== undefined ? { mobitelAppHash: dto.mobitelAppHash?.trim() || 'abcdefgh' } : {}),
      },
    });
  }

  async delete(id: string) {
    const app = await this.findById(id);
    const userCount = await this.prisma.user.count({
      where: {
        OR: [{ appId: id }, { appCode: app.code }],
      },
    });
    if (userCount > 0) {
      throw new BadRequestException(
        `Cannot delete application "${app.name}". There are ${userCount} users registered under this application.`,
      );
    }

    return this.prisma.application.delete({ where: { id } });
  }

  async getCarrierCredentials(
    appCodeOrId?: string,
    operator: Operator = Operator.DIALOG,
  ): Promise<{ app?: Application; creds?: CarrierCredentials }> {
    let app: Application | null = null;
    const lookup = appCodeOrId?.trim();

    if (lookup) {
      // Try by id first, then by code
      app = await this.prisma.application.findUnique({ where: { id: lookup } });
      if (!app) {
        app = await this.findByCode(lookup);
      }
    }

    if (!app) {
      // Fallback to default examKade
      app = await this.findByCode('examKade');
    }

    if (app) {
      if (operator === Operator.DIALOG && app.dialogAppId && app.dialogPassword) {
        return {
          app,
          creds: {
            applicationId: app.dialogAppId,
            password: app.dialogPassword,
            applicationHash: app.dialogAppHash || undefined,
          },
        };
      }
      if (operator === Operator.MOBITEL && app.mobitelAppId && app.mobitelPassword) {
        return {
          app,
          creds: {
            applicationId: app.mobitelAppId,
            password: app.mobitelPassword,
            applicationHash: app.mobitelAppHash || undefined,
          },
        };
      }
    }

    return { app: app || undefined, creds: undefined };
  }
}
