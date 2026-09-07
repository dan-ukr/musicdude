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
    ConfigModule.forRoot({ isGlobal: true }),
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
