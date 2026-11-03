import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminAuthService } from './admin-auth.service';
import { DocumentsModule } from '../documents/documents.module';
import { FilesModule } from '../files/files.module';
import { AuthModule } from '../auth/auth.module';
import { ApplicationsModule } from '../applications/applications.module';

@Module({
  imports: [DocumentsModule, FilesModule, AuthModule, ApplicationsModule],
  controllers: [AdminController],
  providers: [AdminAuthService],
})
export class AdminModule {}
