import { Module } from '@nestjs/common';
import { ImportsModule } from '../imports/imports.module';
import { PortraitController } from './portrait.controller';

@Module({
  imports: [ImportsModule],
  controllers: [PortraitController],
})
export class PortraitModule {}
