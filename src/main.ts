import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
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
  const rawOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  const origin = rawOrigin.includes(',') 
    ? rawOrigin.split(',').map(o => o.trim()) 
    : rawOrigin;

  app.enableCors({
    origin,
    credentials: true,
  });
  app.setGlobalPrefix('api');
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}/api`);
}
bootstrap();
