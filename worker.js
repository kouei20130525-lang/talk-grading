// TALK INSIGHT Cloudflare Worker
// Secrets: GEMINI_API_KEY, ADMIN_PASSWORD, ADMIN_TOKEN_SECRET
// KV binding: TALK_INSIGHT_KV
// Optional variable: GEMINI_MODEL (default: gemini-2.5-flash)
// Never place API keys in index.html or commit them to GitHub.

const SITE_ORIGIN = "https://udaihuai.github.io";
const cors = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
const headers = { ...cors, "Content-Type": "application/json; charset=utf-8" };

const schemaDescription = `Return only valid JSON with this exact structure:
{
 "total_score": integer 0-100,
 "grade": string,
 "summary": string,
 "scores": {
   "naturalness": integer 0-100,
   "balance": integer 0-100,
   "interaction": integer 0-100,
   "listening": integer 0-100,
   "development": integer 0-100
 },
 "good_points": [string],
 "improvements": [string],
 "speaker1_comment": string,
 "speaker2_comment": string
}`;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers });
    const url = new URL(request.url);
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });

    const readSettings = async () => {
      if (!env.TALK_INSIGHT_KV) throw new Error("TALK_INSIGHT_KV binding is not configured");
      return await env.TALK_INSIGHT_KV.get("global-settings", "json") || null;
    };
    // Use standard Base64 (with padding) consistently for token payloads and signatures.
    const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
    const decodeB64 = value => {
      const s = String(value || "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 !== 0)
        throw new Error("Base64形式が不正です");
      return Uint8Array.from(atob(s), c => c.charCodeAt(0));
    };
    const makeToken = async () => {
      if (!env.ADMIN_TOKEN_SECRET) throw new Error("ADMIN_TOKEN_SECRET is not configured");
      const payload = b64(new TextEncoder().encode(JSON.stringify({
        sub: "admin", exp: Date.now() + 8 * 60 * 60 * 1000
      })));
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.ADMIN_TOKEN_SECRET),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      return payload + "." + b64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
    };
    const validToken = async token => {
      try {
        const parts = String(token || "").split(".");
        if (parts.length !== 2 || !parts[0] || !parts[1]) return "トークン形式が不正です";
        if (!env.ADMIN_TOKEN_SECRET) return "ADMIN_TOKEN_SECRETが未設定です";
        const data = JSON.parse(new TextDecoder().decode(decodeB64(parts[0])));
        if (data.sub !== "admin") return "トークンの利用者情報が不正です";
        if (!(data.exp > Date.now())) return "トークンの有効期限が切れています";
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.ADMIN_TOKEN_SECRET),
          { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
        const verified = await crypto.subtle.verify("HMAC", key, decodeB64(parts[1]), new TextEncoder().encode(parts[0]));
        return verified ? true : "署名が一致しません（ログイン時と現在のADMIN_TOKEN_SECRETが異なる可能性があります）";
      } catch (e) { return "トークン検証エラー: " + (e.message || "不明なエラー"); }
    };

    if (url.pathname.endsWith("/settings") && request.method === "GET") {
      try { return json({ ok: true, settings: await readSettings() }); }
      catch (e) { return json({ ok: false, error: e.message }, 503); }
    }


    if (url.pathname.endsWith("/health") && request.method === "GET") {
      return json({
        ok: true,
        service: "talk-insight-api",
        timestamp: new Date().toISOString(),
        kvConfigured: !!env.TALK_INSIGHT_KV,
        geminiConfigured: !!env.GEMINI_API_KEY,
        adminConfigured: !!(env.ADMIN_PASSWORD && env.ADMIN_TOKEN_SECRET),
        model: env.GEMINI_MODEL || "gemini-2.5-flash"
      });
    }

    if (url.pathname.endsWith("/usage") && request.method === "GET") {
      try {
        if (!env.TALK_INSIGHT_KV) return json({ ok: true, used: 0, limit: 1000 });
        const key = "usage:" + new Date().toISOString().slice(0, 7);
        const used = Number(await env.TALK_INSIGHT_KV.get(key) || 0);
        return json({ ok: true, used, limit: Number(env.MONTHLY_AI_LIMIT || 1000) });
      } catch (e) { return json({ ok: false, error: e.message }, 503); }
    }

    if (url.pathname.endsWith("/admin/login") && request.method === "POST") {
      try {
        const body = await request.json();
        if (!env.ADMIN_PASSWORD || !env.ADMIN_TOKEN_SECRET)
          return json({ ok: false, error: "管理者認証Secretが未設定です" }, 503);
        if (typeof body.password !== "string" || body.password !== env.ADMIN_PASSWORD)
          return json({ ok: false, error: "パスワードが違います" }, 401);
        return json({ ok: true, token: await makeToken(), expiresIn: 28800 });
      } catch (e) { return json({ ok: false, error: e.message }, 500); }
    }

    if (url.pathname.endsWith("/admin/settings") && request.method === "POST") {
      try {
        const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
        const tokenCheck = await validToken(token);
        if (tokenCheck !== true) return json({ ok: false, error: tokenCheck }, 401);
        if (!env.TALK_INSIGHT_KV) return json({ ok: false, error: "TALK_INSIGHT_KV binding is not configured" }, 503);
        const body = await request.json();
        if (!body.settings || typeof body.settings !== "object" ||
            JSON.stringify(body.settings).length > 50000)
          return json({ ok: false, error: "設定データが不正です" }, 400);
        const current = await readSettings();
        const record = {
          version: Number(current?.version || 0) + 1,
          updatedAt: new Date().toISOString(),
          settings: body.settings
        };
        await env.TALK_INSIGHT_KV.put("global-settings", JSON.stringify(record));
        return json({ ok: true, version: record.version, updatedAt: record.updatedAt });
      } catch (e) { return json({ ok: false, error: e.message }, 500); }
    }

    if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    if (!env.GEMINI_API_KEY) return json({ ok: false, error: "GEMINI_API_KEY secret is not configured" }, 503);
    if (!env.TALK_INSIGHT_KV) return json({ ok: false, error: "TALK_INSIGHT_KV binding is not configured" }, 503);

    try {
      const body = await request.json();
      if (!Array.isArray(body.turns) || body.turns.length === 0)
        return json({ ok: false, error: "会話データがありません" }, 400);

      const settingsRecord = await readSettings();
      const settings = settingsRecord?.settings || {};
      if (settings.aiEnabled === false || settings.features?.["AI採点"] === false)
        return json({ ok: false, disabled: true, error: "AI採点は管理者によって停止されています" }, 503);

      const month = new Date().toISOString().slice(0, 7);
      const usageKey = "usage:" + month;
      const used = Number(await env.TALK_INSIGHT_KV.get(usageKey) || 0);
      const limit = Math.max(1, Math.min(1000, Number(env.MONTHLY_AI_LIMIT || settings.monthlyAiLimit || 1000)));
      if (used >= limit)
        return json({ ok: false, quotaExceeded: true, error: "今月のAI採点上限に達しました。通常採点に切り替えてください。" }, 429);

      const transcript = body.turns.map((t, i) => {
        const who = t.speaker === 2 ? (body.speaker2 || "話者2") : (body.speaker1 || "話者1");
        return (i + 1) + ". " + who + "：" + String(t.text || "").slice(0, 500);
      }).join("\n").slice(0, 16000);
      const instructions = "あなたは会話コミュニケーションの専門コーチです。中学生にも分かる日本語で公平に評価してください。" +
        "総合点と5指標は0〜100。発言量の完全な同量を要求せず、自然な応答、質問、相手への反応、話題展開を評価してください。" +
        "会話の長さや文字起こしの誤りに配慮し、根拠のない断定を避けてください。" +
        "会話テーマ：" + String(body.theme || "フリートーク") +
        "。時間：" + Number(body.duration || 0) + "秒。" +
        "話者別コメントも具体的に。\\n" + schemaDescription;
      const model = env.GEMINI_MODEL || "gemini-2.5-flash";
      const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions }] },
          contents: [{ role: "user", parts: [{ text: "会話ログ：\\n" + transcript }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: 1400 }
        })
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data.error?.message || "Gemini API error";
        return json({ ok: false, error: message, quotaExceeded: response.status === 429 }, response.status === 429 ? 429 : 502);
      }
      const output = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("");
      if (!output) throw new Error("AI response text not found");
      const result = JSON.parse(output);
      const clamp = n => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
      result.total_score = clamp(result.total_score);
      for (const key of ["naturalness", "balance", "interaction", "listening", "development"])
        result.scores[key] = clamp(result.scores?.[key]);
      for (const key of ["good_points", "improvements"])
        if (!Array.isArray(result[key])) result[key] = [];
      for (const key of ["grade", "summary", "speaker1_comment", "speaker2_comment"])
        if (typeof result[key] !== "string") result[key] = "";
      // KV counters are approximate under simultaneous requests; keep the monthly cap conservative.
      await env.TALK_INSIGHT_KV.put(usageKey, String(used + 1), { expirationTtl: 60 * 60 * 24 * 40 });
      return json({ ok: true, result, usage: { used: used + 1, limit } });
    } catch (e) {
      return json({ ok: false, error: e.message || "Request failed" }, 500);
    }
  }
};
