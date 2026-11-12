# TALK INSIGHT 管理者メニュー：共有バックエンド設定

## 現在の構成

- GitHub Pages：画面配信
- Cloudflare Worker（`worker.js`）：管理者認証・共有設定API・既存AI採点API
- Cloudflare KV：全利用者共通設定の保存先

管理画面でWorker URLを入力してサーバー認証すると、設定の読み込みと保存が共有API経由になります。管理画面の自動保存は短い待ち時間の後に共有APIへ送信し、手動保存ボタンも残しています。一般利用者向けのアプリ本体への機能フラグ・採点配点・デザイン反映は、次の統合段階で接続します。

## Cloudflare側の設定

1. Cloudflare Dashboard → Workers & Pages で、既存のAI採点Workerを開きます。
2. `worker.js` の最新版をWorkerコードに反映してDeployします。
3. Workers & Pages → KV でKV namespaceを作成します（例：`talk-insight-global`）。
4. Worker → Settings → Bindings → Add → KV namespace を選びます。
   - Variable name：`TALK_INSIGHT_KV`
   - KV namespace：作成したnamespace
5. Worker → Settings → Variables and Secrets → Add secret で次の2つを登録します。
   - `ADMIN_PASSWORD`：管理者用の強いパスワード（12文字以上を推奨）
   - `ADMIN_TOKEN_SECRET`：十分に長いランダムな秘密文字列（32文字以上を推奨）
6. 既存のAI採点機能を使う場合は、既存Secret `OPENAI_API_KEY` も維持します。
7. Workerを再Deployします。

## 管理画面からの接続

1. TALK INSIGHTの管理者ページを開きます。
2. 「CLOUDFLARE WORKER URL」にWorker URL（例：`https://your-worker.workers.dev`）を入力します。
3. Cloudflare Secret `ADMIN_PASSWORD` と同じパスワードでログインします。
4. 接続に成功すると、共有設定を読み込みます。管理画面の保存操作は共有KVに反映されます。

## API

- `GET /settings`：公開設定の読み込み
- `POST /admin/login`：管理者パスワードを検証し、8時間有効の署名付きトークンを発行
- `POST /admin/settings`：署名付きBearerトークンを検証し、共有設定を保存
- `POST /`：既存AI採点API（従来どおり）

## セキュリティ・制限

- 管理者パスワードと署名用SecretはCloudflare Worker Secretにのみ保存します。HTMLやGitHubには書き込みません。
- 管理者トークンは8時間で失効します。
- CORSはGitHub Pagesの公開オリジンに制限しています。
- Worker/KVを設定するまでは共有設定APIは利用できません。ローカル試作モードは同一ブラウザ内だけで動作し、全利用者共通設定にはなりません。
- 現段階では共有設定の読み書きAPIと管理画面接続を用意しています。アプリ本体が共有設定を取得して画面・採点処理に適用する統合は別途必要です。
- 公開運用前にCloudflare側のレート制限、バックアップ、利用状況の監視も設定してください。
