import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Trust reverse proxy headers (e.g. X-Forwarded-Proto) for secure cookies
  (app as any).set('trust proxy', 1);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');
  
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: '',
    defaultVersion: ['web', 'mobile'],
  });

  const config = new DocumentBuilder()
    .setTitle('ExamKade API')
    .setDescription('The ExamKade backend API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  
  // Transform Swagger tags based on paths to organize beautifully in Apidog/Postman
  if (document.paths) {
    for (const [path, methods] of Object.entries(document.paths)) {
      for (const method of Object.values(methods as any)) {
        // path looks like /api/web/admin/categories/:id
        const parts = path.split('/').filter(Boolean); // ['api', 'web', 'admin', 'categories', ':id']
        if (parts.length >= 3 && parts[0] === 'api') {
          const platform = parts[1]; // 'web' or 'mobile'
          const module = parts[2];   // 'auth' or 'admin'
          
          let tag = `${platform}/${module}`;
          
          // Create sub-folder for the specific resource (e.g., 'categories', 'documents')
          if (parts.length >= 4) {
            tag += `/${parts[3]}`;
          }
          
          // Create another sub-folder for ID-specific endpoints
          if (parts.length >= 5 && parts[4].includes(':')) {
            tag += `/{id}`;
          }
          
          (method as any).tags = [tag];
        }
      }
    }
  }

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs/json',
  });

  app.enableCors({
    origin: (requestOrigin, callback) => {
      // Allow if no origin (e.g., Postman) or dynamically allow other origins
      // This allows mobile apps (which might not send an origin or send custom ones) and local dev
      callback(null, true); 
    },
    credentials: true,
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}/api`);
}
bootstrap();
