import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { PortraitPayload, PortraitResponse } from '@musicdude/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PgService } from '../database/pg.service';
import { ImportsService } from '../imports/imports.service';

@Controller('portrait')
@UseGuards(JwtAuthGuard)
export class PortraitController {
  constructor(
    private readonly pg: PgService,
    private readonly imports: ImportsService,
  ) {}

  @Get()
  async portrait(@Req() req: { user: { userId: string } }): Promise<PortraitResponse> {
    const userId = req.user.userId;
    const [scan, snapshot] = await Promise.all([
      this.imports.status(userId),
      this.pg.query<{ payload: PortraitPayload }>(
        `SELECT payload FROM taste.portrait_snapshots
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId],
      ),
    ]);
    return { scan, portrait: snapshot.rows[0]?.payload ?? null };
  }
}
