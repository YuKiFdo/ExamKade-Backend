import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DocumentStatus,
  FacetKey,
  Medium,
  Prisma,
  RootType,
} from '@prisma/client';
import { slugify } from '../common/utils/slug.util';

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  async findPublished(query: {
    q?: string;
    rootType?: RootType;
    facetSlugs?: string[];
    categoryId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page || 1;
    const limit = query.limit || 12;
    const where: Prisma.DocumentWhereInput = {
      status: DocumentStatus.PUBLISHED,
    };

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.rootType) {
      where.category = { rootType: query.rootType };
    }

    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    if (query.facetSlugs?.length) {
      where.AND = query.facetSlugs.map((slug) => ({
        facets: { some: { facetValue: { slug } } },
      }));
    }

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
      documents,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findBySlug(slug: string) {
    const doc = await this.prisma.document.findFirst({
      where: { slug, status: DocumentStatus.PUBLISHED },
      include: {
        category: { include: { parent: true } },
        facets: { include: { facetValue: true } },
        files: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const related = await this.prisma.document.findMany({
      where: {
        status: DocumentStatus.PUBLISHED,
        categoryId: doc.categoryId,
        id: { not: doc.id },
      },
      take: 6,
      include: { files: true },
    });

    return { document: doc, related };
  }

  async getLatest(limit = 10) {
    return this.prisma.document.findMany({
      where: { status: DocumentStatus.PUBLISHED },
      include: {
        category: true,
        facets: { include: { facetValue: true } },
        files: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: limit,
    });
  }

  async searchWithFacets(params: {
    rootType?: RootType;
    exam?: string;
    grade?: string;
    subject?: string;
    year?: string;
    medium?: string;
    term?: string;
    province?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const facetMap: { key: FacetKey; slug?: string }[] = [
      { key: FacetKey.EXAM, slug: params.exam },
      { key: FacetKey.GRADE, slug: params.grade },
      { key: FacetKey.SUBJECT, slug: params.subject },
      { key: FacetKey.YEAR, slug: params.year },
      { key: FacetKey.MEDIUM, slug: params.medium },
      { key: FacetKey.TERM, slug: params.term },
      { key: FacetKey.PROVINCE, slug: params.province },
    ].filter((f) => f.slug) as { key: FacetKey; slug: string }[];

    const slugs = facetMap.map((f) => f.slug as string);
    return this.findPublished({
      rootType: params.rootType,
      facetSlugs: slugs,
      q: params.q,
      page: params.page,
      limit: params.limit,
    });
  }

  // Admin methods
  async create(data: {
    title: string;
    slug?: string;
    description?: string;
    categoryId: string;
    facetValueIds?: string[];
    status?: DocumentStatus;
  }) {
    const slug = data.slug || slugify(data.title);
    return this.prisma.document.create({
      data: {
        title: data.title,
        slug,
        description: data.description,
        categoryId: data.categoryId,
        status: data.status || DocumentStatus.DRAFT,
        publishedAt:
          data.status === DocumentStatus.PUBLISHED ? new Date() : null,
        facets: data.facetValueIds?.length
          ? {
              create: data.facetValueIds.map((id) => ({ facetValueId: id })),
            }
          : undefined,
      },
      include: { facets: { include: { facetValue: true } }, files: true },
    });
  }

  async update(
    id: string,
    data: Partial<{
      title: string;
      slug: string;
      description: string;
      categoryId: string;
      status: DocumentStatus;
      facetValueIds: string[];
    }>,
  ) {
    const { facetValueIds, ...rest } = data;
    if (facetValueIds) {
      await this.prisma.documentFacet.deleteMany({ where: { documentId: id } });
      await this.prisma.documentFacet.createMany({
        data: facetValueIds.map((facetValueId) => ({ documentId: id, facetValueId })),
      });
    }
    return this.prisma.document.update({
      where: { id },
      data: {
        ...rest,
        publishedAt:
          rest.status === DocumentStatus.PUBLISHED ? new Date() : undefined,
      },
      include: { facets: { include: { facetValue: true } }, files: true },
    });
  }

  async findAllAdmin(page = 1, limit = 20) {
    const [documents, total] = await Promise.all([
      this.prisma.document.findMany({
        include: {
          category: true,
          facets: { include: { facetValue: true } },
          files: true,
          _count: { select: { downloadLogs: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.document.count(),
    ]);
    return { documents, pagination: { page, limit, total } };
  }

  async findByIdAdmin(id: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: {
        category: true,
        facets: { include: { facetValue: true } },
        files: true,
      },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async delete(id: string) {
    await this.prisma.downloadLog.deleteMany({ where: { documentId: id } });
    return this.prisma.document.delete({ where: { id } });
  }
}
