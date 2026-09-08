import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EntitlementsService, FREE_PLAYLISTS_PER_MONTH } from './entitlements.service';

class DevPremiumDto {
  @IsBoolean()
  active!: boolean;
}

type AuthedRequest = { user: { userId: string } };

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly entitlements: EntitlementsService) {}

  @Get('status')
  async status(@Req() req: AuthedRequest) {
    const premium = await this.entitlements.isPremium(req.user.userId);
    const used = await this.entitlements.playlistsUsedThisMonth(req.user.userId);
    return {
      premium,
      playlists: { used, limit: premium ? null : FREE_PLAYLISTS_PER_MONTH },
      devToggleEnabled: process.env.ALLOW_DEV_PREMIUM === 'true',
    };
  }

  /**
   * Local/demo only: grants the entitlement without a store purchase so both
   * tiers can be exercised. Never enabled in production — RevenueCat webhooks
   * are the only source of truth there.
   */
  @Post('dev-premium')
  async devPremium(@Req() req: AuthedRequest, @Body() dto: DevPremiumDto) {
    if (process.env.ALLOW_DEV_PREMIUM !== 'true') {
      throw new ForbiddenException('Dev premium toggle is disabled');
    }
    await this.entitlements.setDevPremium(req.user.userId, dto.active);
    return { premium: dto.active };
  }
}
