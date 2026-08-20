import type { ChatInputCommandInteraction } from 'discord.js';
import type { SlashCommandLike } from './BotCommand.js';
export interface RegisteredCommand {
    data: SlashCommandLike;
    execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
}
export class CommandRegistry {
    private readonly commands = new Map<string, RegisteredCommand>();
    register(command: RegisteredCommand): void {
        this.commands.set(command.data.name, command);
    }
    get(name: string): RegisteredCommand | undefined {
        return this.commands.get(name);
    }
    asMap(): Map<string, RegisteredCommand> {
        return this.commands;
    }
    toDeployBody(): unknown[] {
        return [...this.commands.values()].map((c) => c.data.toJSON());
    }
}
