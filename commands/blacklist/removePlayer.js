import { SlashCommandBuilder } from 'discord.js';  // ← @discordjs/builders から変更
import { removeBlacklistEntry } from '../../utils/blacklistManager.js';
import { checkPermissions, unauthorizedReply } from './utils.js';

export const data = new SlashCommandBuilder()
  .setName("remove_player")
  .setDescription("ブラックリスト(プレイヤー)から削除")
  .addStringOption(o =>
    o.setName("mcid").setDescription("MCID").setRequired(true)
  );

export async function execute(interaction) {
  const hasPermission = await checkPermissions(interaction);
  if (!hasPermission) {
    console.trace("権限エラー: remove_player");
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(unauthorizedReply());
    }
    return;
  }

  const mcid = interaction.options.getString("mcid", true).trim();
  const result = await removeBlacklistEntry("Player", mcid);

  if (result.result === "invalidated") {
    await interaction.reply(`🟣 「${mcid}」を無効化しました`);
  } else {
    await interaction.reply(`⚠️ ブラックリスト(プレイヤー) に「${mcid}」は存在しません`);
  }
}
