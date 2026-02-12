import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
export let isDebugMode = false; 

const ALLOWED_DEBUG_ROLE_IDS = [
  "1269977566744416266",
  "1188425695043534848",
  "1188412762775359538"
]

export const data = new SlashCommandBuilder()
  .setName('debug')
  .setDescription('デバッグモードのオン・オフを切り替えます')
  .addStringOption(option =>
    option.setName('mode')
      .setDescription('ONまたはOFFを選択')
      .setRequired(true)
      .addChoices(
        { name: 'ON', value: 'on' },
        { name: 'OFF', value: 'off' }
      ))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  // 1. 実行者が許可されたロールを「少なくとも1つ」持っているか確認
  const hasPermission = interaction.member.roles.cache.some(role => 
    ALLOWED_DEBUG_ROLE_IDS.includes(role.id)
  );

  // ロールを持っていない場合は拒否
  if (!hasPermission) {
    return interaction.reply({
      content: "このコマンドを実行する権限がありません。",
      ephemeral: true
    });
  }

  // 2. 選択肢に基づいて true / false を設定
  const choice = interaction.options.getString('status');
  isDebugMode = (choice === 'on');
  
  const statusText = isDebugMode ? "ON" : "OFF";
  
  // 3. 結果を返信
  await interaction.reply({
    content: `行政システムのデバッグモードを **${statusText}** に設定しました。`,
    ephemeral: true
  });
}
