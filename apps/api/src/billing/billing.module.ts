import { Global, Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { EntitlementsService } from './entitlements.service';

@Global()
@Module({
  controllers: [BillingController],
  providers: [EntitlementsService],
  exports: [EntitlementsService],
})
export class BillingModule {}
