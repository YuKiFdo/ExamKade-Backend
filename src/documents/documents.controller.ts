import { Controller, Get, Param, Query } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { Public } from '../common/decorators/public.decorator';
import { RootType } from '@prisma/client';

@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Public()
  @Get('latest')
  getLatest(@Query('limit') limit?: string) {
    return this.documentsService.getLatest(
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Public()
  @Get('search')
  search(
    @Query('rootType') rootType?: RootType,
    @Query('exam') exam?: string,
    @Query('grade') grade?: string,
    @Query('subject') subject?: string,
    @Query('year') year?: string,
    @Query('medium') medium?: string,
    @Query('term') term?: string,
    @Query('province') province?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.documentsService.searchWithFacets({
      rootType,
      exam,
      grade,
      subject,
      year,
      medium,
      term,
      province,
      q,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 12,
    });
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.documentsService.findBySlug(slug);
  }
}
