# TALK BATTLE — Conversation Intelligence

Liquid Glass風の半透明UIで、2人の会話をまとめて分析するWebアプリです。サイト内に個人アカウント名は表示しません。

## 公開方法（GitHub Pages）

1. GitHubでこのリポジトリを開く
2. **Settings → Pages** を開く
3. **Build and deployment → Source** を `Deploy from a branch` にする
4. Branchを `main)、Folderを `/ (root)` にして **Save**
5. 公開URL：`https://kouei20130525-lang.github.io/talk-grading/`

## 会話の使い方

1. 2人の名前、テーマ、時間を設定
2. AI採点サーバーURL（後述）を入力
3. START CONVERSATIONを押してマイクを許可
4. 話す人が変わるたびに「話者1 / 話者2」を切り替える
5. 終了すると会話ログをChatGPTに送り、総合点・5項目・良かった点・改善点・話者別コメントを表示

※ 1台のマイクを使う場合、話者の切替は手動です。切替を忘れると話者別評価が不正確になります。音声認識の精度はブラウザや環境に左右されます。

## ChatGPT採点サーバーの設定（Cloudflare Workers）

GitHub Pagesは静的サイトなので、OpenAI APIキーを安全に隠して直接呼び出すことはできません。このリポジトリの `worker.js` をCloudflare Workerとしてデプロイし、APIキーはWorker Secretとして登録します。

1. Cloudflareにログインし、Workers & Pagesで新しいWorkerを作成
2. `worker.js` の内容をWorkerのコードとして貼り付けてDeploy
3. Workerの **Settings → Variables and Secrets** からSecretを追加
   - Name：`OPENAI_API_KEY`
   - Value：自分のOpenAI APIキー
4. Workerを再デプロイし、発行されたWorker URL（例：`https://your-worker.workers.dev`）をサイトの「AI採点サーバーURL」に入力

APIキーはサイト、GitHub、チャットに貼らないでください。OpenAI APIの利用はChatGPTの月額プランとは別で、API利用料金が発生する場合があります。料金・利用状況はOpenAI Platformで確認してください。

## 採点内容

- 会話全体の総合点（100点）
- 自然さ
- 発言バランス
- 質問・返答
- 傾聴・理解
- 話題の広がり
- 良かった点、次回への改善点、話者別コメント

AIは認識されたテキストを評価します。声の音質、正確な発音、表情、相手の声を遮ったタイミングなどを直接・完全に評価するものではありません。

## プライバシー

- 録音音声そのものはこのWorkerへ送らず、ブラウザの音声認識結果（テキストと話者ラベル）を採点用に送信します。
- Web Speech APIの認識処理はブラウザやOSの実装により外部サービスを利用する場合があります。
- 会話ログは採点のためOpenAI APIへ送信されます。個人情報、住所、学校名、秘密などを話さないでください。
- Workerは受信した会話テキストをアプリ側で保存しませんが、OpenAI API側のデータ取扱いは利用するサービスの最新ポリシーを確認してください。

## ファイル

- `index.html`：Webアプリ本体
- `worker.js`：ChatGPT採点用Cloudflare Worker
