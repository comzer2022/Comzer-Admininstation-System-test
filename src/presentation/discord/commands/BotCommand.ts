import type { ChatInputCommandInteraction } from 'discord.js';
export interface SlashCommandLike {
    name: string;
    toJSON(): unknown;
}
export interface BotCommand {
    data: SlashCommandLike;
    execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
}
