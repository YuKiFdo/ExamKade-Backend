import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { DocumentStatus, Medium, SubscriptionStatus } from '@prisma/client';
import { Response, Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';

@Injectable()
export class FilesService {
  constructor(
    private prisma: PrismaService,
    private storage: LocalStorageService,
    private jwtService: JwtService,
    private config: ConfigService,
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
    req: Request,
    res: Response,
    meta: { ip?: string; userAgent?: string },
  ) {
    const file = await this.getFileRecord(fileId);

    // 1. Check if user is authenticated and has an active subscription
    let token: string | null = null;
    if (req.cookies && req.cookies['access_token']) {
      token = req.cookies['access_token'];
    } else {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    let userId: string | null = null;
    let isSubscribed = false;

    if (token) {
      try {
        const payload = this.jwtService.verify(token, {
          secret: this.config.get<string>('JWT_SECRET') || 'dev-secret',
        });
        if (payload && payload.sub) {
          userId = payload.sub;
          const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
          if (user && user.subscriptionStatus === SubscriptionStatus.ACTIVE) {
            isSubscribed = true;
          }
        }
      } catch (err) {
        // Fallback
      }
    }

    // 2. Log download if logged in
    if (userId) {
      await this.prisma.downloadLog.create({
        data: {
          userId,
          documentFileId: file.id,
          documentId: file.documentId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
      });
    }

    // 3. Set download headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    );

    // 4. Read file buffer
    const filePath = this.storage.resolvePath(file.relativePath);
    let fileBuffer: any = await fs.promises.readFile(filePath);

    // 5. Watermark if NOT subscribed
    if (!isSubscribed) {
      fileBuffer = await this.addWatermarkToPdf(fileBuffer);
    }

    res.end(fileBuffer);
  }

  private async addWatermarkToPdf(buffer: Buffer): Promise<Buffer> {
    try {
      const { PDFDocument, rgb, StandardFonts, degrees } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.load(buffer);
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();

      for (const page of pages) {
        const { width, height } = page.getSize();
        
        // Draw diagonal watermarks grid
        for (let x = -100; x < width + 200; x += 250) {
          for (let y = -100; y < height + 200; y += 180) {
            page.drawText('FONIX EDU', {
              x,
              y,
              size: 24,
              font,
              color: rgb(0.6, 0.6, 0.6),
              opacity: 0.12,
              rotate: degrees(30),
            });
          }
        }
      }

      const savedBytes = await pdfDoc.save();
      return Buffer.from(savedBytes);
    } catch (err) {
      console.error('Error watermarking PDF:', err);
      return buffer; // Fallback to original buffer on error
    }
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
