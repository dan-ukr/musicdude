import { Global, Module } from '@nestjs/common';
import { PgService } from './pg.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, PgService],
  exports: [PrismaService, PgService],
})
export class DatabaseModule {}
