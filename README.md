# TALK INSIGHT — Conversation Intelligence

会話を記録し、総合スコア・ランク・5つの観点・改善アドバイスで振り返るWebアプリです。

## 公開サイト
https://udaihuai.github.io/talk-grading/

## 主な機能
- 1人 / 2人の会話モード
- 音声認識による会話記録（対応ブラウザのみ）
- 発言の手動入力
- 総合スコア（100点満点）とランク評価（S / A+ / A / A- / B+ … F）
- 自然さ・発言バランス・質問と返答・傾聴と理解・話題の広がりの5項目評価
- 良かった点、改善アドバイス、話者別コメント
- 会話ログとテキストリプレイ

## 採点について
AI採点はCloudflare Worker経由でGemini APIを利用します。AI採点に接続できない場合は、ブラウザ内のルールベース採点に切り替わります。通常採点は会話内容の意味を完全に理解するものではなく、発言回数・質問表現・反応語などを使った参考評価です。

音声の音質、発音の正確さ、表情、声の印象を完全に判定するものではありません。AI採点も文字起こしされたテキストを中心に評価します。

## Cloudflare Workerの設定
このリポジトリの `worker.js` をCloudflare Workersへデプロイします。必要な設定は以下です。

- Secret `GEMINI_API_KEY`：Gemini APIキー
- Secret `ADMIN_PASSWORD`：管理者ログイン用パスワード
- Secret `ADMIN_TOKEN_SECRET`：管理者トークン署名用の十分に長い秘密値
- KV binding：TALK_INSIGHT_KV（共有設定・利用回数保存用）
- 任意の環境変数：GEMINI_MODEL（モデル名。既定値は gemini-2.5-flash）

APIキーや管理者パスワード、トークン秘密値をHTMLやGitHubへ書き込まないでください。WorkerのコードをGitHubで更新しただけではCloudflare上のWorkerは更新されません。Cloudflare側で最新の `worker.js` を反映して **Save and Deploy** してください。

## 管理画面
https://udaihuai.github.io/talk-grading/admin.html

管理画面のサーバー連携・共有設定・メンテナンス機能には、Workerの最新コードがデプロイされ、KV bindingとSecretが正しく設定されている必要があります。

## プライバシー
- 録音音声そのものではなく、ブラウザで認識したテキストと話者情報を採点APIへ送ります。
- 音声認識機能はブラウザやOSの仕様に依存します。
- AI採点を利用する場合、会話テキストはGemini APIへ送信されます。
- 個人情報、住所、学校名、秘密などを会話に含めないでください。

## ファイル
- index.html：Webアプリ本体
- admin.html：管理者向けコントロールセンター
- worker.js：Cloudflare Worker（AI採点・共有設定API）
