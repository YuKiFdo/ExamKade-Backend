import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { BulkImportService } from './bulk-import.service';

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, BulkImportService],
  exports: [DocumentsService, BulkImportService],
})
export class DocumentsModule {}
