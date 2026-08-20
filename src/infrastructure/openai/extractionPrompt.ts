export const extractionPrompt: string = `
以下の日本語テキストから、下記の情報をJSONで返してください。
* 申請者のMCID（mcid）
* 国籍（nation）
* 入国目的（purpose）
* 入国予定日時（start_datetime：YYYY-MM-DD HH:mm）
* 帰国予定日時（end_datetime：YYYY-MM-DD HH:mm）
* 同行者（companions：配列、各要素は {mcid, version, nation} のJSON）
* 合流者（joiners：配列、あれば）

【例1：24時間以内の申請】
あなたに渡されるテキストデータ例: 
「テスト=デス王国国籍でMCIDはtaro_des。観光目的で、6月26日午後3時から7時間滞在します。同行者はなし。合流者はkouji_JPです。」
期待するJSON: 
{
  "mcid": "taro_des",
  "nation": "テスト=デス王国",
  "purpose": "観光",
  "start_datetime": "2025-06-26 15:00",
  "end_datetime": "2025-06-26 22:00",
  "companions": [],
  "joiners": ["kouji_JP"]
}

【例2：24時間以上の申請】
あなたに渡されるテキストデータ例: 
「MCID: suzuki_rin。国籍は日本。出稼ぎの関係で6月30日夜9時から7月2日まで滞在します。同行者はtanaka_keiとBE_testResearcherで、合流者はなし。」
期待するJSON:
{
  "mcid": "suzuki_rin",
  "nation": "日本",
  "purpose": "出稼ぎ",
  "start_datetime": "2025-06-30 21:00",
  "end_datetime": "2025-07-02 23:59",
  "companions": [
    {"mcid": "tanaka_kei"},
    {"mcid": "BE_testResearcher"}
  ],
  "joiners": []
}

※24時間を超える場合、終了日時は特に明記されていなければ、終了日は23:59で補完してください。
※同行者・合流者がいない場合は空配列としてください。
※日付や時間が曖昧な場合もできるだけ合理的に補完してください。
※本日の日付は__TODAY__です。入国予定日時や帰国予定時刻で「今日」「本日」などの語句が使用された際はこの情報を使用してください。
※同行者に関する補足。companions：配列、各要素は{"mcid": "○○"}のJSONのみ。versionやnationは仮にどこかに記載されていても抽出不要。


テキスト:
`;
