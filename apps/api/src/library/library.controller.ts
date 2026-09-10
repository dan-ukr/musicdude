import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FacetQuery } from '@musicdude/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  EntitlementsService,
  FREE_DISCOVER_LIMIT,
  FREE_FACET_STACK,
} from '../billing/entitlements.service';
import { LibraryService } from './library.service';

type AuthedRequest = { user: { userId: string } };

const FACET_KEYS = ['language', 'mood', 'era', 'region', 'tempo', 'energy', 'rarity', 'genre'] as const;

export function pickFacets(query: Record<string, string | undefined>): FacetQuery {
  const out: Record<string, string> = {};
  for (const key of FACET_KEYS) {
    const value = query[key];
    if (typeof value === 'string' && value.length > 0) out[key] = value;
  }
  return out as FacetQuery;
}

@Controller('library')
@UseGuards(JwtAuthGuard)
export class LibraryController {
  constructor(
    private readonly library: LibraryService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get('facets')
  facets(@Req() req: AuthedRequest) {
    return this.library.facets(req.user.userId);
  }

  @Get('tracks')
  async tracks(@Req() req: AuthedRequest, @Query() query: Record<string, string>) {
    const facets = pickFacets(query);
    // Free tier stacks two facets; browsing results is never capped.
    if (Object.keys(facets).length > FREE_FACET_STACK) {
      if (!(await this.entitlements.isPremium(req.user.userId))) {
        throw new ForbiddenException({
          error: 'premium_required',
          reason: 'facet_stack',
          freeLimit: FREE_FACET_STACK,
        });
      }
    }
    const limit = Math.min(Number(query.limit ?? 100) || 100, 200);
    const offset = Math.max(Number(query.offset ?? 0) || 0, 0);
    return this.library.tracks(req.user.userId, facets, limit, offset);
  }

  /** Discovery from the user tower — free, like the daily card. */
  @Get('for-you')
  forYou(@Req() req: AuthedRequest) {
    return this.library.forYou(req.user.userId);
  }

  /**
   * Browse the catalogue with the library's own filters, each result scored
   * against the user's taste. Free tier sees a daily allowance; the filter
   * stacking limit applies here exactly as it does to the library.
   */
  @Get('discover')
  async discover(@Req() req: AuthedRequest, @Query() query: Record<string, string>) {
    const facets = pickFacets(query);
    const premium = await this.entitlements.isPremium(req.user.userId);
    if (!premium && Object.keys(facets).length > FREE_FACET_STACK) {
      throw new ForbiddenException({
        error: 'premium_required',
        reason: 'facet_stack',
        freeLimit: FREE_FACET_STACK,
      });
    }
    return this.library.discover(req.user.userId, facets, premium ? 60 : FREE_DISCOVER_LIMIT);
  }

  @Post('add')
  async add(@Req() req: AuthedRequest, @Body() body: { trackId?: string }) {
    if (!body?.trackId) throw new BadRequestException('trackId is required');
    await this.library.addToLibrary(req.user.userId, body.trackId);
    return { added: true };
  }

  @Get('recommended')
  async recommended(@Req() req: AuthedRequest, @Query() query: Record<string, string>) {
    if (!(await this.entitlements.isPremium(req.user.userId))) {
      throw new ForbiddenException({ error: 'premium_required', reason: 'recommended_blend' });
    }
    return this.library.recommendedForQuery(req.user.userId, pickFacets(query));
  }
}
