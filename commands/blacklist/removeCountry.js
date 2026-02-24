import { SlashCommandBuilder } from 'discord.js';  // ← @discordjs/builders から変更
import { removeBlacklistEntry } from '../../utils/blacklistManager.js';
import { checkPermissions, unauthorizedReply } from './utils.js';

export const data = new SlashCommandBuilder()
  .setName("remove_country")
  .setDescription("ブラックリスト(国)から削除")
  .addStringOption(o =>
    o.setName("name").setDescription("国名").setRequired(true)
  );

export async function execute(interaction) {
  const hasPermission = await checkPermissions(interaction);
  if (!hasPermission) {
    console.trace("権限エラー: remove_country");
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(unauthorizedReply());
    }
    return;
  }

  const country = interaction.options.getString("name", true).trim();
  const result = await removeBlacklistEntry("Country", country);

  if (result.result === "invalidated") {
    await interaction.reply(`🟣 「${country}」を無効化しました`);
  } else {
    await interaction.reply(`⚠️ ブラックリスト(国) に「${country}」は存在しません`);
  }
}
