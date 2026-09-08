import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DEMO_TRACKS } from './demo-tracks';
import { ImportsService } from './imports.service';

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

  @Get('status')
  status(@Req() req: AuthedRequest) {
    return this.imports.status(req.user.userId);
  }
}
