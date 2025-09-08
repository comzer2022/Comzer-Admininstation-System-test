const axios = require("axios");

const LOKI_URL = "https://logs-prod-030.grafana.net/loki/api/v1/push";
const LOKI_USER = "pdc-t65227762-default";
const LOKI_PASS = process.env.LOKI_PASS; // ← API Key を環境変数に入れる

async function sendLog(message, labels = {}) {
  const streams = [
    {
      stream: { job: "koyeb", service: "discordbot", env: "production", ...labels },
      values: [
        [String(Date.now() * 1e6), message] // ns 単位 timestamp
      ]
    }
  ];

  try {
    await axios.post(LOKI_URL, { streams }, {
      auth: { username: LOKI_USER, password: LOKI_PASS },
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("Loki push failed:", err.response?.data || err.message);
  }
}

module.exports = { sendLog };
