import { Injectable } from '@nestjs/common';
import { PgService } from '../database/pg.service';

const ENTITLEMENT = process.env.REVENUECAT_ENTITLEMENT_ID ?? 'premium';

/** Free-tier limits from the product spec. */
export const FREE_FACET_STACK = 2;
export const FREE_PLAYLISTS_PER_MONTH = 3;
export const FREE_CHANGE_DAYS = 30;

@Injectable()
export class EntitlementsService {
  constructor(private readonly pg: PgService) {}

  async isPremium(userId: string): Promise<boolean> {
    const res = await this.pg.query<{ is_active: boolean }>(
      `SELECT is_active FROM billing.subscription_entitlements
       WHERE user_id = $1 AND entitlement_name = $2
         AND (expires_at IS NULL OR expires_at > now())`,
      [userId, ENTITLEMENT],
    );
    return res.rows[0]?.is_active === true;
  }

  /** Dev-only switch so both tiers are demonstrable before RevenueCat exists. */
  async setDevPremium(userId: string, active: boolean): Promise<void> {
    await this.pg.query(
      `INSERT INTO billing.subscription_entitlements (user_id, entitlement_name, is_active, provider)
       VALUES ($1, $2, $3, 'dev')
       ON CONFLICT (user_id, entitlement_name)
       DO UPDATE SET is_active = EXCLUDED.is_active, provider = 'dev', updated_at = now()`,
      [userId, ENTITLEMENT, active],
    );
  }

  async playlistsUsedThisMonth(userId: string): Promise<number> {
    const res = await this.pg.query<{ used: number }>(
      `SELECT count(*)::int AS used FROM music.playlists
       WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
      [userId],
    );
    return res.rows[0]?.used ?? 0;
  }
}
