import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EntitlementsService } from '../billing/entitlements.service';
import { SocialService } from './social.service';

class CodeDto {
  @IsString()
  @Length(4, 32)
  code!: string;
}

type AuthedRequest = { user: { userId: string } };

@Controller('social')
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(
    private readonly social: SocialService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get('code')
  code(@Req() req: AuthedRequest) {
    return this.social.myCode(req.user.userId);
  }

  /** Always free: every share has to land on someone who has not paid. */
  @Get('compare/:code')
  compare(@Req() req: AuthedRequest, @Param('code') code: string) {
    return this.social.compare(req.user.userId, code);
  }

  /** Keeping a friend (ongoing match tracking) is the premium half. */
  @Post('friends')
  async addFriend(@Req() req: AuthedRequest, @Body() dto: CodeDto) {
    if (!(await this.entitlements.isPremium(req.user.userId))) {
      throw new ForbiddenException({ error: 'premium_required', reason: 'friends' });
    }
    return this.social.addFriend(req.user.userId, dto.code);
  }

  @Get('friends')
  friends(@Req() req: AuthedRequest) {
    return this.social.friends(req.user.userId);
  }
}
