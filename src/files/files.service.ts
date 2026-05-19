import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { DocumentStatus, Medium } from '@prisma/client';
import { Response } from 'express';

@Injectable()
export class FilesService {
  constructor(
    private prisma: PrismaService,
    private storage: LocalStorageService,
  ) {}

  async getFileRecord(fileId: string) {
    const file = await this.prisma.documentFile.findUnique({
      where: { id: fileId },
      include: {
        document: true,
      },
    });
    if (!file || file.document.status !== DocumentStatus.PUBLISHED) {
      throw new NotFoundException('File not found');
    }
    return file;
  }

  streamPreview(fileId: string, res: Response) {
    return this.getFileRecord(fileId).then((file) => {
      // Use a custom MIME type to prevent download managers (like IDM) from intercepting the PDF preview
      res.setHeader('Content-Type', 'application/x-fonix-document');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(file.fileName)}.fonix"`,
      );
      res.setHeader('Cache-Control', 'private, no-store');
      const stream = this.storage.createReadStream(file.relativePath);
      stream.pipe(res);
    });
  }

  async streamDownload(
    fileId: string,
    userId: string,
    res: Response,
    meta: { ip?: string; userAgent?: string },
  ) {
    const file = await this.getFileRecord(fileId);
    await this.prisma.downloadLog.create({
      data: {
        userId,
        documentFileId: file.id,
        documentId: file.documentId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    );
    const stream = this.storage.createReadStream(file.relativePath);
    stream.pipe(res);
  }

  async uploadForDocument(
    documentId: string,
    medium: Medium,
    buffer: Buffer,
    originalName: string,
    subfolder: string,
  ) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { category: true },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const folder =
      subfolder ||
      `${doc.category.rootType.toLowerCase().replace(/_/g, '-')}`;
    const saved = await this.storage.saveFile(buffer, folder, originalName);

    return this.prisma.documentFile.upsert({
      where: { documentId_medium: { documentId, medium } },
      create: {
        documentId,
        medium,
        relativePath: saved.relativePath,
        fileName: originalName,
        sizeBytes: saved.sizeBytes,
      },
      update: {
        relativePath: saved.relativePath,
        fileName: originalName,
        sizeBytes: saved.sizeBytes,
      },
    });
  }

  async deleteFile(fileId: string) {
    const file = await this.prisma.documentFile.findUnique({
      where: { id: fileId },
    });
    if (!file) throw new NotFoundException('File not found');
    await this.storage.deleteFile(file.relativePath);
    await this.prisma.downloadLog.deleteMany({ where: { documentFileId: fileId } });
    return this.prisma.documentFile.delete({ where: { id: fileId } });
  }
}
