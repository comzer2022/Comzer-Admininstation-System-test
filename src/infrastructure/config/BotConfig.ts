export class BotConfig {
    get discordToken(): string | undefined {
        return process.env.DISCORD_TOKEN;
    }
    get discordWebhookUrl(): string | undefined {
        return process.env.DISCORD_WEBHOOK_URL;
    }
    get openaiApiKey(): string | undefined {
        return process.env.OPENAI_API_KEY;
    }
    get casbotApiSecret(): string | undefined {
        return process.env.CASBOT_API_SECRET;
    }
    get joinerMatchApiKey(): string | undefined {
        return process.env.YOUR_SECRET_API_KEY;
    }
    private parseRoleIds(value: string | undefined): string[] {
        return (value || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    }
    get ministerRoleIds(): string[] {
        return this.parseRoleIds(process.env.ROLLID_MINISTER);
    }
    get diplomatRoleIds(): string[] {
        return this.parseRoleIds(process.env.ROLLID_DIPLOMAT);
    }
    get examinerRoleIds(): string[] {
        return this.parseRoleIds(process.env.EXAMINER_ROLE_IDS);
    }
    get stopRoleIds(): string[] {
        return this.parseRoleIds(process.env.STOP_ROLE_IDS);
    }
    get stopUserIds(): string[] {
        return this.parseRoleIds(process.env.STOP_USER_IDS);
    }
    get deployRoleId(): string | undefined {
        return process.env.DEPLOY_ROLE_ID;
    }
    get googleSheetId(): string {
        return process.env.GOOGLE_SHEET_ID as string;
    }
    get googleServiceAccountEmail(): string | undefined {
        return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    }
    get googlePrivateKey(): string {
        return process.env.GOOGLE_PRIVATE_KEY as string;
    }
    get blacklistTabName(): string {
        return process.env.BLACKLIST_TAB_NAME || 'blacklist(CAS連携)';
    }
    get czrBase(): string {
        return process.env.CZR_BASE as string;
    }
    get czrKey(): string {
        return process.env.CZR_KEY || 'casbot';
    }
    get czrSecret(): string {
        return process.env.CZR_SECRET as string;
    }
    get czrThrottleMs(): number {
        return Number(process.env.CZR_THROTTLE_MS || 700);
    }
    get czrSyncIntervalMs(): number {
        return Number(process.env.CZR_SYNC_INTERVAL_MS || 10800000);
    }
    get joinerMatchApiUrl(): string {
        return 'https://comzer-gov.net/wp-json/czr/v1/data-access';
    }
    get ticketCategoryId(): string | undefined {
        return process.env.TICKET_CAT;
    }
    get logChannelId(): string {
        return process.env.LOG_CHANNEL_ID as string;
    }
    get adminKeyword(): string {
        return process.env.ADMIN_KEYWORD || '!status';
    }
    get koyebApiToken(): string | undefined {
        return process.env.KOYEB_API_TOKEN;
    }
    get koyebAppId(): string | undefined {
        return process.env.KOYEB_APP_ID;
    }
    get port(): number {
        return Number(process.env.PORT || 3000);
    }
    get referenceGuildId(): string {
        return '1188411576483590194';
    }
}
