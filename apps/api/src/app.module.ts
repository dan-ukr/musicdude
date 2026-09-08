import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { ImportsModule } from './imports/imports.module';
import { PortraitModule } from './portrait/portrait.module';
import { QueueModule } from './queue/queue.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    // '../../.env' is the repo root: one .env for api + worker in local dev.
    // On Render the dashboard supplies the vars and both paths are simply absent.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    DatabaseModule,
    QueueModule,
    AuthModule,
    UserModule,
    CatalogModule,
    ImportsModule,
    PortraitModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
