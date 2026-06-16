import { upsertMember } from './czrApi.js';

const GUILD_ID      = '1188411576483590194';
const ROLE_DIPLOMAT = '1188429176739479562';

export function inferGroupFromRoles(roleIds) {
  if (roleIds.includes(ROLE_DIPLOMAT)) return 'diplomat';
  return 'citizen';
}

export async function syncMember(m) {
  // user が取れていない partial メンバーは強制的に fetch
  const user = m.user ?? await m.fetch().then(fm => fm.user);
  
  if (!user?.username) {
    console.warn('skip: username missing', m.id);
    return null;
  }

  const roles = [...m.roles.cache.keys()];

  const payload = {
    guild_id:     GUILD_ID,
    discord_id:   m.id,
    discord_name: user.username,
    display_name: m.displayName ?? user.username,
    group:        inferGroupFromRoles(roles),
    roles,
  };

  const res = await upsertMember(payload);
  console.log('m.id, user.username, res.status);
  return res;
}

export async function fullSync(client, throttleMs = 1000) {
  const g = await client.guilds.fetch(GUILD_ID);

  // limit なしで fetch → Discord.js が自動でチャンク分割して全件取得
  const members = await g.members.fetch();
  for (const m of members.values()) {
    if (m.user?.bot) continue;
    try {
      await syncMember(m);
    } catch (e) {
      console.error('m.id, 'failed:', e.message);
    }
    const jitter = Math.floor(Math.random() * 250);
    await new Promise(r => setTimeout(r, throttleMs + jitter));
  }
}
