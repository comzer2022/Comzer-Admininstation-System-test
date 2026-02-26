export async function checkPermissions(interaction) {
  let userRoleIds = [];

  if (interaction.guildId) {
    userRoleIds = interaction.member.roles.cache.map(r => String(r.id));
  } else {
    const refGuildId = "1188411576483590194";
    const guild = await interaction.client.guilds.fetch(refGuildId);
    const member = await guild.members.fetch(interaction.user.id);
    userRoleIds = member.roles.cache.map(r => String(r.id));
  }

  const ALLOWED_ROLE_IDS = [
    ...(process.env.ROLLID_MINISTER   ? process.env.ROLLID_MINISTER.split(',')   : []),
    ...(process.env.ROLLID_DIPLOMAT   ? process.env.ROLLID_DIPLOMAT.split(',')   : []),
    ...(process.env.EXAMINER_ROLE_IDS ? process.env.EXAMINER_ROLE_IDS.split(',') : []),
  ].map(x => x.trim()).filter(Boolean);

  const hasRole = ALLOWED_ROLE_IDS.some(roleId => userRoleIds.includes(roleId));

  console.log('【権限チェック】有効ロールID:', ALLOWED_ROLE_IDS);
  console.log('【権限チェック】ユーザーロールID:', userRoleIds);
  console.log('【権限チェック】hasRole:', hasRole);

  return hasRole;
}

export function unauthorizedReply() {
  return {
    content: "君はステージが低い。君のコマンドを受け付けると君のカルマが私の中に入って来て私が苦しくなる。(権限エラー)",
    ephemeral: true
  };
}
