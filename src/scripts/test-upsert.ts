import { CzrBridgeClient, MemberUpsertPayload } from '../infrastructure/czrBridge/CzrBridgeClient.js';
import { BotConfig } from '../infrastructure/config/BotConfig.js';
const id = process.argv[2];
if (!id) {
    console.error('usage: node scripts/test-upsert.js <discord_id>');
    process.exit(1);
}
const config = new BotConfig();
const czrBridge = new CzrBridgeClient(config);
const payload = {
    guild_id: process.env.CZR_GUILD_ID || config.referenceGuildId,
    discord_id: id,
    group: 'citizen',
    roles: [],
} as unknown as MemberUpsertPayload;
czrBridge
    .upsertMember(payload)
    .then((r) => console.log('OK', r))
    .catch((e: Error) => {
    console.error('NG', e.message);
    process.exit(2);
});
