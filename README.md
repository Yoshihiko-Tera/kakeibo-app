# おうち家計簿（Cloudflare Workers + Gemini + Googleスプレッドシート）

レシート写真・給与明細・クレカ明細スクショ・PayPay取引履歴スクショをAI（Gemini）で自動読み取りし、確認・修正したうえで Google スプレッドシートへ記録する家族共有 PWA アプリです。

## 特徴
- **1つの Cloudflare Workers で完結**: フロントエンド（React + Vite + Tailwind）と API（Hono）をまとめて配信
- **AIによるマルチモーダル解析**: レシート・給与明細・クレカ/PayPayスクショ（複数枚まとめ読み可）に対応
- **重複チェック機能**: スクショの境目が被っても、日付＋金額＋店名キーで二重登録を自動スキップ
- **家族メンバー＆Googleアカウント連携**: アプリ上の「設定」タブから、保存先のスプレッドシート（GAS URL）や家族の Google メールアドレス・表示名を登録可能
- **共有リンク機能**: 家族のスマホで共有リンクを開くだけで同じスプレッドシートへ接続可能

---

## セットアップ手順

### 1. Google スプレッドシート & GAS の準備
1. 共有したい **Google スプレッドシート** を新規作成します。
2. メニューの「拡張機能」→「Apps Script」を開き、[`gas/Code.gs`](gas/Code.gs) の内容を貼り付けて保存します。
3. 「プロジェクトの設定」→「スクリプト プロパティ」に以下を追加します（合言葉）：
   - `GAS_SECRET`: 任意のランダム文字列（例: `my-kakeibo-secret-123`）
4. 右上「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」を選択：
   - 次のユーザーとして実行：**自分**
   - アクセスできるユーザー：**全員**（`GAS_SECRET` で保護されます）
5. 発行された **ウェブアプリ URL** を控えておきます。

### 2. Cloudflare Workers へのデプロイ（GitHub連携）
1. このリポジトリを GitHub に Push します。
2. Cloudflare ダッシュボード → **Workers & Pages** →「作成」→「Git リポジトリを接続」でリポジトリを選択します：
   - **ビルドコマンド**: `npm run build`
   - **デプロイコマンド**: `npx wrangler deploy`
3. デプロイ後、Worker の「設定」→「変数とシークレット」に以下を追加します：
   - `GEMINI_API_KEY`: [Google AI Studio](https://aistudio.google.com/) で発行した API キー（**必須**）
4. **Cloudflare Access（Googleログイン認証）の設定**:
   - Cloudflare Zero Trust → Access → Applications から、デプロイした Worker の URL に Google ログインを設定し、利用する家族のメールアドレスを許可します。

### 3. アプリ側での初期設定
1. デプロイした URL を開き、**「設定」タブ** を開きます。
2. 手順1で取得した **GAS Webアプリ URL** と **合言葉（GAS_SECRET）** を入力して保存します（「共有リンク」を家族に送れば、家族のスマホはリンクを開くだけで設定が完了します）。
3. 同じ「設定」タブから、家族それぞれの **Googleメールアドレス** と **表示名（例：パパ、ママ、太郎）** を登録します。

---

## ローカル開発
1. `.dev.vars.example` をコピーして `.dev.vars` を作成し、`GEMINI_API_KEY` を設定します。
2. ビルドしてローカルサーバーを起動します：
   ```bash
   npm run build
   npx wrangler dev
   ```
