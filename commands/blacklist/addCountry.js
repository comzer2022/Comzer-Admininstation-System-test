import { SlashCommandBuilder } from 'discord.js';  // ← @discordjs/builders から変更
import { addBlacklistEntry } from '../../utils/blacklistManager.js';
import { checkPermissions, unauthorizedReply } from './utils.js';

export const data = new SlashCommandBuilder()
  .setName("add_country")
  .setDescription("ブラックリスト(国)に追加")
  .addStringOption(o =>
    o.setName("name").setDescription("国名").setRequired(true)
  );

export async function execute(interaction) {
  const hasPermission = await checkPermissions(interaction);
  if (!hasPermission) {
    console.trace("権限エラー: add_country");
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(unauthorizedReply());
    }
    return;
  }

  const country = interaction.options.getString("name", true).trim();
  const result = await addBlacklistEntry("Country", country, "");

  if (result.result === "duplicate") {
    await interaction.reply(`⚠️ 既にブラックリスト(国) に登録されています`);
  } else if (result.result === "reactivated") {
    await interaction.reply(`🟢 無効だった「${country}」を再有効化しました`);
  } else if (result.result === "added") {
    await interaction.reply(`✅ ブラックリスト(国) に「${country}」を追加しました`);
  }
}
