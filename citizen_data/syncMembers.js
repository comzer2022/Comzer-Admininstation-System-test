import { upsertMember, deleteAbsentMembers } from './czrApi.js';

const GUILD_ID      = '1188411576483590194';
const ROLE_DIPLOMAT = '1188429176739479562';

// fullSync 中に fetch に失敗したメンバーを除外するため、
// 実際に同期できた discord_id だけを追跡する
const MIN_SYNCED_THRESHOLD = 10; // この件数未満なら削除ステップをスキップ（誤削除防止）

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
  console.log(m.id, user.username, res.status);
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

  console.log(`Synced: ${syncedIds.size} members.`);

  // ===== 離脱メンバーの削除 =====
  await purgeAbsentMembers(syncedIds);

  console.log('Successed');
}

/**
 * サーバーに存在しない（= syncedIds に含まれない）メンバーを DB から削除し、
 * 削除されたメンバーの一覧を Discord Webhook でログに送信する。
 *
 * @param {Set<string>} syncedIds - 今回サーバーに存在が確認された discord_id の Set
 */
async function purgeAbsentMembers(syncedIds) {
  if (syncedIds.size < MIN_SYNCED_THRESHOLD) {
    console.warn(
      `Skipped: synced count (${syncedIds.size}) is below threshold (${MIN_SYNCED_THRESHOLD}).`
    );
    return;
  }

  let result;
  try {
    result = await deleteAbsentMembers({
      guild_id:    GUILD_ID,
      discord_ids: [...syncedIds],
    });
  } catch (e) {
    console.error(`Failed:`, e.message);
    return;
  }

  const { deleted_count = 0, deleted_ids = [] } = result;
  console.log('Deleted ${deleted_count} absent member(s).`);
  for (const id of deleted_ids) {
    console.log('removed', id);
  }
}
