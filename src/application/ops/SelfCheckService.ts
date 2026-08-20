import { CzrBridgeClient } from '../../infrastructure/czrBridge/CzrBridgeClient.js';
import { BlacklistRepository } from '../../infrastructure/sheets/BlacklistRepository.js';
import { MojangClient } from '../../infrastructure/minecraft/MojangClient.js';
import { PlayerDbClient } from '../../infrastructure/minecraft/PlayerDbClient.js';
export interface SelfCheckResult {
    citizenSheet: string;
    blacklistSheet: string;
    mojangApi: string;
    bedrockApi: string;
    checkedAt: Date;
}
export class SelfCheckService {
    private lastSelfCheck = new Date();
    constructor(private readonly czrBridge: CzrBridgeClient, private readonly blacklist: BlacklistRepository, private readonly mojang: MojangClient, private readonly playerDb: PlayerDbClient) { }
    getLastSelfCheck(): Date {
        return this.lastSelfCheck;
    }
    touchLastCheckTime(): void {
        this.lastSelfCheck = new Date();
    }
    async runSelfCheck(): Promise<SelfCheckResult> {
        const results = await Promise.allSettled([
            this.checkCitizenSheet(),
            this.checkBlacklistSheet(),
            this.checkMojang(),
            this.checkBedrock(),
        ]);
        const citizenSheet = results[0]!.status === 'fulfilled' ? results[0]!.value : '⛔ 国民名簿：連携失敗';
        const blacklistSheet = results[1]!.status === 'fulfilled' ? results[1]!.value : '⛔ ブラックリスト：連携失敗';
        const mojangApi = results[2]!.status === 'fulfilled' ? results[2]!.value : '⛔ Mojang API：連携失敗';
        const bedrockApi = results[3]!.status === 'fulfilled' ? results[3]!.value : '⛔ Bedrock API：連携失敗';
        this.lastSelfCheck = new Date();
        return { citizenSheet, blacklistSheet, mojangApi, bedrockApi, checkedAt: this.lastSelfCheck };
    }
    private async checkCitizenSheet(): Promise<string> {
        try {
            const ok = await this.czrBridge.healthCheck();
            return ok ? '✅ 国民名簿：連携中' : '⛔ 国民名簿：連携失敗';
        }
        catch (err) {
            console.error('[STATUS] citizen healthz error:', err instanceof Error ? err.message : err);
            return '⛔ 国民名簿：連携失敗';
        }
    }
    private async checkBlacklistSheet(): Promise<string> {
        try {
            const ok = await this.blacklist.healthCheck();
            return ok ? '✅ ブラックリスト：連携中' : '⛔ ブラックリスト：連携失敗';
        }
        catch (err) {
            console.error('[STATUS] blacklist sheet error:', err instanceof Error ? err.message : err);
            return '⛔ ブラックリスト：連携失敗';
        }
    }
    private async checkMojang(): Promise<string> {
        try {
            const ok = await this.mojang.healthCheck();
            return ok ? '✅ Mojang API：連携中' : '⛔ Mojang API：連携失敗';
        }
        catch (err) {
            console.error('[STATUS] mojang API error:', err instanceof Error ? err.message : err);
            return '⛔ Mojang API：連携失敗';
        }
    }
    private async checkBedrock(): Promise<string> {
        try {
            const ok = await this.playerDb.healthCheck();
            return ok ? '✅ Bedrock API：連携中' : '⛔ Bedrock API：連携失敗';
        }
        catch (err) {
            console.error('[STATUS] bedrock API error:', err instanceof Error ? err.message : err);
            return '⛔ Bedrock API：連携失敗';
        }
    }
}
