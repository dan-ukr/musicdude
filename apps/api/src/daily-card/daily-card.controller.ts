import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn } from 'class-validator';
import type { DailyCardAction } from '@musicdude/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DailyCardService } from './daily-card.service';

class ActionDto {
  @IsIn(['more-of-this', 'get-me-out'])
  action!: DailyCardAction;
}

type AuthedRequest = { user: { userId: string } };

@Controller('daily-card')
@UseGuards(JwtAuthGuard)
export class DailyCardController {
  constructor(private readonly cards: DailyCardService) {}

  @Get()
  today(@Req() req: AuthedRequest) {
    return this.cards.today(req.user.userId);
  }

  @Post('action')
  act(@Req() req: AuthedRequest, @Body() dto: ActionDto) {
    return this.cards.act(req.user.userId, dto.action);
  }
}
