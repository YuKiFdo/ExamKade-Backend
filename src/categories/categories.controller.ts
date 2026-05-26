import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { Public } from '../common/decorators/public.decorator';
import { ClientTypes } from '../common/decorators/client-types.decorator';
import { SwaggerClientType } from '../common/decorators/swagger-client-type.decorator';

@ClientTypes('both')
@SwaggerClientType('both')
@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Public()
  @ApiOperation({ summary: 'Get all root categories' })
  @Get('roots')
  getRoots() {
    return this.categoriesService.getRootCategories();
  }

  @Public()
  @ApiOperation({ summary: 'Get full category tree' })
  @Get('tree')
  getTree() {
    return this.categoriesService.getCategoryTree();
  }

  @Public()
  @ApiOperation({ summary: 'Get category page with documents' })
  @ApiQuery({ name: 'path', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @Get('page')
  getByPath(@Query() query: any) {
    const path = query.path;
    const page = query.page;
    const limit = query.limit;
    const slugs = path ? path.split('/').filter(Boolean) : [];
    
    // Extract facet filters (anything except path, page, limit)
    const filters = { ...query };
    delete filters.path;
    delete filters.page;
    delete filters.limit;

    return this.categoriesService.getCategoryPage(
      slugs,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 12,
      filters
    );
  }
}
