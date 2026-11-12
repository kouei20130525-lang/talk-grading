// Cloudflare Worker: keep OPENAI_API_KEY in Worker Secrets. Never put it in index.html.
const cors = {
  "Access-Control-Allow-Origin": "https://kouei20130525-lang.github.io",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
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
    const url = new URL(request.url);
    const json = (data, status=200) => new Response(JSON.stringify(data), {status,headers});
    const readSettings = async () => {
      if (!env.TALK_INSIGHT_KV) throw new Error("TALK_INSIGHT_KV binding is not configured");
      return await env.TALK_INSIGHT_KV.get("global-settings", "json") || null;
    };
    const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,"").replace(/\\+/g,"-").replace(/\\//g,"_");
    const makeToken = async () => {
      if (!env.ADMIN_TOKEN_SECRET) throw new Error("ADMIN_TOKEN_SECRET is not configured");
      const payload=b64(new TextEncoder().encode(JSON.stringify({sub:"admin",exp:Date.now()+8*60*60*1000})));
      const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.ADMIN_TOKEN_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
      return payload+"."+b64(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload)));
    };
    const validToken = async token => {
      try {
        const [payload,signature]=String(token||"").split(".");
        if(!payload||!signature||!env.ADMIN_TOKEN_SECRET)return false;
        const decode=x=>Uint8Array.from(atob(x.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((x.length+3)%4)),c=>c.charCodeAt(0));
        const data=JSON.parse(new TextDecoder().decode(decode(payload)));
        const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.ADMIN_TOKEN_SECRET),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
        return data.sub==="admin"&&data.exp>Date.now()&&await crypto.subtle.verify("HMAC",key,decode(signature),new TextEncoder().encode(payload));
      } catch { return false; }
    };
    if(url.pathname.endsWith("/settings")&&request.method==="GET"){
      try{return json({ok:true,settings:await readSettings()});}catch(e){return json({ok:false,error:e.message},503);}
    }
    if(url.pathname.endsWith("/admin/login")&&request.method==="POST"){
      try{
        const body=await request.json();
        if(!env.ADMIN_PASSWORD||!env.ADMIN_TOKEN_SECRET)return json({ok:false,error:"管理者認証Secretが未設定です"},503);
        if(typeof body.password!=="string"||body.password!==env.ADMIN_PASSWORD)return json({ok:false,error:"パスワードが違います"},401);
        return json({ok:true,token:await makeToken(),expiresIn:28800});
      }catch(e){return json({ok:false,error:e.message},500);}
    }
    if(url.pathname.endsWith("/admin/settings")&&request.method==="POST"){
      try{
        const token=(request.headers.get("Authorization")||"").replace(/^Bearer\\s+/i,"");
        if(!await validToken(token))return json({ok:false,error:"認証の有効期限が切れています"},401);
        if(!env.TALK_INSIGHT_KV)return json({ok:false,error:"TALK_INSIGHT_KV binding is not configured"},503);
        const body=await request.json();
        if(!body.settings||typeof body.settings!=="object"||JSON.stringify(body.settings).length>50000)return json({ok:false,error:"設定データが不正です"},400);
        const current=await readSettings();
        const record={version:Number(current?.version||0)+1,updatedAt:new Date().toISOString(),settings:body.settings};
        await env.TALK_INSIGHT_KV.put("global-settings",JSON.stringify(record));
        return json({ok:true,version:record.version,updatedAt:record.updatedAt});
      }catch(e){return json({ok:false,error:e.message},500);}
    }
    if(request.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
    if(!env.OPENAI_API_KEY)return json({ok:false,error:"OPENAI_API_KEY secret is not configured"},500);
    try {
      const body = await request.json();
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