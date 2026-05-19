import { Controller, Get, Param, Query } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Public()
  @Get('roots')
  getRoots() {
    return this.categoriesService.getRootCategories();
  }

  @Public()
  @Get('tree')
  getTree() {
    return this.categoriesService.getCategoryTree();
  }

  @Public()
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
