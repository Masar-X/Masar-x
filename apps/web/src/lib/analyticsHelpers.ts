import { supabase } from './supabase';
import { logger } from '@/lib/logger';
import type { Json } from '@/types/database';

export const analyticsHelpers = {
    /**
     * Records a low-frequency auth event (user_login / user_logout — the
     * only remaining Postgres analytics rows) to the database. All other
     * event tracking moved to Redis counters via lib/metrics.ts (lean
     * analytics, 2026-10-21).
     */
    async recordAnalytics(params: {
        userId: string;
        actionType: string;
        contentType: string;
        contentId?: string;
        metadata?: Json;
    }) {
        try {
            const { error } = await supabase.from('analytics').insert({
                user_id: params.userId,
                action_type: params.actionType,
                content_type: params.contentType,
                content_id: params.contentId,
                metadata: params.metadata || {},
            });
            // supabase-js resolves (never throws) on rejections — without
            // reading the error, a failed write is indistinguishable from
            // no user activity (see the 2026-10-21 false-outage diagnosis).
            if (error) {
                logger.error('[analytics] recordAnalytics insert failed', error, { actionType: params.actionType });
            }
        } catch {
            // ignore — tracking must never break the auth flow that calls it
        }
    },
};
