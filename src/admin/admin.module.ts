import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminAuthService } from './admin-auth.service';
import { DocumentsModule } from '../documents/documents.module';
import { FilesModule } from '../files/files.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DocumentsModule, FilesModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminAuthService],
})
export class AdminModule {}
