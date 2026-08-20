import { GptExtractionClient } from '../../infrastructure/openai/GptExtractionClient.js';
import { MojangClient } from '../../infrastructure/minecraft/MojangClient.js';
import { PlayerDbClient } from '../../infrastructure/minecraft/PlayerDbClient.js';
import { BlacklistRepository } from '../../infrastructure/sheets/BlacklistRepository.js';
import { JoinerMatchClient } from '../../infrastructure/czrBridge/JoinerMatchClient.js';
import { isPeriodTooLong, hasRequiredFields } from '../../domain/service/InspectionRules.js';
import { nowJST } from '../../infrastructure/logger/nowJST.js';
import type { Session } from '../../domain/model/Session.js';
import type { InspectionResult, ParsedApplication } from '../../domain/model/ParsedApplication.js';
export class InspectionOrchestrator {
    constructor(private readonly gpt: GptExtractionClient, private readonly mojang: MojangClient, private readonly playerDb: PlayerDbClient, private readonly blacklist: BlacklistRepository, private readonly joinerMatch: JoinerMatchClient) { }
    async runInspection(content: string, session: Session): Promise<InspectionResult> {
        let parsed: ParsedApplication;
        try {
            parsed = await this.gpt.extract(content);
            session.logs.push(`[${nowJST()}] 整形結果: ${JSON.stringify(parsed, null, 2)}`);
        }
        catch (e) {
            session.logs.push(`[${nowJST()}] 整形エラー: ${e}`);
            return {
                approved: false,
                content: '申請内容の解析に失敗しました。もう一度ご入力ください。',
            };
        }
        if (await this.blacklist.isBlacklistedCountry(parsed.nation)) {
            session.logs.push(`[${nowJST()}] ＜Blacklist(国)該当＞ ${parsed.nation}`);
            return {
                approved: false,
                content: '申請された国籍は安全保障上の理由から入国を許可することができないため、却下します。',
                parsed,
            };
        }
        if (await this.blacklist.isBlacklistedPlayer(parsed.mcid)) {
            session.logs.push(`[${nowJST()}] ＜Blacklist(プレイヤー)該当＞ ${parsed.mcid}`);
            return {
                approved: false,
                content: '申請されたMCIDは安全保障上の理由から入国を許可することができないため、却下します。',
                parsed,
            };
        }
        const version = session?.data?.version || 'java';
        const mcid = (parsed.mcid ?? '').replace(/^BE_/, '');
        let exists = false;
        try {
            exists = version === 'java' ? await this.mojang.exists(mcid) : await this.playerDb.exists(mcid);
        }
        catch (err) {
            console.error('[InspectionService] MCID check error:', err);
        }
        if (!exists) {
            return {
                approved: false,
                content: `申請者MCID「${parsed.mcid}」のアカウントチェックが出来ませんでした。綴りにお間違いはございませんか?`,
                parsed,
            };
        }
        if (parsed.companions && Array.isArray(parsed.companions)) {
            for (const companion of parsed.companions) {
                const companionId = typeof companion === 'string' ? companion : companion.mcid;
                if (!companionId)
                    continue;
                if (await this.blacklist.isBlacklistedPlayer(companionId)) {
                    return {
                        approved: false,
                        content: `同行者「${companionId}」は安全保障上の理由から入国を許可することができないため、却下します。`,
                        parsed,
                    };
                }
                let companionVersion = session?.data?.version || 'java';
                if (companionId.startsWith('BE_'))
                    companionVersion = 'bedrock';
                const apiId = companionId.replace(/^BE_/, '');
                let companionExists = false;
                try {
                    companionExists =
                        companionVersion === 'java'
                            ? await this.mojang.exists(apiId)
                            : await this.playerDb.exists(apiId);
                }
                catch (err) {
                    console.error('[InspectionService] Companion check error:', err);
                }
                if (!companionExists) {
                    return {
                        approved: false,
                        content: `同行者MCID「${companionId}」のアカウントチェックが出来ませんでした。綴りにお間違いはございませんか?`,
                        parsed,
                    };
                }
            }
        }
        if (parsed.joiners && parsed.joiners.length > 0) {
            const joinerList = parsed.joiners;
            console.log('[JoinerCheck] joinerList:', joinerList);
            try {
                const { ok, status, data } = await this.joinerMatch.matchJoinersStrict(joinerList);
                if (!ok) {
                    console.error('[JoinerCheck][Error] APIエラー', data);
                    return {
                        approved: false,
                        content: data.message || `サーバーエラー(${status})が発生しました。`,
                    };
                }
                parsed.joinerDiscordIds = joinerList
                    .map((j) => {
                    const raw = j.trim();
                    const key = raw.normalize('NFKC');
                    const id = data.discord_ids?.[key];
                    if (!id) {
                        console.warn(`[JoinerCheck][Warn] raw "${raw}" が discord_ids のキーになっていません`);
                    }
                    return id;
                })
                    .filter((id): id is string => Boolean(id));
                console.log('[JoinerCheck] parsed.joinerDiscordIds:', parsed.joinerDiscordIds);
            }
            catch (e) {
                console.error('[JoinerCheck][Error] ネットワークエラー:', e instanceof Error ? e.message : e);
                return {
                    approved: false,
                    content: '合流者チェックの通信に失敗しました。ネットワークをご確認ください。',
                    parsed,
                };
            }
        }
        if (isPeriodTooLong(parsed.start_datetime, parsed.end_datetime)) {
            return {
                approved: false,
                content: '申請期間が長すぎるため却下します（申請期間が31日を超える場合、31日で申請後、申請が切れる前に再審査をお願いいたします。）',
                parsed,
            };
        }
        if (!hasRequiredFields(parsed)) {
            return {
                approved: false,
                content: '申請情報に不足があります。全項目を入力してください。',
                parsed,
            };
        }
        return { approved: true, content: parsed };
    }
}
