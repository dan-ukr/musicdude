import { Module } from '@nestjs/common';
import { DailyCardController } from './daily-card.controller';
import { DailyCardService } from './daily-card.service';
import { CandidatesService } from './candidates.service';

@Module({
  controllers: [DailyCardController],
  providers: [DailyCardService, CandidatesService],
})
export class DailyCardModule {}
