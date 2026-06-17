import { upsertMember, deleteAbsentMembers } from './czrApi.js';

const GUILD_ID      = '1188411576483590194';
const ROLE_DIPLOMAT = '1188429176739479562';

const MIN_SYNCED_THRESHOLD = 10; 
export function inferGroupFromRoles(roleIds) {
  if (roleIds.includes(ROLE_DIPLOMAT)) return 'diplomat';
  return 'citizen';
}

export async function syncMember(m) {
  // user が取れていない partial メンバーは強制的に fetch
  const user = m.user ?? await m.fetch().then(fm => fm.user);
  
  if (!user?.username) {
    console.warn('[syncMember] skip: username missing', m.id);
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
  console.log('[syncMember]', m.id, user.username, res.status);
  return res;
}

export async function fullSync(client, throttleMs = 1000) {
  const g = await client.guilds.fetch(GUILD_ID);

  // limit なしで fetch → Discord.js が自動でチャンク分割して全件取得
  const members = await g.members.fetch();
  // 今回サーバーに実際に存在し、同期成功した discord_id を記録する
  const syncedIds = new Set();
  for (const m of members.values()) {
    if (m.user?.bot) continue;
    try {
      const res = await syncMember(m);
      if (res !== null) {
        // syncMember が null を返した場合は username 欠落などで実際には送れていないためスキップ
        syncedIds.add(m.id);
      }
    } catch (e) {
      console.error(m.id, 'failed:', e.message);
      // 失敗したメンバーは syncedIds に追加しない
      // → 一時的なエラーでも削除対象にならないよう保守的に扱う
    }
    const jitter = Math.floor(Math.random() * 250);
    await new Promise(r => setTimeout(r, throttleMs + jitter));
  }
  console.log(`Synced: ${syncedIds.size} members`);
  // ===== 離脱メンバーの削除 =====
  await purgeAbsentMembers(syncedIds);

  console.log('successed');
}

/**
 * サーバーに存在しない（= syncedIds に含まれない）メンバーを DB から削除する。
 *
 * @param {Set<string>} syncedIds - 今回サーバーに存在が確認された discord_id の Set
 */
async function purgeAbsentMembers(syncedIds) {
  if (syncedIds.size < MIN_SYNCED_THRESHOLD) {
    // 同期件数が異常に少ない場合は fetch 失敗の可能性があるため削除しない
    console.warn(
      `[purgeAbsentMembers] Skipped: synced count (${syncedIds.size}) is below threshold (${MIN_SYNCED_THRESHOLD}).`
    );
    return;
  }
  try {
    const res = await deleteAbsentMembers({
      guild_id:    GUILD_ID,
      discord_ids: [...syncedIds], // Set → Array に変換して送信
    });
    const body = await res.json();
    console.log(`[purgeAbsentMembers] Deleted ${body.deleted_count ?? '?'} absent member(s).`);
  } catch (e) {
    console.error('[purgeAbsentMembers] Failed:', e.message);
  }
}
