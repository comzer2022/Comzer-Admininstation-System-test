// commands/blacklist/listBlacklist.js
import { SlashCommandBuilder } from '@discordjs/builders';
import { getActiveBlacklist } from '../../utils/blacklistManager.js';
import { checkPermissions, unauthorizedReply } from './utils.js';

export const data = new SlashCommandBuilder()
  .setName("list_blacklist")
  .setDescription("ブラックリストの一覧を表示");

export async function execute(interaction) {
  const hasPermission = await checkPermissions(interaction);

  if (!hasPermission) {
    console.trace("権限エラー: list_blacklist");
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(unauthorizedReply());
    }
    return;
  }

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
}
