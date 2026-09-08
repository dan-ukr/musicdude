import { Module } from '@nestjs/common';
import { ChangeController } from './change.controller';

@Module({
  controllers: [ChangeController],
})
export class ChangeModule {}
