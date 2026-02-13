// commands/blacklist/index.js
import { SlashCommandBuilder } from '@discordjs/builders';
import { addBlacklistEntry, removeBlacklistEntry, getActiveBlacklist } from '../../utils/blacklistManager.js';

// 共通の権限チェック関数
async function checkPermissions(interaction) {
  let userRoleIds = [];

  if (interaction.guild) {
    userRoleIds = interaction.member.roles.cache.map(r => String(r.id));
  } else {
    const refGuildId = "1188411576483590194";
    if (!refGuildId) {
      throw new Error("環境変数 REFERENCE_GUILD_ID が設定されていません");
    }
    const guild = await interaction.client.guilds.fetch(refGuildId);
    const member = await guild.members.fetch(interaction.user.id);
    userRoleIds = member.roles.cache.map(r => String(r.id));
  }

  const ALLOWED_ROLE_IDS = [
    ...(process.env.ROLLID_MINISTER ? process.env.ROLLID_MINISTER.split(',') : []),
    ...(process.env.ROLLID_DIPLOMAT ? process.env.ROLLID_DIPLOMAT.split(',') : []),
  ].map(x => x.trim()).filter(Boolean);

  const hasRole = ALLOWED_ROLE_IDS.some(roleId => userRoleIds.includes(roleId));

  console.log('【権限チェック】有効ロールID:', ALLOWED_ROLE_IDS);
  console.log('【権限チェック】ユーザーロールID:', userRoleIds);
  console.log('【権限チェック】hasRole:', hasRole);

  return hasRole;
}

// コマンド定義
export const commands = [
  new SlashCommandBuilder()
    .setName("delete_rolepost")
    .setDescription("役職発言（Bot発言）の削除")
    .addStringOption(o =>
      o.setName("message_id").setDescription("削除するメッセージのID").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("add_country")
    .setDescription("ブラックリスト(国)に追加")
    .addStringOption(o =>
      o.setName("name").setDescription("国名").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("remove_country")
    .setDescription("ブラックリスト(国)から削除")
    .addStringOption(o =>
      o.setName("name").setDescription("国名").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("add_player")
    .setDescription("ブラックリスト(プレイヤー)に追加")
    .addStringOption(o =>
      o.setName("mcid").setDescription("MCID").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("remove_player")
    .setDescription("ブラックリスト(プレイヤー)から削除")
    .addStringOption(o =>
      o.setName("mcid").setDescription("MCID").setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("list_blacklist")
    .setDescription("ブラックリストの一覧を表示"),
];

// コマンドハンドラ
export async function handleCommands(interaction) {
  if (!interaction.isChatInputCommand()) return false;
  const name = interaction.commandName;

  // 権限チェック
  const hasPermission = await checkPermissions(interaction);

  if (!hasPermission) {
    console.trace("権限エラーreply!");
    if (!interaction.replied && !interaction.deferred) {
      console.log("REPLY DEBUG", {
        where: "権限チェック",
        command: name,
        hasPermission,
      });
      await interaction.reply({
        content: "君はステージが低い。君のコマンドを受け付けると君のカルマが私の中に入って来て私が苦しくなる。(権限エラー)",
        ephemeral: true
      });
    }
    return true;
  }

  // 各コマンド処理
  switch (name) {
    case "add_country":
      return await handleAddCountry(interaction);
    case "remove_country":
      return await handleRemoveCountry(interaction);
    case "add_player":
      return await handleAddPlayer(interaction);
    case "remove_player":
      return await handleRemovePlayer(interaction);
    case "list_blacklist":
      return await handleListBlacklist(interaction);
    case "delete_rolepost":
      return await handleDeleteRolepost(interaction);
    default:
      return false;
  }
}

async function handleAddCountry(interaction) {
  const country = interaction.options.getString("name", true).trim();
  const result = await addBlacklistEntry("Country", country, "");

  if (result.result === "duplicate") {
    await interaction.reply(`⚠️ 既にブラックリスト(国) に登録されています`);
  } else if (result.result === "reactivated") {
    await interaction.reply(`🟢 無効だった「${country}」を再有効化しました`);
  } else if (result.result === "added") {
    await interaction.reply(`✅ ブラックリスト(国) に「${country}」を追加しました`);
  }
  return true;
}

async function handleRemoveCountry(interaction) {
  const country = interaction.options.getString("name", true).trim();
  const result = await removeBlacklistEntry("Country", country);

  if (result.result === "invalidated") {
    await interaction.reply(`🟣 「${country}」を無効化しました`);
  } else {
    await interaction.reply(`⚠️ ブラックリスト(国) に「${country}」は存在しません`);
  }
  return true;
}

async function handleAddPlayer(interaction) {
  const mcid = interaction.options.getString("mcid", true).trim();
  const result = await addBlacklistEntry("Player", mcid, "");

  if (result.result === "duplicate") {
    await interaction.reply(`⚠️ 既にブラックリスト(プレイヤー) に登録されています`);
  } else if (result.result === "reactivated") {
    await interaction.reply(`🟢 無効だった「${mcid}」を再有効化しました`);
  } else if (result.result === "added") {
    await interaction.reply(`✅ ブラックリスト(プレイヤー) に「${mcid}」を追加しました`);
  }
  return true;
}

async function handleRemovePlayer(interaction) {
  const mcid = interaction.options.getString("mcid", true).trim();
  const result = await removeBlacklistEntry("Player", mcid);

  if (result.result === "invalidated") {
    await interaction.reply(`🟣 「${mcid}」を無効化しました`);
  } else {
    await interaction.reply(`⚠️ ブラックリスト(プレイヤー) に「${mcid}」は存在しません`);
  }
  return true;
}

async function handleListBlacklist(interaction) {
  const countries = await getActiveBlacklist("Country");
  const players = await getActiveBlacklist("Player");
  const countryList = countries.length > 0 ? countries.map(r => r.value).join('\n') : "なし";
  const playerList = players.length > 0 ? players.map(r => r.value).join('\n') : "なし";

  await interaction.reply({
    embeds: [{
      title: "ブラックリスト一覧",
      fields: [
        { name: "国", value: countryList, inline: false },
        { name: "プレイヤー", value: playerList, inline: false },
      ],
      color: 0x2c3e50
    }],
    ephemeral: true
  });
  return true;
}

async function handleDeleteRolepost(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const messageId = interaction.options.getString('message_id', true);
  const channel = interaction.channel;
  const member = interaction.member;
  const ROLE_CONFIG = interaction.client.ROLE_CONFIG || {};

  const diplomatRoles = (process.env.ROLLID_DIPLOMAT || '').split(',').map(s => s.trim()).filter(Boolean);
  const ministerRoles = (process.env.ROLLID_MINISTER || '').split(',').map(s => s.trim()).filter(Boolean);
  const examinerRoles = (process.env.EXAMINER_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

  const executorRoleIds = member.roles.cache.map(r => r.id);

  try {
    const msg = await channel.messages.fetch(messageId);

    if (!msg.webhookId) {
      return await interaction.editReply({
        content: "コムザール行政システムが送信した役職発言のみ削除できます。",
      });
    }

    const embed = msg.embeds[0];
    const authorName = embed?.author?.name;
    if (!authorName) {
      return await interaction.editReply({
        content: "このメッセージは役職発言ではないようです。",
      });
    }

    const roleIdOfEmbed = Object.entries(ROLE_CONFIG)
      .find(([rid, cfg]) => cfg.embedName === authorName)
      ?.[0];

    if (!roleIdOfEmbed) {
      return await interaction.editReply({
        content: "このメッセージは役職発言ではないようです。",
      });
    }

    let mode = null;
    if (ministerRoles.includes(roleIdOfEmbed)) {
      mode = 'minister';
    } else if (diplomatRoles.includes(roleIdOfEmbed)) {
      mode = 'diplomat';
    } else if (examinerRoles.includes(roleIdOfEmbed)) {
      mode = 'examiner';
    }

    if (!mode) {
      return await interaction.editReply({
        content: "この発言のモードが特定できません。",
      });
    }

    const hasPermission = (
      mode === 'minister'
        ? ministerRoles.some(r => executorRoleIds.includes(r))
        : mode === 'diplomat'
          ? diplomatRoles.some(r => executorRoleIds.includes(r))
          : mode === 'examiner'
            ? examinerRoles.some(r => executorRoleIds.includes(r))
            : false
    );

    if (!hasPermission) {
      return await interaction.editReply({
        content: `この${mode === 'minister' ? '閣僚会議議員' : mode === 'diplomat' ? '外交官(外務省 総合外務部職員)' : '入国審査担当官'}の発言を削除する権限がありません。`,
      });
    }

    await msg.delete();
    return await interaction.editReply({
      content: "役職発言を削除しました。",
    });

  } catch (e) {
    console.error("delete_rolepost error:", e);
    return await interaction.editReply({
      content: "指定のメッセージが見つからないか、削除できませんでした。",
    });
  }

  return true;
}
