// Cloudflare Worker: keep OPENAI_API_KEY in Worker Secrets. Never put it in index.html.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
const headers = { ...cors, "Content-Type": "application/json; charset=utf-8" };
const schema = {
  type: "object", additionalProperties: false,
  properties: {
    total_score: { type: "integer" }, grade: { type: "string" }, summary: { type: "string" },
    scores: { type: "object", additionalProperties: false, properties: {
      naturalness: { type: "integer" }, balance: { type: "integer" }, interaction: { type: "integer" },
      listening: { type: "integer" }, development: { type: "integer" }
    }, required: ["naturalness","balance","interaction","listening","development"] },
    good_points: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    speaker1_comment: { type: "string" }, speaker2_comment: { type: "string" }
  },
  required: ["total_score","grade","summary","scores","good_points","improvements","speaker1_comment","speaker2_comment"]
};
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") return new Response(JSON.stringify({ok:false,error:"POST only"}), {status:405,headers});
    if (!env.OPENAI_API_KEY) return new Response(JSON.stringify({ok:false,error:"OPENAI_API_KEY secret is not configured"}), {status:500,headers});
    try {
      const body = await request.json();
      if (!Array.isArray(body.turns) || body.turns.length < 2 || body.turns.length > 120) {
        return new Response(JSON.stringify({ok:false,error:"会話ターンは2〜120件で送信してください"}), {status:400,headers});
      }
      const transcript = body.turns.map((t,i) => {
        const who = t.speaker === 2 ? (body.speaker2 || "話者2") : (body.speaker1 || "話者1");
        return (i+1)+". "+who+"："+String(t.text || "").slice(0,500);
      }).join("\n").slice(0,16000);
      const instructions = "あなたは会話コミュニケーションの専門コーチです。次の2人の会話を中学生にも分かる日本語で公平に評価してください。総合点は0〜100。各指標も0〜100。会話の長さや文字起こしの誤りに配慮し、根拠のない断定をしない。発言量の完全な同量を要求せず、自然な応答、質問、相手への反応、話題展開、協力性を評価。会話のテーマ："+String(body.theme||"フリートーク")+". 時間："+Number(body.duration||0)+"秒。話者別コメントも具体的に。";
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Authorization": "Bearer "+env.OPENAI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          instructions,
          input: "会話ログ：\n"+transcript,
          text: { format: { type: "json_schema", name: "conversation_report", strict: true, schema } },
          max_output_tokens: 1200
        })
      });
      const data = await response.json();
      if (!response.ok) return new Response(JSON.stringify({ok:false,error:data.error?.message || "OpenAI API error"}), {status:502,headers});
      const output = (data.output || []).flatMap(x => x.content || []).find(x => x.type === "output_text")?.text;
      if (!output) throw new Error("AI response text not found");
      return new Response(JSON.stringify({ok:true,result:JSON.parse(output)}), {headers});
    } catch (e) {
      return new Response(JSON.stringify({ok:false,error:e.message || "Request failed"}), {status:500,headers});
    }
  }
};