import type { ChatInputCommandInteraction } from 'discord.js';

/** SlashCommandBuilder系オブジェクトが最低限持つべき形（.name と .toJSON()） */
export interface SlashCommandLike {
  name: string;
  toJSON(): unknown;
}

/** client.commands に格納される各コマンドモジュールの形 */
export interface BotCommand {
  data: SlashCommandLike;
  execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
}
