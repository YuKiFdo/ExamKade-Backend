import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery } from '@nestjs/swagger';
import { FilesService } from './files.service';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../auth/guards/subscription.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ClientTypes } from '../common/decorators/client-types.decorator';
import { SwaggerClientType } from '../common/decorators/swagger-client-type.decorator';

@ClientTypes('both')
@SwaggerClientType('both')
@Controller('files')
export class FilesController {
  constructor(private filesService: FilesService) {}

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Generate a signed URL token for file access (expires in 5 min)' })
  @Get(':id/token')
  getFileToken(@Param('id') id: string) {
    return this.filesService.generateSignedToken(id);
  }

  @Public()
  @ApiOperation({ summary: 'Preview a file (requires signed token)' })
  @ApiQuery({ name: 'token', required: true, type: String, description: 'Signed access token from /files/:id/token' })
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get(':id/preview')
  preview(
    @Param('id') id: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    return this.filesService.streamPreview(id, token, res);
  }

  @Public()
  @ApiOperation({ summary: 'Download a file (requires signed token)' })
  @ApiQuery({ name: 'token', required: true, type: String, description: 'Signed access token from /files/:id/token' })
  @Get(':id/download')
  download(
    @Param('id') id: string,
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.filesService.streamDownload(id, token, req, res, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
