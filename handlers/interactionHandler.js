import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import * as embedPost from '../commands/embedPost.js';
import * as debugCommand from '../commands/debug.js';
import { handleCommands } from '../commands/blacklist/index.js';
import { startSession, endSession, getSession, updateSessionLastAction } from '../services/sessionManager.js';
import { runInspection } from '../services/inspectionService.js';
import { nowJST } from '../utils/helpers.js';
import config from '../config/config.json' assert { type: 'json' };

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

export async function handleInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isChatInputCommand() && !interaction.isModalSubmit()) {
    return;
  }

  // 合流者応答ボタン
  if (interaction.isButton() && interaction.customId.startsWith('joinerResponse-')) {
    await handleJoinerResponse(interaction);
    return;
  }

  // rolepost選択メニュー → embedPost に委譲
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('rolepost-choose-')) {
    await embedPost.handleRolepostSelect(interaction);
    return;
  }

  // ゲームエディション選択メニュー
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('version-select-')) {
    await handleVersionSelect(interaction);
    return;
  }

  // スラッシュコマンド
  if (interaction.isChatInputCommand()) {
    const cmd = interaction.client.commands.get(interaction.commandName);
    if (cmd) {
      await cmd.execute(interaction);
      return;
    }
  }

  // blacklistコマンド処理
  const handled = await handleCommands(interaction);
  if (handled) return;

  try {
    // ボタン処理
    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
      return;
    }

    // Modal送信処理
    if (interaction.isModalSubmit() && interaction.customId.startsWith('immigration-modal-')) {
      await handleModalSubmit(interaction);
      return;
    }

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "その操作にはまだ対応していません。",
        ephemeral: true,
      });
    }
  } catch (error) {
    console.error("❌ interactionCreate handler error:", error);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "エラーが発生しました。",
          flags: 1 << 6,
        });
      } else {
        await interaction.reply({
          content: "エラーが発生しました。",
          flags: 1 << 6,
        });
      }
    } catch (notifyErr) {
      console.error("❌ Failed to send error notification:", notifyErr);
    }
  }
}

async function handleJoinerResponse(interaction) {
  const parts = interaction.customId.split('-');
  const answer = parts[1];
  const sessionId = parts.slice(2).join('-');
  const session = getSession(sessionId);

  if (!session) {
    return interaction.reply({ content: 'セッションが存在しないか期限切れです。', ephemeral: true });
  }

  session.logs.push(`[${nowJST()}] 合流者回答: ${interaction.user.id} → ${answer}`);
  session.data.joinerResponses = session.data.joinerResponses || {};
  session.data.joinerResponses[interaction.user.id] = answer;

  await interaction.reply({ content: '回答ありがとうございました。', ephemeral: true });

  const expectCount = (session.data.joinerDiscordIds || []).length;
  const gotCount = Object.keys(session.data.joinerResponses).length;

  if (gotCount === expectCount) {
    const anyNo = Object.values(session.data.joinerResponses).includes('no');
    const targetChannel = await interaction.client.channels.fetch(session.channelId);

    if (!targetChannel?.isTextBased()) {
      return endSession(session.id, anyNo ? '却下' : '承認', interaction.client);
    }

    const applicantMention = session.data.applicantDiscordId ? `<@${session.data.applicantDiscordId}> ` : '';

    if (anyNo) {
      const parsed = session.data.parsed;
      const embed = createRejectionEmbed(parsed, "合流者が申請を承認しませんでした。合流者は正しいですか?");
      await targetChannel.send({ content: applicantMention, embeds: [embed] });
      return endSession(session.id, '却下', interaction.client);
    } else {
      const parsed = session.data.parsed;
      const embed = createApprovalEmbed(parsed);
      await targetChannel.send({ content: applicantMention, embeds: [embed] });

      // 公示チャンネルへ送信
      await publishApproval(parsed, interaction.client);

      return endSession(session.id, '承認', interaction.client);
    }
  }
}

async function handleVersionSelect(interaction) {
  const sessionId = interaction.customId.replace('version-select-', '');
  const session = getSession(sessionId);

  if (!session) {
    return interaction.reply({ content: 'セッションが存在しないか期限切れです。', ephemeral: true });
  }

  updateSessionLastAction(sessionId);
  const selectedVersion = interaction.values[0];
  session.data.version = selectedVersion;
  session.logs.push(`[${nowJST()}] ゲームエディション選択: ${selectedVersion}`);

  // Modal作成
  const modal = new ModalBuilder()
    .setCustomId(`immigration-modal-${session.id}`)
    .setTitle('一時入国審査申請フォーム');

  const mcidInput = new TextInputBuilder()
    .setCustomId('mcid')
    .setLabel('MCID / ゲームタグ')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('BE_を付ける必要はありません')
    .setRequired(true)
    .setMaxLength(50);

  const nationInput = new TextInputBuilder()
    .setCustomId('nation')
    .setLabel('国籍')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('例: 日本')
    .setRequired(true)
    .setMaxLength(100);

  const periodInput = new TextInputBuilder()
    .setCustomId('period')
    .setLabel('入国期間と目的')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('例: 観光で10日間')
    .setRequired(true)
    .setMaxLength(200);

  const companionsInput = new TextInputBuilder()
    .setCustomId('companions')
    .setLabel('同行者(いなければ空欄)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('例: user1,BE_user2')
    .setRequired(false)
    .setMaxLength(300);

  const joinersInput = new TextInputBuilder()
    .setCustomId('joiners')
    .setLabel('合流者(いなければ空欄)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('例: citizen123, 12345678901234, BE_citizen234 ')
    .setRequired(false)
    .setMaxLength(300);

  const rows = [
    new ActionRowBuilder().addComponents(mcidInput),
    new ActionRowBuilder().addComponents(nationInput),
    new ActionRowBuilder().addComponents(periodInput),
    new ActionRowBuilder().addComponents(companionsInput),
    new ActionRowBuilder().addComponents(joinersInput),
  ];

  modal.addComponents(...rows);

  await interaction.showModal(modal);
  session.step = 'modal_submitted';
}

async function handleButtonInteraction(interaction) {
  const parts = interaction.customId.split('-');
  const type = parts[0];
  const sessionId = parts.slice(1).join('-');
  const session = getSession(sessionId);

  if (!session) {
    await interaction.reply({
      content: "このセッションは存在しないか期限切れです。最初からやり直してください。",
      ephemeral: true
    });
    return;
  }

  updateSessionLastAction(sessionId);

  if (type === 'start') {
    session.logs.push(`[${nowJST()}] 概要同意: start`);
    session.step = 'select_version';

    const row = new ActionRowBuilder().addComponents(
      new SelectMenuBuilder()
        .setCustomId(`version-select-${session.id}`)
        .setPlaceholder('ゲームエディションを選択してください')
        .addOptions([
          { label: 'Java Edition', value: 'java', description: 'Java版Minecraft' },
          { label: 'Bedrock Edition', value: 'bedrock', description: '統合版Minecraft' },
        ])
    );

    await interaction.update({
      content: 'ゲームエディションを選択してください。',
      components: [row]
    });
    return;
  }

  if (type === 'cancel') {
    session.logs.push(`[${nowJST()}] ユーザーが途中キャンセル`);
    await interaction.update({ content: '申請をキャンセルしました。', components: [] });
    return endSession(session.id, 'キャンセル', interaction.client);
  }
}

async function handleModalSubmit(interaction) {
  const sessionId = interaction.customId.replace('immigration-modal-', '');
  const session = getSession(sessionId);

  if (!session) {
    return interaction.reply({ content: 'セッションが存在しないか期限切れです。', ephemeral: true });
  }

  updateSessionLastAction(sessionId);

  const version = session.data.version;

  let mcid, nation, period, companionsInput, joinersInput;
  try {
    mcid = interaction.fields.getTextInputValue('mcid').trim();
    nation = interaction.fields.getTextInputValue('nation').trim();
    period = interaction.fields.getTextInputValue('period').trim();
    companionsInput = interaction.fields.getTextInputValue('companions').trim();
    joinersInput = interaction.fields.getTextInputValue('joiners').trim();
  } catch (err) {
    console.error('[Modal] フィールド取得エラー:', err);
    return interaction.reply({ content: '入力内容の取得に失敗しました。もう一度お試しください。', ephemeral: true });
  }

  let companions = [];
  let joiner = null;

  if (companionsInput && companionsInput !== 'なし') {
    companions = companionsInput.split(',').map(x => x.trim()).filter(Boolean);
  }

  if (joinersInput && joinersInput !== 'なし') {
    joiner = joinersInput;
  }

  session.data = { version, mcid, nation, period, companions, joiner };
  session.logs.push(`[${nowJST()}] Modal送信完了`);
  session.logs.push(`[${nowJST()}] version: ${version}, MCID: ${mcid}, 国籍: ${nation}`);
  session.logs.push(`[${nowJST()}] 期間: ${period}, 同行者: ${companions.join(',') || 'なし'}, 合流者: ${joiner || 'なし'}`);

  await interaction.deferReply();
  session.logs.push(`[${nowJST()}] Modal送信後、審査開始`);

  const inputText = [
    `MCID: ${mcid}`,
    `国籍: ${nation}`,
    `目的・期間: ${period}`,
    companions.length > 0 ? `同行者: ${companions.join(', ')}` : '',
    joiner ? `合流者: ${joiner}` : ''
  ].filter(Boolean).join('\n');

  let progressMsg = "申請内容を確認中…";
  await interaction.editReply({ content: progressMsg });

  let isTimeout = false;
  const timeoutPromise = new Promise(resolve => {
    setTimeout(() => {
      isTimeout = true;
      resolve({ approved: false, content: "システムが混雑しています。60秒以上応答がなかったため、タイムアウトとして処理を中断しました。" });
    }, 60000);
  });

  const inspectionPromise = (async () => {
    progressMsg = "申請内容のAI解析中…";
    await interaction.editReply({ content: progressMsg });
    try {
      return await runInspection(inputText, session);
    } catch (err) {
      console.error('[ERROR] runInspection:', err);
      return { approved: false, content: '審査中にエラーが発生しました。' };
    }
  })();

  let result = await Promise.race([timeoutPromise, inspectionPromise]);

  if (isTimeout) {
    await interaction.editReply({ content: "⏳ 60秒間応答がなかったため、処理をタイムアウトで中断しました。再度申請してください。" });
    session.logs.push(`[${nowJST()}] タイムアウトエラー`);
    return endSession(session.id, "タイムアウト", interaction.client);
  }

  const joinData = typeof result.content === "object" ? result.content : {};

  // 合流者確認が必要な場合
  if (result.approved && Array.isArray(joinData.joiners) && joinData.joinerDiscordIds?.length > 0) {
    session.data.applicantDiscordId = interaction.user.id;
    session.data.parsed = joinData;

    for (const discordId of joinData.joinerDiscordIds) {
      try {
        const user = await interaction.client.users.fetch(discordId);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`joinerResponse-yes-${session.id}`)
            .setLabel('はい')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`joinerResponse-no-${session.id}`)
            .setLabel('いいえ')
            .setStyle(ButtonStyle.Danger),
        );
        await user.send({
          content: `外務省入管局からの確認通知です。申請者 ${joinData.mcid} さんからあなたが国内で合流するユーザーである旨の申請がありました。この申請はお間違えございませんか?(心当たりがない場合は、「いいえ」をご選択ください。)`,
          components: [row]
        });
      } catch (e) {
        console.error(`[JoinerConfirm][Error] DM 送信失敗: ${discordId}`, e);
      }
    }

    session.data.joinerDiscordIds = joinData.joinerDiscordIds;
    await interaction.editReply({ content: '申請を受け付けました。しばらくお待ち下さい' });
    session.step = 'waitingJoiner';
    return;
  }

  // 承認・却下の処理
  let embedData = {};
  if (typeof result.content === "object") {
    embedData = result.content;
  } else {
    try {
      embedData = JSON.parse(result.content);
      const rawPeriod = embedData.period ?? embedData.期間;
      if (rawPeriod && (!embedData.start_datetime || !embedData.end_datetime)) {
        embedData.start_datetime = embedData.start_datetime || rawPeriod;
        embedData.end_datetime = embedData.end_datetime || rawPeriod;
      }
    } catch (e) {
      console.error("[ERROR] JSON parse failed:", e);
      embedData = {};
    }
  }

  if (result.approved && Object.keys(embedData).length) {
    const embed = createApprovalEmbed(embedData);
    await interaction.editReply({ embeds: [embed] });

    // 公示チャンネルへ送信
    await publishApproval(embedData, interaction.client);

    return endSession(session.id, "承認", interaction.client);
  } else {
    const reasonMsg = typeof result.content === "string" ? result.content : "申請内容に不備や却下条件があったため、審査が却下されました。";
    const embed = createRejectionEmbed(embedData, reasonMsg);
    await interaction.editReply({ embeds: [embed] });
    return endSession(session.id, "却下", interaction.client);
  }
}

function createApprovalEmbed(parsed) {
  const today = new Date().toISOString().slice(0, 10);
  const safeReplace = s => typeof s === "string" ? s.replace(/__TODAY__/g, today) : s;

  const companionStr = Array.isArray(parsed.companions) && parsed.companions.length > 0
    ? parsed.companions.map(c => typeof c === "string" ? c : c.mcid).filter(Boolean).join(", ")
    : "なし";

  const joinerStr = Array.isArray(parsed.joiners) && parsed.joiners.length > 0
    ? parsed.joiners.join(", ")
    : "なし";

  const fields = [
    { name: "申請者", value: parsed.mcid, inline: true },
    { name: "国籍", value: parsed.nation, inline: true },
    { name: "申請日", value: nowJST(), inline: true },
    { name: "入国目的", value: safeReplace(parsed.purpose), inline: true },
    { name: "入国期間", value: safeReplace(`${parsed.start_datetime} ～ ${parsed.end_datetime}`), inline: false },
    { name: "同行者", value: companionStr, inline: false },
    { name: "合流者", value: joinerStr, inline: false },
  ];

  return new EmbedBuilder()
    .setTitle("一時入国審査結果")
    .setColor(0x3498db)
    .addFields(fields)
    .setDescription(
      "自動入国審査システムです。上記の通り申請されました\"__**一時入国審査**__\"について、審査が完了いたしましたので、以下の通り通知いたします。\n\n" +
      `> 審査結果：**承認**`
    )
    .addFields({
      name: "【留意事項】", value:
        "・在留期間の延長が予定される場合、速やかににこのチャンネルでお知らせください。但し、合計在留期間が31日を超える場合、新規に申請が必要です。\n" +
        "・入国が承認されている期間中、申請内容に誤りがあることが判明したり、異なる行為をした場合、又は、コムザール連邦共和国の法令に違反したり、行政省庁の指示に従わなかった場合は、**承認が取り消される**場合があります。\n" +
        "・入国中、あなたは[コムザール連邦共和国の明示する法令](https://comzer-gov.net/laws/) を理解したものと解釈され、これの不知を理由に抗弁することはできません。\n" +
        "・あなたがコムザール連邦共和国及び国民に対して損害を生じさせた場合、行政省庁は、あなたが在籍する国家に対して、相当の対応を行う可能性があります。\n" +
        "・あなたの入国関連情報は、その期間中、公表が不適切と判断される情報を除外した上で、コムザール連邦共和国国民に対して自動的に共有されます。\n\n" +
        "コムザール連邦共和国へようこそ。"
    });
}

function createRejectionEmbed(parsed, reasonMsg) {
  const companionStr = Array.isArray(parsed.companions) && parsed.companions.length > 0
    ? parsed.companions.map(c => typeof c === "string" ? c : c.mcid).filter(Boolean).join(", ")
    : "なし";

  const joinerStr = Array.isArray(parsed.joiners) && parsed.joiners.length > 0
    ? parsed.joiners.join(", ")
    : "なし";

  const details = Object.keys(parsed).length
    ? [
      `申請者: ${parsed.mcid || "不明"}`,
      `国籍: ${parsed.nation || "不明"}`,
      `申請日: ${nowJST()}`,
      `入国目的: ${parsed.purpose || "不明"}`,
      `入国期間: ${(parsed.start_datetime && parsed.end_datetime) ? `${parsed.start_datetime} ～ ${parsed.end_datetime}` : "不明"}`,
      `同行者: ${companionStr}`,
      `合流者: ${joinerStr}`,
    ].join("\n")
    : "（申請内容の取得に失敗）";

  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("一時入国審査【却下】")
    .setDescription(`**申請が却下されました**\n\n【却下理由】\n${reasonMsg}\n\n【申請内容】\n${details}`)
    .setFooter({ text: "再申請の際は内容をよくご確認ください。" });
}

async function publishApproval(parsed, client) {
  const today = new Date().toISOString().slice(0, 10);
  const safeReplace = s => typeof s === "string" ? s.replace(/__TODAY__/g, today) : s;

  const companionStr = Array.isArray(parsed.companions) && parsed.companions.length > 0
    ? parsed.companions.map(c => typeof c === "string" ? c : c.mcid).filter(Boolean).join(", ")
    : "なし";

  const joinerStr = Array.isArray(parsed.joiners) && parsed.joiners.length > 0
    ? parsed.joiners.join(", ")
    : "なし";

  const publishFields = [
    { name: "申請者", value: parsed.mcid, inline: true },
    { name: "国籍", value: parsed.nation, inline: true },
    { name: "申請日", value: nowJST(), inline: true },
    { name: "入国目的", value: safeReplace(parsed.purpose), inline: true },
    { name: "入国期間", value: safeReplace(`${parsed.start_datetime} ～ ${parsed.end_datetime}`), inline: false },
    { name: "同行者", value: companionStr, inline: false },
    { name: "合流者", value: joinerStr, inline: false },
  ];

  const publishEmbed = new EmbedBuilder()
    .setTitle("【一時入国審査に係る入国者の公示】")
    .addFields(publishFields)
    .setColor(0x27ae60)
    .setDescription("以下の外国籍プレイヤーの入国が承認された為、以下の通り公示いたします。(外務省入管部)");

  const publishChannelId = debugCommand.isDebugMode
    ? (config.debugChannelId || LOG_CHANNEL_ID)
    : (config.publishChannelId || config.logChannelId || LOG_CHANNEL_ID);

  const publishChannel = client.channels.cache.get(publishChannelId);

  if (publishChannel?.isTextBased()) {
    await publishChannel.send({ embeds: [publishEmbed] });
  } else {
    console.error("公示用チャンネルが見つかりません。ID:", publishChannelId);
  }
}
