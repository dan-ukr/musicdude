import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const origins = process.env.CORS_ALLOWED_ORIGINS ?? '*';
  app.enableCors({ origin: origins === '*' ? true : origins.split(',') });

  // Render (and most hosts) assign the port through PORT and health-check it;
  // API_PORT stays as the local-dev override.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`musicdude api listening on :${port}`);
}
bootstrap();
