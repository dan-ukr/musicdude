import { Module } from '@nestjs/common';
import { DailyCardController } from './daily-card.controller';
import { DailyCardService } from './daily-card.service';

@Module({
  controllers: [DailyCardController],
  providers: [DailyCardService],
})
export class DailyCardModule {}
