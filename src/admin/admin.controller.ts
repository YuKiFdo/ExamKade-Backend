import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Public } from '../common/decorators/public.decorator';
import { DocumentsService } from '../documents/documents.service';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentStatus, Medium, RootType, FacetKey } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { memoryStorage } from 'multer';

@Controller('admin')
export class AdminController {
  constructor(
    private adminAuth: AdminAuthService,
    private documents: DocumentsService,
    private files: FilesService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { admin, token } = await this.adminAuth.login(body.email, body.password);
    const secure = this.config.get('COOKIE_SECURE') === 'true';
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });
    return { admin };
  }

  @Public()
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('admin_token', { path: '/' });
    return { ok: true };
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('dashboard')
  async dashboard() {
    const [users, documents, downloads, todayDownloads] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.document.count(),
      this.prisma.downloadLog.count(),
      this.prisma.downloadLog.count({
        where: {
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);
    const topDownloads = await this.prisma.downloadLog.groupBy({
      by: ['documentId'],
      _count: { documentId: true },
      orderBy: { _count: { documentId: 'desc' } },
      take: 5,
    });
    return { users, documents, downloads, todayDownloads, topDownloads };
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('users')
  listUsers(@Query('page') page?: string) {
    const p = page ? parseInt(page, 10) : 1;
    return this.prisma.user.findMany({
      include: { _count: { select: { downloadLogs: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * 20,
      take: 20,
    });
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('downloads')
  listDownloads(@Query('page') page?: string) {
    const p = page ? parseInt(page, 10) : 1;
    return this.prisma.downloadLog.findMany({
      include: {
        user: { select: { mobile: true, operator: true } },
        document: { select: { title: true, slug: true } },
        documentFile: { select: { medium: true, fileName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (p - 1) * 20,
      take: 20,
    });
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('facets')
  listFacets() {
    return this.prisma.facetValue.findMany({ orderBy: [{ facetKey: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }] });
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('facets/:id')
  async getFacet(@Param('id') id: string) {
    const facet = await this.prisma.facetValue.findUnique({ where: { id } });
    if (!facet) throw new NotFoundException('Filter option not found');
    return facet;
  }
  @Post('facets')
  createFacet(
    @Body()
    body: {
      facetKey: FacetKey;
      label: string;
      slug: string;
      sortOrder?: number;
    },
  ) {
    return this.prisma.facetValue.create({ data: body });
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch('facets/:id')
  updateFacet(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      label: string;
      slug: string;
      sortOrder: number;
    }>,
  ) {
    return this.prisma.facetValue.update({ where: { id }, data: body });
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('facets/:id')
  async deleteFacet(@Param('id') id: string) {
    const docCount = await this.prisma.documentFacet.count({ where: { facetValueId: id } });
    if (docCount > 0) {
      throw new BadRequestException('Cannot delete filter value because it is linked to documents. Remove it from documents first.');
    }
    return this.prisma.facetValue.delete({ where: { id } });
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('categories')
  listCategories(@Query('rootType') rootType?: RootType) {
    return this.prisma.category.findMany({
      where: rootType ? { rootType } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { parent: true },
    });
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('categories')
  createCategory(
    @Body()
    body: {
      name: string;
      slug: string;
      rootType: RootType;
      parentId?: string;
      sortOrder?: number;
      allowedFilters?: FacetKey[];
    },
  ) {
    return this.prisma.category.create({ data: body });
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      slug: string;
      parentId: string | null;
      sortOrder: number;
      allowedFilters: FacetKey[];
    }>,
  ) {
    return this.prisma.category.update({ where: { id }, data: body });
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string) {
    const docCount = await this.prisma.document.count({ where: { categoryId: id } });
    if (docCount > 0) {
      throw new BadRequestException('Cannot delete category with documents. Move or delete documents first.');
    }
    const childCount = await this.prisma.category.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new BadRequestException('Cannot delete category with subcategories. Delete subcategories first.');
    }
    return this.prisma.category.delete({ where: { id } });
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('documents')
  listDocuments(@Query('page') page?: string) {
    return this.documents.findAllAdmin(page ? parseInt(page, 10) : 1);
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('documents/:id')
  getDocument(@Param('id') id: string) {
    return this.documents.findByIdAdmin(id);
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('documents')
  createDocument(
    @Body()
    body: {
      title: string;
      slug?: string;
      description?: string;
      categoryId: string;
      facetValueIds?: string[];
      status?: DocumentStatus;
    },
  ) {
    return this.documents.create(body);
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch('documents/:id')
  updateDocument(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      title: string;
      slug: string;
      description: string;
      categoryId: string;
      facetValueIds: string[];
      status: DocumentStatus;
    }>,
  ) {
    return this.documents.update(id, body);
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('documents/:id')
  deleteDocument(@Param('id') id: string) {
    return this.documents.delete(id);
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('documents/:id/files')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  uploadFile(
    @Param('id') documentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('medium') medium: Medium,
    @Body('subfolder') subfolder?: string,
  ) {
    if (!file) throw new Error('File required');
    return this.files.uploadForDocument(
      documentId,
      medium,
      file.buffer,
      file.originalname,
      subfolder || 'uploads',
    );
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('files/:id')
  deleteFile(@Param('id') id: string) {
    return this.files.deleteFile(id);
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('settings/login-warning')
  async getLoginWarning() {
    const setting = await this.prisma.setting.findUnique({ where: { key: 'login_warning' } });
    return { showWarning: setting?.value === 'true' };
  }

  @UseGuards(AdminAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('settings/login-warning')
  async toggleLoginWarning(@Body() body: { showWarning: boolean }) {
    await this.prisma.setting.upsert({
      where: { key: 'login_warning' },
      update: { value: body.showWarning.toString() },
      create: { key: 'login_warning', value: body.showWarning.toString() }
    });
    return { success: true };
  }
}
