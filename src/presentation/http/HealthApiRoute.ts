import type { Express, Request, Response } from 'express';
import type { SelfCheckService } from '../../application/ops/SelfCheckService.js';
import type { HmacVerifier } from '../../infrastructure/http/HmacVerifier.js';

/**
 * 運用ダッシュボード(comzer-wp-system)から自己診断結果を取得するためのエンドポイント。
 */
export class HealthApiRoute {
    constructor(private readonly selfCheck: SelfCheckService, private readonly hmac: HmacVerifier) { }

    register(app: Express): void {
        app.get('/api/health', this.hmac.middleware(), async (_req: Request, res: Response) => {
            try {
                const result = await this.selfCheck.runSelfCheck();
                res.json({ ok: true, ...result });
            }
            catch (error) {
                console.error('[api/health] self check failed:', error);
                res.status(500).json({ ok: false, error: 'self check failed' });
            }
        });
    }
}
