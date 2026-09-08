import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@Req() req: { user: { userId: string } }, @Query('city') city?: string) {
    return this.events.forUser(req.user.userId, city?.trim() || undefined);
  }
}
