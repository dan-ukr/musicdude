import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DEMO_TRACKS } from './demo-tracks';
import { ImportsService } from './imports.service';
import { fetchSpotifyLink, parseImportFile } from './parsers';

class ImportedTrackDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsString()
  @MaxLength(300)
  artist!: string;

  @IsOptional()
  @IsString()
  playedAt?: string;

  @IsOptional()
  playCount?: number;
}

class StartImportDto {
  @IsIn(['search', 'playlist-link', 'gdpr-export', 'demo', 'spotify-liked'])
  source!: 'search' | 'playlist-link' | 'gdpr-export' | 'demo' | 'spotify-liked';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportedTrackDto)
  tracks!: ImportedTrackDto[];
}

class LinkDto {
  @IsString()
  @MaxLength(500)
  url!: string;
}

class FileDto {
  @IsString()
  @MaxLength(20_000_000)
  content!: string;
}

type AuthedRequest = { user: { userId: string } };

@Controller('import')
@UseGuards(JwtAuthGuard)
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post()
  start(@Req() req: AuthedRequest, @Body() dto: StartImportDto) {
    return this.imports.startImport(req.user.userId, dto.source, dto.tracks);
  }

  @Post('demo')
  demo(@Req() req: AuthedRequest) {
    return this.imports.startImport(req.user.userId, 'demo', DEMO_TRACKS);
  }

  /** Public Spotify playlist/album/track link — keyless, works in a browser. */
  @Post('spotify-link')
  async spotifyLink(@Req() req: AuthedRequest, @Body() dto: LinkDto) {
    let parsed;
    try {
      parsed = await fetchSpotifyLink(dto.url);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    if (parsed.tracks.length === 0) throw new BadRequestException('No tracks found at that link');
    const scan = await this.imports.startImport(req.user.userId, 'playlist-link', parsed.tracks);
    return { ...scan, sourceName: parsed.name };
  }

  /**
   * Spotify data export (JSON, with real timestamps), an Apple Music / iTunes
   * Library.xml, or a plain "Artist - Title" list.
   */
  @Post('file')
  async file(@Req() req: AuthedRequest, @Body() dto: FileDto) {
    let tracks;
    try {
      tracks = parseImportFile(dto.content);
    } catch (err) {
      throw new BadRequestException(`Could not read that file: ${(err as Error).message}`);
    }
    if (tracks.length === 0) throw new BadRequestException('No tracks found in that file');
    const source = dto.content.trimStart().startsWith('{') || dto.content.trimStart().startsWith('[')
      ? 'gdpr-export'
      : 'search';
    return this.imports.startImport(req.user.userId, source, tracks);
  }

  @Get('status')
  status(@Req() req: AuthedRequest) {
    return this.imports.status(req.user.userId);
  }
}
