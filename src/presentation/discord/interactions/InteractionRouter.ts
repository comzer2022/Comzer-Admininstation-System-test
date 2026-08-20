import type { Interaction } from 'discord.js';
import type { CommandRegistry } from '../commands/CommandRegistry.js';
import type { RolepostCommand } from '../commands/RolepostCommand.js';
import { SelectMenuHandler } from './SelectMenuHandler.js';
import { ButtonInteractionHandler } from './ButtonInteractionHandler.js';
import { ModalSubmitHandler } from './ModalSubmitHandler.js';
import { JoinerResponseHandler } from './JoinerResponseHandler.js';
export class InteractionRouter {
    constructor(private readonly registry: CommandRegistry, private readonly rolepostCommand: RolepostCommand, private readonly selectMenuHandler: SelectMenuHandler, private readonly buttonHandler: ButtonInteractionHandler, private readonly modalHandler: ModalSubmitHandler, private readonly joinerHandler: JoinerResponseHandler) { }
    async handle(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() &&
            !interaction.isStringSelectMenu() &&
            !interaction.isChatInputCommand() &&
            !interaction.isModalSubmit()) {
            return;
        }
        if (interaction.isButton() && interaction.customId.startsWith('joinerResponse-')) {
            await this.joinerHandler.handle(interaction);
            return;
        }
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('rolepost-choose-')) {
            await this.rolepostCommand.handleRolepostSelect(interaction);
            return;
        }
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('version-select-')) {
            await this.selectMenuHandler.handleVersionSelect(interaction);
            return;
        }
        if (interaction.isChatInputCommand()) {
            const cmd = this.registry.get(interaction.commandName);
            if (cmd) {
                await cmd.execute(interaction);
                return;
            }
        }
        try {
            if (interaction.isButton()) {
                await this.buttonHandler.handle(interaction);
                return;
            }
            if (interaction.isModalSubmit() && interaction.customId.startsWith('immigration-modal-')) {
                await this.modalHandler.handle(interaction);
                return;
            }
            if (!interaction.replied && !interaction.deferred && interaction.isRepliable()) {
                await interaction.reply({ content: 'その操作にはまだ対応していません。', ephemeral: true });
            }
        }
        catch (error) {
            console.error('❌ interactionCreate handler error:', error);
            try {
                if (interaction.isRepliable()) {
                    if (interaction.deferred || interaction.replied) {
                        await interaction.followUp({ content: 'エラーが発生しました。', flags: 1 << 6 });
                    }
                    else {
                        await interaction.reply({ content: 'エラーが発生しました。', flags: 1 << 6 });
                    }
                }
            }
            catch (notifyErr) {
                console.error('❌ Failed to send error notification:', notifyErr);
            }
        }
    }
}
