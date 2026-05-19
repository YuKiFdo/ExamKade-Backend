import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminAuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const token = this.jwt.sign(
      { sub: admin.id, email: admin.email, role: 'admin' },
      {
        secret:
          this.config.get('ADMIN_JWT_SECRET') ||
          this.config.get('JWT_SECRET'),
        expiresIn: '1d',
      },
    );
    return { admin: { id: admin.id, email: admin.email, name: admin.name }, token };
  }
}
