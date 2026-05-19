import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionStatus } from '@prisma/client';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub;
    if (!userId) throw new ForbiddenException('Login required');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.subscriptionStatus !== SubscriptionStatus.ACTIVE) {
      throw new ForbiddenException(
        'Active subscription required to download. Please subscribe via your mobile operator.',
      );
    }
    return true;
  }
}
