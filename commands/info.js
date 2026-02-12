import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import axios from 'axios';

export const data = new SlashCommandBuilder()
  .setName('info')
  .setDescription('実行者の国民情報を表示します（国民のみ実行可）');

export async function execute(interaction) {
  const REQUIR_ROLE_ID = '1188422312823902229';
  const WP_API_URL = 'https://comzer-gov.net/wp-json/custom/v1/citizen-info/'; // WPのURL
  const API_KEY = 'BANANATOYOOGURUTOWOAWASERUTOOISI'

  // 1. ロールチェック
  if (!interaction.member.roles.cache.has(REQUIR_ROLE_ID)) {
    return await interaction.reply({
      content: '❌ エラー：このコマンドを実行する権限がありません。',
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const response = await axios.get(WP_API_URL, {
      params: { discord_id: interaction.user.id },
      headers: {
        'X-API-KEY': API_KEY // 認証用ヘッダー
      }
    });

    const resData = response.data;

    if (resData.message === '情報なし') {
      return await interaction.editReply(`Discord ID: ${interaction.user.id} に該当する国民情報は登録されていません。`);
    }

    // 列名と表示名のマッピング定義
    const labelMap = {
      'discord_id': 'discord id',
      'discord_name': 'discord名',
      'sub_discord_id': 'サブdiscord id',
      'mcid': 'mcid',
      'sub_mcid': 'サブmcid',
      'residence': '所属州',
      'company': '所属企業',
      'party': '所属政党'
    };

    // Embed（埋め込み）形式で綺麗に整える
    const infoEmbed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('👤 国民登録情報')
      .setThumbnail(interaction.user.displayAvatarURL())
      .setFooter({ text: '大統領府内務省 統合管理局' })
      .setTimestamp();

    // マッピングに基づいてデータを追加
    Object.keys(labelMap).forEach(key => {
      let value = resData[key] || '情報なし';
      
      // JSON形式の文字列（例: ["社名"]）のクリーンアップ
      if (typeof value === 'string' && value.startsWith('[')) {
        try {
          const parsed = JSON.parse(value);
          value = Array.isArray(parsed) ? (parsed.length > 0 ? parsed.join(', ') : '情報なし') : value;
        } catch (e) {}
      }

      infoEmbed.addFields({ name: labelMap[key], value: String(value), inline: true });
    });

    await interaction.editReply({ embeds: [infoEmbed] });

  } catch (error) {
    console.error('API Error:', error);
    if (error.response && error.response.status === 401) {
      await interaction.editReply('❌ API認証エラー');
    } else {
      await interaction.editReply('❌ システムエラーが発生しました。');
    }
  }
}
