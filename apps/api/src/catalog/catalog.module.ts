import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { DeezerService } from './deezer.service';
import { SpotifyService } from './spotify.service';

@Module({
  controllers: [CatalogController],
  providers: [SpotifyService, DeezerService],
})
export class CatalogModule {}
