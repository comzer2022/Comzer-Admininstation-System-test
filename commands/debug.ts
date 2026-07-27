import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
export let isDebugMode = false;
const ALLOWED_DEBUG_ROLE_IDS: string[] = [
  '1269977566744416266',
  '1188425695043534848',
  '1188412762775359538',
];

export const data = new SlashCommandBuilder()
  .setName('debug')
  .setDescription('デバッグモードのオン・オフを切り替えます')
  .addStringOption((option) =>
    option
      .setName('mode')
      .setDescription('ONまたはOFFを選択')
      .setRequired(true)
      .addChoices({ name: 'ON', value: 'on' }, { name: 'OFF', value: 'off' })
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<unknown> {
  const member = interaction.member;
  const hasPermission =
    member && 'cache' in member.roles
      ? member.roles.cache.some((role) => ALLOWED_DEBUG_ROLE_IDS.includes(role.id))
      : false;
  if (!hasPermission) {
    return interaction.reply({
      content: 'このコマンドを実行する権限がありません。',
      ephemeral: true,
    });
  }

  const choice = interaction.options.getString('mode');
  isDebugMode = choice === 'on';
  const statusText = isDebugMode ? 'ON' : 'OFF';
  await interaction.reply({
    content: `行政システムのデバッグモードを **${statusText}** に設定しました。`,
    ephemeral: true,
  });
}
