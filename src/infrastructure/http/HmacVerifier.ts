import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { BotConfig } from '../config/BotConfig.js';

/**
 * WP(comzer-wp-system)からの着信リクエストを検証する。
 * 署名方式はCzrBridgeClient.sign()と対称(HMAC-SHA256, 対象文字列は "{ts}\n{body}")。
 */
export class HmacVerifier {
    constructor(private readonly config: BotConfig) { }

    middleware() {
        return (req: Request, res: Response, next: NextFunction): void => {
            const key = req.header('X-CZR-Key') ?? '';
            const tsRaw = req.header('X-CZR-Ts') ?? '';
            const sign = req.header('X-CZR-Sign') ?? '';
            if (!key || !tsRaw || !sign) {
                res.status(401).json({ error: 'Missing HMAC headers' });
                return;
            }
            if (Math.abs(Date.now() / 1000 - Number(tsRaw)) > 3600) {
                res.status(401).json({ error: 'Timestamp out of range' });
                return;
            }
            if (key !== this.config.czrKey) {
                res.status(401).json({ error: 'Unknown key' });
                return;
            }
            // rawBodyはindex.tsのbodyParser.json({ verify })で設定される生のボディ文字列。
            // GET等ボディなしリクエストでは未設定のため空文字列として扱う(WP側の送信仕様と対称)。
            const raw = (req as unknown as { rawBody?: string }).rawBody ?? '';
            const calc = crypto.createHmac('sha256', this.config.czrSecret).update(`${tsRaw}\n${raw}`).digest('base64');
            const calcBuf = Buffer.from(calc);
            const signBuf = Buffer.from(sign);
            if (calcBuf.length !== signBuf.length || !crypto.timingSafeEqual(calcBuf, signBuf)) {
                res.status(401).json({ error: 'Signature mismatch' });
                return;
            }
            next();
        };
    }
}
