import { SlashCommandBuilder } from 'discord.js';
import { addBlacklistEntry } from '../../utils/blacklistManager.js';
import { checkPermissions, unauthorizedReply } from './utils.js';

export const data = new SlashCommandBuilder()
  .setName("add_player")
  .setDescription("ブラックリスト(プレイヤー)に追加")
  .addStringOption(o =>
    o.setName("mcid").setDescription("MCID").setRequired(true)
  );

export async function execute(interaction) {
  const hasPermission = await checkPermissions(interaction);

  if (!hasPermission) {
    console.trace("権限エラー: add_player");
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(unauthorizedReply());
    }
    return;
  }

  const mcid = interaction.options.getString("mcid", true).trim();
  const result = await addBlacklistEntry("Player", mcid, "");

  if (result.result === "duplicate") {
    await interaction.reply(`⚠️ 既にブラックリスト(プレイヤー) に登録されています`);
  } else if (result.result === "reactivated") {
    await interaction.reply(`🟢 無効だった「${mcid}」を再有効化しました`);
  } else if (result.result === "added") {
    await interaction.reply(`✅ ブラックリスト(プレイヤー) に「${mcid}」を追加しました`);
  }
}
