// services/inspectionService.js
import OpenAI from 'openai';
import axios from 'axios';
import { extractionPrompt } from '../prompts.js';
import { isBlacklistedCountry, isBlacklistedPlayer } from '../utils/blacklistManager.js';
import { nowJST } from '../utils/helpers.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const API_URL = 'https://comzer-gov.net/wp-json/czr/v1/data-access';
const API_TOKEN = process.env.YOUR_SECRET_API_KEY;

export async function runInspection(content, session) {
  let parsed;

  // GPTで内容を整形
  try {
    const today = new Date().toISOString().slice(0, 10);
    const prompt = extractionPrompt.replace("__TODAY__", today);

    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: content }
      ],
    });

    parsed = JSON.parse(gptRes.choices[0].message.content);

    if (parsed.companions && Array.isArray(parsed.companions)) {
      parsed.companions = parsed.companions.map(c =>
        typeof c === "string" ? { mcid: c } : c
      );
    }

    session.logs.push(`[${nowJST()}] 整形結果: ${JSON.stringify(parsed, null, 2)}`);
  } catch (e) {
    session.logs.push(`[${nowJST()}] 整形エラー: ${e}`);
    return {
      approved: false,
      content: "申請内容の解析に失敗しました。もう一度ご入力ください。"
    };
  }

  // 国籍ブラックリストチェック
  if (await isBlacklistedCountry(parsed.nation)) {
    session.logs.push(`[${nowJST()}] ＜Blacklist(国)該当＞ ${parsed.nation}`);
    return {
      approved: false,
      content: "申請された国籍は安全保障上の理由から入国を許可することができないため、却下します。"
    };
  }

  // 申請者MCIDブラックリストチェック
  if (await isBlacklistedPlayer(parsed.mcid)) {
    session.logs.push(`[${nowJST()}] ＜Blacklist(プレイヤー)該当＞ ${parsed.mcid}`);
    return {
      approved: false,
      content: "申請されたMCIDは安全保障上の理由から入国を許可することができないため、却下します。"
    };
  }

  // MCIDの存在確認
  let exists = false;
  try {
    const version = session?.data?.version || "java";
    const mcid = parsed.mcid.replace(/^BE_/, "");

    const url = version === "java"
      ? `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(mcid)}`
      : `https://playerdb.co/api/player/xbox/${encodeURIComponent(mcid)}`;

    const resp = await axios.get(url, { validateStatus: () => true });
    exists = version === "java" ? resp.status === 200 : resp.data.success === true;
  } catch (err) {
    console.error('[InspectionService] MCID check error:', err);
  }

  if (!exists) {
    return {
      approved: false,
      content: `申請者MCID「${parsed.mcid}」のアカウントチェックが出来ませんでした。綴りにお間違いはございませんか?`
    };
  }

  // 同行者チェック
  if (parsed.companions && Array.isArray(parsed.companions)) {
    for (const { mcid: companionId } of parsed.companions) {
      if (!companionId) continue;

      if (await isBlacklistedPlayer(companionId)) {
        return {
          approved: false,
          content: `同行者「${companionId}」は安全保障上の理由から入国を許可することができないため。`
        };
      }

      let version = session?.data?.version || "java";
      if (companionId.startsWith("BE_")) version = "bedrock";
      const apiId = companionId.replace(/^BE_/, "");

      let exists = false;
      try {
        const url = version === "java"
          ? `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(apiId)}`
          : `https://playerdb.co/api/player/xbox/${encodeURIComponent(apiId)}`;

        const resp = await axios.get(url, { validateStatus: () => true });
        exists = version === "java" ? resp.status === 200 : resp.data.success === true;
      } catch (err) {
        console.error('[InspectionService] Companion check error:', err);
      }

      if (!exists) {
        return {
          approved: false,
          content: `同行者MCID「${companionId}」のアカウントチェックが出来ませんでした。綴りにお間違いはございませんか?`
        };
      }
    }
  }

  // 合流者チェック
  if (parsed.joiners && parsed.joiners.length > 0) {
    const joinerList = parsed.joiners;
    console.log("[JoinerCheck] joinerList:", joinerList);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "match_joiners_strict",
          joiners: joinerList
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("[JoinerCheck][Error] APIエラー", data);
        return {
          approved: false,
          content: data.message || `サーバーエラー(${res.status})が発生しました。`
        };
      }

      parsed.joinerDiscordIds = joinerList
        .map(j => {
          const raw = j.trim();
          const key = raw.normalize("NFKC");
          const id = data.discord_ids?.[key];
          if (!id) {
            console.warn(`[JoinerCheck][Warn] raw "${raw}" が discord_ids のキーになっていません`);
          }
          return id;
        })
        .filter(Boolean);

      console.log("[JoinerCheck] parsed.joinerDiscordIds:", parsed.joinerDiscordIds);
    } catch (e) {
      console.error("[JoinerCheck][Error] ネットワークエラー:", e.message);
      return {
        approved: false,
        content: "合流者チェックの通信に失敗しました。ネットワークをご確認ください。"
      };
    }
  }

  // 期間チェック
  const start = new Date(parsed.start_datetime);
  const end = new Date(parsed.end_datetime);
  const periodHours = (end - start) / (1000 * 60 * 60);

  if (periodHours > 24 * 31) {
    return {
      approved: false,
      content: "申請期間が長すぎるため却下します（申請期間が31日を超える場合、31日で申請後、申請が切れる前に再審査をお願いいたします。）"
    };
  }

  // 必須項目チェック
  if (!parsed.mcid || !parsed.nation || !parsed.purpose || !parsed.start_datetime || !parsed.end_datetime) {
    return {
      approved: false,
      content: "申請情報に不足があります。全項目を入力してください。"
    };
  }

  return { approved: true, content: parsed };
}
