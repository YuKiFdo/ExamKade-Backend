import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { Public } from '../common/decorators/public.decorator';
import { RootType } from '@prisma/client';
import { ClientTypes } from '../common/decorators/client-types.decorator';
import { SwaggerClientType } from '../common/decorators/swagger-client-type.decorator';

@ClientTypes('both')
@SwaggerClientType('both')
@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Public()
  @ApiOperation({ summary: 'Get latest documents' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Get('latest')
  getLatest(@Query('limit') limit?: string) {
    return this.documentsService.getLatest(
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Public()
  @ApiOperation({ summary: 'Search documents with facets' })
  @ApiQuery({ name: 'rootType', enum: RootType, required: false })
  @ApiQuery({ name: 'exam', required: false, type: String })
  @ApiQuery({ name: 'grade', required: false, type: String })
  @ApiQuery({ name: 'subject', required: false, type: String })
  @ApiQuery({ name: 'year', required: false, type: String })
  @ApiQuery({ name: 'medium', required: false, type: String })
  @ApiQuery({ name: 'term', required: false, type: String })
  @ApiQuery({ name: 'province', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
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
  @ApiOperation({ summary: 'Find document by slug' })
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.documentsService.findBySlug(slug);
  }
}
