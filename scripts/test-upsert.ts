import { upsertMember, MemberUpsertPayload } from '../citizen_data/czrApi.js';

const id = process.argv[2];
if (!id) {
  console.error('usage: node scripts/test-upsert.js <discord_id>');
  process.exit(1);
}

// テスト用途のため discord_name / display_name は省略
const payload = {
  guild_id: process.env.CZR_GUILD_ID || '1188411576483590194',
  discord_id: id,
  group: 'citizen',
  roles: [],
} as unknown as MemberUpsertPayload;

upsertMember(payload)
  .then((r) => console.log('OK', r))
  .catch((e: Error) => {
    console.error('NG', e.message);
    process.exit(2);
  });
