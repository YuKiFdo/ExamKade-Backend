import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentStatus, FacetKey, RootType } from '@prisma/client';

const ROOT_FACETS: Record<RootType, FacetKey[]> = {
  PAST_PAPERS: [FacetKey.EXAM, FacetKey.SUBJECT, FacetKey.YEAR, FacetKey.MEDIUM],
  MODEL_PAPERS: [FacetKey.EXAM, FacetKey.SUBJECT, FacetKey.YEAR, FacetKey.MEDIUM],
  TERM_TEST: [
    FacetKey.GRADE,
    FacetKey.SUBJECT,
    FacetKey.YEAR,
    FacetKey.TERM,
    FacetKey.PROVINCE,
  ],
  SYLLABUS: [FacetKey.GRADE, FacetKey.SUBJECT, FacetKey.MEDIUM],
  TEACHERS_GUIDE: [FacetKey.GRADE, FacetKey.SUBJECT, FacetKey.MEDIUM],
  TEXT_BOOKS: [FacetKey.GRADE, FacetKey.SUBJECT, FacetKey.MEDIUM],
  GAZETTE: [],
};

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  getRootCategories() {
    return this.prisma.category.findMany({
      where: { parentId: null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getCategoryTree() {
    const roots = await this.getRootCategories();
    return Promise.all(
      roots.map(async (root) => ({
        ...root,
        children: await this.prisma.category.findMany({
          where: { parentId: root.id },
          orderBy: { sortOrder: 'asc' },
        }),
      })),
    );
  }

  async resolveByPath(slugs: string[]) {
    if (!slugs.length) {
      return { category: null, rootType: null, breadcrumbs: [] };
    }

    const root = await this.prisma.category.findFirst({
      where: { slug: slugs[0], parentId: null },
    });
    if (!root) throw new NotFoundException('Category not found');

    const breadcrumbs = [root];
    let current = root;

    for (let i = 1; i < slugs.length; i++) {
      const child = await this.prisma.category.findFirst({
        where: { slug: slugs[i], parentId: current.id },
      });
      if (!child) break;
      breadcrumbs.push(child);
      current = child;
    }

    return { category: current, rootType: root.rootType, breadcrumbs };
  }

  getFacetKeysForRoot(rootType: RootType): FacetKey[] {
    return ROOT_FACETS[rootType] || [];
  }

  async getFacetOptions(rootType: RootType, facetKey: FacetKey) {
    return this.prisma.facetValue.findMany({
      where: { facetKey },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async getCategoryPage(slugs: string[], page = 1, limit = 12, filters: Record<string, any> = {}) {
    const { category, rootType, breadcrumbs } = await this.resolveByPath(slugs);
    
    let facetKeys: FacetKey[] = [];
    if (category) {
      // Find the first category in the breadcrumbs hierarchy (from leaf to root) that has allowedFilters defined and not empty
      for (let i = breadcrumbs.length - 1; i >= 0; i--) {
        const cat = breadcrumbs[i];
        if (cat.allowedFilters && cat.allowedFilters.length > 0) {
          facetKeys = cat.allowedFilters;
          break;
        }
      }
    }
    
    // Fallback to default facets for this rootType if none specified
    if (facetKeys.length === 0 && rootType) {
      facetKeys = this.getFacetKeysForRoot(rootType);
    }

    if (!category || !rootType) {
      return {
        breadcrumbs,
        facetOptions: [],
        documents: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      };
    }

    let categoryIds: string[];
    if (category.parentId === null) {
      const all = await this.prisma.category.findMany({
        where: { rootType },
        select: { id: true },
      });
      categoryIds = all.map((c) => c.id);
    } else {
      const cats = await this.prisma.category.findMany({
        where: { OR: [{ id: category.id }, { parentId: category.id }] },
        select: { id: true },
      });
      categoryIds = cats.map((c) => c.id);
    }

    // Find all unique facet values present on published documents in these categories
    const activeFacetValueIds = new Set<string>();
    if (categoryIds.length > 0) {
      const documentsInCategory = await this.prisma.document.findMany({
        where: {
          categoryId: { in: categoryIds },
          status: DocumentStatus.PUBLISHED,
        },
        select: {
          facets: {
            select: {
              facetValueId: true,
            },
          },
        },
      });
      for (const doc of documentsInCategory) {
        for (const f of doc.facets) {
          activeFacetValueIds.add(f.facetValueId);
        }
      }
    }

    const facetOptions = await Promise.all(
      facetKeys.map(async (key) => {
        const allOptions = await this.getFacetOptions(rootType, key);
        const filteredOptions = allOptions.filter((o) => activeFacetValueIds.has(o.id));
        return {
          key,
          options: filteredOptions,
        };
      }),
    );

    return this.listDocumentsByCategoryIds(
      categoryIds,
      facetOptions,
      breadcrumbs,
      page,
      limit,
      filters
    );
  }

  private async listDocumentsByCategoryIds(
    categoryIds: string[],
    facetOptions: { key: FacetKey; options: unknown[] }[],
    breadcrumbs: unknown[],
    page: number,
    limit: number,
    filters: Record<string, any>
  ) {
    const facetWhere = Object.entries(filters).map(([k, v]) => ({
      facets: {
        some: {
          facetValue: {
            facetKey: k.toUpperCase() as FacetKey,
            slug: v,
          },
        },
      },
    }));

    const where = {
      status: DocumentStatus.PUBLISHED,
      categoryId: { in: categoryIds },
      AND: facetWhere.length > 0 ? facetWhere : undefined,
    };
    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        include: {
          category: true,
          facets: { include: { facetValue: true } },
          files: true,
        },
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      breadcrumbs,
      facetOptions,
      documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
