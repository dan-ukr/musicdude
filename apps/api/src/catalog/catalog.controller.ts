import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { SearchResult } from '@musicdude/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeezerService } from './deezer.service';
import { SpotifyService } from './spotify.service';

@Controller('catalog')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  constructor(
    private readonly spotify: SpotifyService,
    private readonly deezer: DeezerService,
  ) {}

  @Get('search')
  async search(@Query('q') q?: string): Promise<SearchResult[]> {
    const query = (q ?? '').trim();
    if (query.length < 2) return [];
    const viaSpotify = await this.spotify.search(query);
    if (viaSpotify && viaSpotify.length > 0) return viaSpotify;
    return this.deezer.search(query);
  }
}
