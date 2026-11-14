# Wear Journal v3.2 — カテゴリーとアーカイブ管理

この版では、**従来の着用記録とアイテム写真をそのまま引き継いで**、次の変更を追加しています。

- 画面表示の「パンツ」を **「ボトムス」** に変更。内部カテゴリーIDはこれまでの `pants` のままで、既存アイテムも着用記録も変わりません。
- **「ワンピース」** カテゴリー（内部ID `dresses`、👗）を新設。「設定・バックアップ」→「使うカテゴリー」でチェックを入れると、アイテム登録・日付の選択・月次集計で使用できます。既存利用者に無断でカテゴリを有効化しない方針です。
- **「引退する」** を押したアイテムは、普段の「持ち物と着用回数」一覧から消え、同じ画面の折りたたみ式 **「引退したアイテム」** に移動します。新たな着用候補には通常表示しません。写真と過去の記録、月次集計は維持され、アーカイブから **「使用を再開」** できます。過去に着た日には従来通り表示されます。
- **「削除」** は引退とは異なる、完全な削除です。着用履歴がないアイテムは確認ダイアログで削除できます。着用履歴がある場合、削除するアイテム名の再入力と二度目の確認が必須です。削除時は当該アイテムをすべての日付の記録から除外し、紐づく写真も端末から削除します。空になった日付の扱いは記録状態によります。**操作は取り消せないため、削除前に完全ZIPバックアップを保存してください。**

## 更新前に確認（重要）

1. **まず現在使っているiPhoneホーム画面版**の「設定・バックアップ」から、写真を含む「完全バックアップZIP」をiCloud Driveに保存して実際に存在することを確認してください。
2. このZIPの**中のファイル**を、現在のGitHubリポジトリ `hirokinam/wear-journal` のルートに同名上書きでアップロードし、Commit changesします。バックアップZIPはGitHubに公開しないでください。
3. URL `https://hirokinam.github.io/wear-journal/` とホーム画面のアプリはそのまま使います。ホーム画面のアプリを削除したり、新しいURLを作ったりしないでください。
4. 更新後はアプリの表示が `v3.2` になり、今までの着用履歴・画像が残っていることを確認してください。「設定・バックアップ」から「ワンピース」を有効にできます。

**保存形式はv3.1と同じです。** localStorageの `wear-journal-data-v3`、`schemaVersion:3`、IndexedDB `wear-journal-photos-v1` のキーや構造に変更はありません。既存のZIPバックアップも同じ形式で復元できます。別端末への自動同期はありません。

**テスト**：JavaScript構文チェック、ブラウザDOMテスト（旧v3データ読み込み、カテゴリ名変更、カテゴリ新設、引退・復帰、削除の確認、過去記録の維持）を実施。iPhoneのSafari・ホーム画面実機では未検証のため、アップロード前のバックアップを必ずお願いします。

---

# Wear Journal v3.1 — Daily Look View

This release updates only the calendar's DAILY ENTRY interface. Previously recorded items are now shown together at the top in a photo grid, grouped visually across categories. The long list of choices starts collapsed for recorded days and opens from **「着用アイテムを追加・変更」**. Unrecorded days start with the choices open.

**No data schema changes.** LocalStorage stays `wear-journal-data-v3`, image IDs and IndexedDB remain unchanged, and existing ZIP/JSON backup compatibility is preserved. No item images are duplicated in daily logs. The public GitHub Pages URL must remain the same.

**Before uploading:** Export a full ZIP backup from the **home-screen app** to iCloud Drive. Then replace existing files in the same GitHub repository with this archive's contents. Do not upload the ZIP backup to GitHub. After deploy, open the home-screen app and confirm the date, categories, images and wear logs. Do not remove the home-screen app or clear website data.

---

# Wear Journal v3.0 — GitHub Pages

靴からはじめる、写真付きの着用記録アプリ。外部データベースやアカウントは不要です。v2の記録を保持しながら、アイテムの写真と月間サマリーに対応しました。

## v3で新しくできること

- アイテムごとに自分で撮影した写真や保存した画像を登録できます。
- 画像は最大1024pxに縮小し、JPEG画質約78%で圧縮してから、端末内のIndexedDBに**アイテムにつき1枚だけ**保存します。着用日ごとに複製しません。元の画像のEXIFなどのメタデータは原則として再保存されません。
- 画像は選んだアイテムと、その日の登録候補、月間サマリーの一覧に表示されます。
- 「月間サマリー」タブで、その月のカテゴリ別着用回数ランキングを表示します。
- 設定でジャケット、パンツ、トップスなどのカテゴリを有効にできます。以前の靴だけの履歴はそのままです。
- **完全バックアップZIP**に、文字データ（`data.json`）と全アイテムの写真（`images/`）をまとめられます。復元もできます。
- 従来のv1/v2のJSONバックアップを取り込めます。ただしJSON単体には写真は含まれません。

※ 天気APIや日別コーデの画像一覧は、まだv3には含まれません。将来の拡張候補です。

## 既存v2からアップデート（重要）

1. **アップロード前に、ホーム画面で使っているv2の「設定・バックアップ」からJSONバックアップを作り、iCloud Driveに確実に保存してください。** Safari版とホーム画面版の保存先が別の場合、必ず現在使っているホーム画面版で実施します。
2. GitHubで今の `wear-journal` リポジトリを開きます。**新しいリポジトリや別URLは作らないでください。**
3. このZIPを解凍し、ZIPの中身をリポジトリの一番上にまとめてアップロード、Commit changesします。既存の同名ファイルは更新し、新たに `photos.js` と `archive.js` が追加されます。
4. GitHub Pagesは現在の `https://hirokinam.github.io/wear-journal/` のまま配信されます。iPhoneのホーム画面のアイコンも**消したり再追加したりしないでください。**
5. 更新後にホーム画面のWear Journalを閉じて再度開き、ヘッダーの `v3.0`、アイテム一覧と過去の日付の記録を確認します。公開反映とキャッシュ更新には多少時間がかかる場合があります。
6. 写真を1枚登録し、「設定・バックアップ」から**完全バックアップZIP**をiCloud Driveへ保存してください。ZIPに写真も含まれます。

v3は初回起動時、以前の `wear-journal-data-v2` を読み込んで新しい `wear-journal-data-v3` に移行し、**元のv2データのキーは消しません。** 旧形式のデータが壊れていて移行できない場合は、誤って上書きしないよう編集を停止します。v2に戻すと、v3で追加した記録はv2には自動反映されません。大きな更新前のバックアップは必須です。

## アップロードするファイル

- `index.html` — ページ構造
- `style.css` — 画面デザイン
- `app.js` — 日付記録、移行、月次集計、バックアップ操作
- `photos.js` — IndexedDB画像保存と自動縮小
- `archive.js` — ZIPの作成・検証・読み込み。外部ライブラリ不要
- `manifest.webmanifest` — ホーム画面アプリの設定
- `icon-192.png`, `icon-512.png` — アイコン
- `README.md` — この説明
- `.nojekyll` — GitHub Pages用（隠しファイル、任意）

**ZIPファイルそのもの**をGitHubにアップロードしてもアプリは更新されません。中のファイルをアップロードしてください。`data.json`や個人のバックアップZIP、撮影した画像は絶対にGitHubにアップロードしないでください。

## 画像の保存について

- 写真はアプリを使っている**その端末・そのWebアプリ保存領域**のIndexedDBに保存します。GitHubへのアップロードも、他の端末への自動同期もありません。
- iPhone Safariとホーム画面に追加したWebアプリは保存領域が別の場合があります。写真と着用履歴を移すときは完全バックアップZIPを使います。
- 選択した画像はブラウザ内で1024px以下のJPEGに変換されます。透明な背景は白になります。実際の容量は画像によります。元の高画質画像は別途、写真アプリなどで保管してください。
- 日付の記録は画像の複製ではなく、アイテムIDを参照します。写真の差し替えやアイテム名の変更でも履歴は変わりません。
- ブラウザデータの削除や容量不足などで写真・記録が消える可能性があります。IndexedDBを使うだけで永続性は保証されません。

## バックアップと復元

「設定・バックアップ」→「**共有してiCloudに保存**」でZIP形式の完全バックアップを作成し、iPhoneの共有メニューで「ファイルに保存」→「iCloud Drive」を選びます。共有が非対応の環境ではダウンロードになります。iCloud Driveに実際に保存されたか、ファイルアプリで確認してください。

ZIPの中には `data.json` と `images/p-....jpg` が入っています。画像はすでにJPEGで圧縮されているため、ZIP内の格納方式は無圧縮（STORE）です。ZIPは暗号化されていないため、他人へ共有しないでください。

復元は「ZIP / JSONファイルを選択」から行います。**復元すると現在の着用履歴とアイテム一覧が置き換わります。** 復元前に最新のZIPを別に保存してください。

「JSON（写真なし）」は文字データだけの救済用です。JSONからの復元では写真は戻りません。旧v2/v1のJSONも読み込めます。

## 使用範囲とプライバシー

- 同じ公開URLを妻や家族が開いても、端末／ブラウザの保存領域が異なれば着用データは別になります。ログインも自動同期もありません。
- コードと画面はGitHub Pages上で公開されます。着用履歴・写真・ZIPは端末内で処理し、アプリからGitHubへの自動送信は行いません。
- GitHub Pagesへのアクセスに伴う通信情報（IPアドレスなど）は、ホスティング側に記録されることがあります。
- 写真の外部送信はしません。ただし、GitHubに公開するコードが将来変更された場合には挙動が変わり得るため、更新内容は確認してください。
- v3では外部ライブラリや天気APIへの通信を使用しません（CSPで `connect-src 'none'`）。

## 開発者向けの設計

`localStorage['wear-journal-data-v3']` にJSON形式の文字データ（`schemaVersion:3`）を保存し、画像実体はIndexedDB `wear-journal-photos-v1` の `photos` ストアに `imageId` で保存します。`items[].imageId` は画像実体への参照です。`entries[YYYY-MM-DD].items` にはアイテムIDだけを保存します。復元時は画像を新しいIDで準備してから新しいJSONを書き込むことで、途中失敗による既存データ上書きリスクを軽減します。

コードはHTML/CSS/JavaScriptのみです。ビルドやnpmは不要で、VS CodeとGitHub Desktopから編集できます。ブラウザが古いJSをキャッシュしないよう、HTML内のJS/CSS参照にはv3用のクエリパラメータを設定しています。

## テスト状況

- Node.jsの構文チェック：実施
- v2→v3の文字記録移行：テスト用データで確認（元のv2キーも保持）
- ZIP作成／読み込み・CRC：Node.jsとPython標準ZIPで確認
- 写真を含むZIPの書き出し／復元：模擬ストレージで往復テスト
- iPhoneのSafari／ホーム画面アプリ実機：**未検証**。まずバックアップを保存し、写真1枚の登録とZIP復元を確認してください。

更新日：2026-11-14
