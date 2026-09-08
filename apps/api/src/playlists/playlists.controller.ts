import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { FacetQuery } from '@musicdude/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlaylistsService } from './playlists.service';

class CreatePlaylistDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsObject()
  facets!: FacetQuery;

  @IsOptional()
  @IsBoolean()
  includeRecommended?: boolean;
}

type AuthedRequest = { user: { userId: string } };

@Controller('playlists')
@UseGuards(JwtAuthGuard)
export class PlaylistsController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreatePlaylistDto) {
    return this.playlists.create(req.user.userId, dto);
  }

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.playlists.list(req.user.userId);
  }

  @Get(':id/tracks')
  tracks(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.playlists.tracks(req.user.userId, id);
  }
}
