import { EmbedBuilder } from 'discord.js';
import type { Interaction } from 'discord.js';
import { nowJST } from '../../../infrastructure/logger/nowJST.js';
import type { ParsedApplication } from '../../../domain/model/ParsedApplication.js';
import type { DebugModeState } from '../../../application/ops/DebugModeState.js';
interface PublishChannelConfig {
    publishChannelId?: string;
    configLogChannelId?: string;
    debugChannelId?: string;
    envLogChannelId: string;
}
function companionStr(parsed: ParsedApplication): string {
    return Array.isArray(parsed.companions) && parsed.companions.length > 0
        ? parsed.companions
            .map((c) => (typeof c === 'string' ? c : c.mcid))
            .filter(Boolean)
            .join(', ')
        : 'なし';
}
function joinerStr(parsed: ParsedApplication): string {
    return Array.isArray(parsed.joiners) && parsed.joiners.length > 0 ? parsed.joiners.join(', ') : 'なし';
}
function safeReplace(s: unknown): string | undefined {
    const today = new Date().toISOString().slice(0, 10);
    return typeof s === 'string' ? s.replace(/__TODAY__/g, today) : (s as string | undefined);
}
export function createApprovalEmbed(parsed: ParsedApplication): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle('一時入国審査結果')
        .setColor(0x3498db)
        .setDescription('自動入国審査システムです。上記の通り申請されました"__**一時入国審査**__"について、' +
        '審査が完了いたしましたので、以下の通り通知いたします。\n\n> 審査結果：**承認**')
        .addFields({ name: '申請者', value: parsed.mcid ?? '不明', inline: true }, { name: '国籍', value: parsed.nation ?? '不明', inline: true }, { name: '申請日', value: nowJST(), inline: true }, { name: '入国目的', value: safeReplace(parsed.purpose) ?? '不明', inline: true }, {
        name: '入国期間',
        value: safeReplace(`${parsed.start_datetime} ～ ${parsed.end_datetime}`) ?? '不明',
        inline: false,
    }, { name: '同行者', value: companionStr(parsed), inline: false }, { name: '合流者', value: joinerStr(parsed), inline: false }, {
        name: '【留意事項】',
        value: '・在留期間の延長が予定される場合、速やかにこのチャンネルでお知らせください。' +
            '但し、合計在留期間が31日を超える場合、新規に申請が必要です。\n' +
            '・入国が承認されている期間中、申請内容に誤りがあることが判明したり、異なる行為をした場合、' +
            '又は、コムザール連邦共和国の法令に違反したり、行政省庁の指示に従わなかった場合は、**承認が取り消される**場合があります。\n' +
            '・入国中、あなたは[コムザール連邦共和国の明示する法令](https://comzer-gov.net/laws/) を理解したものと解釈され、' +
            'これの不知を理由に抗弁することはできません。\n' +
            '・あなたがコムザール連邦共和国及び国民に対して損害を生じさせた場合、行政省庁は、' +
            'あなたが在籍する国家に対して、相当の対応を行う可能性があります。\n' +
            '・あなたの入国関連情報は、その期間中、公表が不適切と判断される情報を除外した上で、' +
            'コムザール連邦共和国国民に対して自動的に共有されます。\n\nコムザール連邦共和国へようこそ。',
        inline: false,
    });
}
export function createRejectionEmbed(parsed: ParsedApplication, reasonMsg: string): EmbedBuilder {
    const details = Object.keys(parsed).length
        ? [
            `申請者: ${parsed.mcid || '不明'}`,
            `国籍: ${parsed.nation || '不明'}`,
            `申請日: ${nowJST()}`,
            `入国目的: ${parsed.purpose || '不明'}`,
            `入国期間: ${parsed.start_datetime && parsed.end_datetime
                ? `${parsed.start_datetime} ～ ${parsed.end_datetime}`
                : '不明'}`,
            `同行者: ${companionStr(parsed)}`,
            `合流者: ${joinerStr(parsed)}`,
        ].join('\n')
        : '（申請内容の取得に失敗）';
    return new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle('一時入国審査【却下】')
        .setDescription(`**申請が却下されました**\n\n【却下理由】\n${reasonMsg}\n\n【申請内容】\n${details}`)
        .setFooter({ text: '再申請の際は内容をよくご確認ください。' });
}
export async function publishApproval(parsed: ParsedApplication, client: Interaction['client'], config: PublishChannelConfig, debugMode: DebugModeState): Promise<void> {
    const publishEmbed = new EmbedBuilder()
        .setTitle('【一時入国審査に係る入国者の公示】')
        .setColor(0x27ae60)
        .setDescription('以下の外国籍プレイヤーの入国が承認された為、以下の通り公示いたします。(外務省入管部)')
        .addFields({ name: '申請者', value: parsed.mcid ?? '不明', inline: true }, { name: '国籍', value: parsed.nation ?? '不明', inline: true }, { name: '申請日', value: nowJST(), inline: true }, { name: '入国目的', value: safeReplace(parsed.purpose) ?? '不明', inline: true }, {
        name: '入国期間',
        value: safeReplace(`${parsed.start_datetime} ～ ${parsed.end_datetime}`) ?? '不明',
        inline: false,
    }, { name: '同行者', value: companionStr(parsed), inline: false }, { name: '合流者', value: joinerStr(parsed), inline: false });
    const publishChannelId: string = (debugMode.isEnabled()
        ? config.debugChannelId || config.envLogChannelId
        : config.publishChannelId || config.configLogChannelId || config.envLogChannelId) as string;
    const publishChannel = client.channels.cache.get(publishChannelId);
    if (publishChannel?.isTextBased() && 'send' in publishChannel) {
        await publishChannel.send({ embeds: [publishEmbed] });
    }
    else {
        console.error('公示用チャンネルが見つかりません。ID:', publishChannelId);
    }
}
