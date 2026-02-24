import { upsertMember } from '../citizen_data/czrApi.js';  // ← src/ を削除

const id = process.argv[2];
if (!id) { console.error('usage: node scripts/test-upsert.js <discord_id>'); process.exit(1); }
upsertMember({ guild_id: process.env.CZR_GUILD_ID || '1188411576483590194', discord_id: id, group: 'citizen', roles: [] })
  .then(r => console.log('OK', r))
  .catch(e => { console.error('NG', e.message); process.exit(2); });
