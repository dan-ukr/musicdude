import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CatalogModule } from './catalog/catalog.module';
import { ChangeModule } from './change/change.module';
import { DailyCardModule } from './daily-card/daily-card.module';
import { DatabaseModule } from './database/database.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './health/health.controller';
import { ImportsModule } from './imports/imports.module';
import { LibraryModule } from './library/library.module';
import { PlaylistsModule } from './playlists/playlists.module';
import { PortraitModule } from './portrait/portrait.module';
import { QueueModule } from './queue/queue.module';
import { SocialModule } from './social/social.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    // '../../.env' is the repo root: one .env for api + worker in local dev.
    // On Render the dashboard supplies the vars and both paths are simply absent.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    DatabaseModule,
    QueueModule,
    BillingModule,
    AuthModule,
    UserModule,
    CatalogModule,
    ImportsModule,
    PortraitModule,
    LibraryModule,
    PlaylistsModule,
    DailyCardModule,
    SocialModule,
    EventsModule,
    ChangeModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
