import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LocalStorageService {
  private readonly root: string;

  constructor(private config: ConfigService) {
    this.root = path.resolve(
      config.get<string>('STORAGE_ROOT') || './storage/uploads',
    );
    fs.mkdirSync(this.root, { recursive: true });
  }

  resolvePath(relativePath: string): string {
    const full = path.resolve(this.root, relativePath);
    if (!full.startsWith(this.root)) {
      throw new NotFoundException('Invalid file path');
    }
    return full;
  }

  exists(relativePath: string): boolean {
    return fs.existsSync(this.resolvePath(relativePath));
  }

  createReadStream(relativePath: string) {
    const full = this.resolvePath(relativePath);
    if (!fs.existsSync(full)) {
      throw new NotFoundException('File not found');
    }
    return fs.createReadStream(full);
  }

  async saveFile(
    buffer: Buffer,
    subfolder: string,
    originalName: string,
  ): Promise<{ relativePath: string; sizeBytes: number }> {
    const ext = path.extname(originalName) || '.pdf';
    const safeName = `${uuidv4()}${ext}`;
    const relativePath = path.join(subfolder, safeName).replace(/\\/g, '/');
    const full = this.resolvePath(relativePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, buffer);
    return { relativePath, sizeBytes: buffer.length };
  }

  async deleteFile(relativePath: string): Promise<void> {
    const full = this.resolvePath(relativePath);
    if (fs.existsSync(full)) {
      await fs.promises.unlink(full);
    }
  }
}
