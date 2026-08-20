# Comzer-Administration-System (リファクタリング版)

レイヤー構成: `domain / application / infrastructure / presentation` + DI

## 実行方法

```bash
npm install
npx tsc
node dist/index.js
```

`npm run build` は `postbuild` で `npm run deploy`(Discordへのコマンド登録)を自動実行するため、
ビルドのみ行いたい場合は `npx tsc` を直接使用してください。

## ディレクトリ構成

```
src/
├── index.ts
├── domain/
│   ├── model/
│   └── service/
├── application/
│   ├── inspection/
│   ├── session/
│   ├── blacklist/
│   ├── rolepost/
│   ├── citizenSync/
│   ├── notification/
│   └── ops/
├── infrastructure/
│   ├── openai/
│   ├── minecraft/
│   ├── sheets/
│   ├── czrBridge/
│   ├── discord/
│   ├── koyeb/
│   ├── logger/
│   └── config/
├── presentation/
│   ├── discord/
│   │   ├── commands/
│   │   ├── events/
│   │   └── interactions/
│   └── http/
└── scripts/
```
