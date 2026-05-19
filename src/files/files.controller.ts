import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../auth/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';

@Controller('files')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get(':id/preview')
  preview(@Param('id') id: string, @Res() res: Response) {
    return this.filesService.streamPreview(id, res);
  }

  @UseGuards(JwtAuthGuard, SubscriptionGuard)
  @Get(':id/download')
  download(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.filesService.streamDownload(id, userId, res, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
