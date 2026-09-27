# バスケ作戦盤（中学校バスケットボール部・戦術学習）

## 起動
- ターミナルで `./run.sh`（データをチェック → ブラウザで開く。終了は Ctrl+C）
- または `index.html` をダブルクリック（オフラインで動く。データは `data/bundle.js` を使用）

## ファイル
| ファイル | 役割 | 編集 |
|---|---|---|
| `data/basketball_tactics_with_u16_setplays.json` | **戦術データの原本**（無改変） | 資料を確認して更新するときだけ |
| `data/diagrams.json` | 作図レイヤー（位置・矢印・日本語訳）。原本の各STEPを `src` で参照 | 作図を追加・修正するとき |
| `data/team_variants.json` | チーム版（アプリの「書き出し」で作ったファイルで置き換える） | アプリから |
| `data/bundle.js` | ダブルクリック起動用（自動生成） | しない |
| `index.html` / `app.js` / `board.js` / `style.css` | 画面 | 不要 |
| `validate.js` | 人数・構造のチェック（アプリと build.js で共通） | 不要 |
| `build.js` | データのチェック＋bundle.js 作成（`node build.js`） | 不要 |
| `tests/` | 人数ルールの自動テスト（`node --test tests/*.test.js`） | 不要 |
| `docs/` | 作成指示書・戦術カタログ | — |

データを編集したら `node build.js` を実行（`run.sh` は自動で実行します）。

## データの扱い（原則）
- 原本に書かれた動きだけを描く。原本に座標はないため、位置はすべて **模式図（元図で要確認）**。
- **人数ルール**（満たさない戦術は「戦術データエラー・要修正」と表示し、アニメーションしない）
  - BLOB/SLOB：`on_court_players` = コート上4人、`inbounder` = スローイン担当1人（位置は `inbound`、コート外）
  - HALFCOURT/SET_U16_PLUS：`on_court_players` = 5人、`inbounder` = null
  - 守備5人。選手IDは O1〜O5 のみ・重複不可
- スローイン担当の番号や選手の位置が資料文にない戦術は「要修正」（理由は `fix_notes`）。推測で補わない。
- 守備：資料に記載がないため、既定は「想定ディフェンス」（各選手とゴールの間に機械的に配置・初期配置のみ）。`defense` を書けば守備の配置・STEPごとの動きを登録できる。
- `verified: false` または `steps` が空 → 「資料確認中」「具体的な動作データは未確定」と表示し、アニメーションしない。
- 資料文から動きを確定できない戦術（SLOB-03, HC-06, SET-U16-06）は文章のみ表示。

## 作図を追加する手順
1. 出典を記録 → 2. variant を特定 → 3. 5人の初期配置を確定 → 4. STEPを確定 → 5. 第1・第2オプションを確定 → 6. `data/diagrams.json` に追加して `node build.js`

座標：x = 0（左サイドライン）〜150（右）、y = 0（エンドライン）〜140（センターライン）、ゴールは [75, 16]。
チーム版の編集画面でコートをクリックすると座標が表示されます。

## 元資料の図で確認した戦術（2026-09-26）
BLOB-03〜06、SLOB-01・02・08 は、Coach's Clipboard の元ページの図でスローイン担当と初期配置を確認して作図した（`layout_status: "source_diagram"`、`verification_note`・`source_figures` に記録）。
- 選手番号は元資料の図の番号（O1〜O5）をそのまま使っている（番号の置き換えなし）。
- 元資料の図は米国のコート（レーン幅が狭い）なので、レーンラインを基準に FIBA のコートへ位置を換算している。
- それ以外の戦術の位置は、引き続き模式図（元図で要確認）。

## 守備（ディフェンス）
- 表示：「ディフェンス：OFF／位置／動き」。「動き」は `defense.steps` に守備動作が登録された戦術だけ。守備動作は自動生成しない。
- データ：`defense {enabled, mode, verified, source, source_url, note, players:[{id:"D1",pos}], matchups:{D1:"O1"}, steps:[{step, actions:[{defender, action, target, screen_by, method, to}]}]}`
- action：stay / follow / switch / switch_back / recover / closeout / screen_avoid（method：under / over / go_through / switch）/ help・hedge・deny（移動先 `to` が必要）
- `verified: true` は資料または教師が確認した守備だけ。登録がない戦術は「想定ディフェンス」（位置のみ・動かない）。
- 教師はチーム版の編集画面「ディフェンス設定」から登録できる（原本・作図レイヤーは変わらない）。

## 守備ライブラリ
- 原本：`data/defense_pattern_library.json`（15件、説明は `docs/defense_pattern_library.md`）。画面は「守備ライブラリ」（`#/lib`）。
- パターンは戦術へ自動適用しない。チーム版の「ディフェンス設定」→「守備パターンから追加」で行を追加し、STEP・D1〜D5・相手O・移動先は先生が選ぶ。
- 守備の動作に `pattern: "DEF-10"` を付けると、パターンIDと動作の対応をチェックする（無効なID・パターンにない動作・片側だけのスイッチは保存できない）。
- 守備クイズ：チーム版の `quizzes: [{id, pattern_id, step, question, choices, answer_index, explanation}]`（問題・正解は先生が作成）。

## オプションと判断練習
- チーム版の編集画面「オプション設定」で、第1〜第3オプション・セーフティ（説明・発動条件・STEP・関係する選手・選手ごとの説明）と、判断練習の問題（どのSTEPで・どの守備で・どのオプションが守られ・次はどれか）を先生が登録する。自動では作らない。
- データ：チーム版の `offense_options: [{id, label, description, trigger, step, players:["O4","I"], player_notes:{"O4":"…"}}]`、`decisions: [{step, stopped, defense:{step, defender}, pattern_id, message, question, choices:[id], answer, next_step, player_notes}]`
- 戦術画面の「通常／判断練習」で切り替え。判断練習では問題のSTEPで止まり、正解すると登録したSTEPへ進む。「自分を見る」で選んだ選手の説明だけを表示する。
- クイズは `option_id`・`player`・`defender` でオプション・選手・守備を参照できる。

## チーム戦術（原本とチームの分離）
- 原本：`data/basketball_tactics_with_u16_setplays.json`・`data/diagrams.json`（変更しない）
- チーム：`data/team/team_tactics.json`（`tactics: { "戦術ID": { … } }`）。ある項目だけ原本より優先し、ない項目は原本を使う。
- 入力は「チーム戦術管理」（`#/team`）。使用するか・チーム内名称・注意点・選手別説明・STEPごとの役割・オプション・判断練習・守備・クイズ。このブラウザで入力した分は「書き出し」で team_tactics.json にして置き換える。
- 戦術画面の「原本だけを見る」（`#/src/ID`）でチーム設定なしの表示に戻れる。

## 教材用守備モデル（教師未確認）
- `data/tactical_defense_models.json`（20戦術、verified:false）。画面では「教材モデル・教師未確認」と表示。
- 表示の優先順位：チーム版の守備設定（team_tactics）＞ 教材モデル ＞ 想定ディフェンス（位置のみ）。
- 資料STEPとアプリSTEPの対応は `data/defense_step_map.json`（`source_step`→`app_step`）。守備は `app_step` だけで動き、`app_step` がない資料STEPの守備は動かさない（「対応するアプリSTEPが未設定」と表示）。位置のない動作（adjust_to_ball・deny・help_position）は文字だけ表示し動かさない。
- HC-04 は `animation_status: "motion_rule_only"`（守備はボール移動に応じた原則のみ・守備座標は未登録）。
- 教材モデルの `switch` はマッチアップの交換として扱う（相手側の守備はマッチアップだけ変わり、動かない。表示は「マッチアップ交換（移動データなし）」）。
- team_tactics へは自動コピーしない。戦術画面の「この教材モデルをチーム版に採用」を押したときだけコピー（verified は false のまま）。
- 教師確認：戦術画面の「守備モデルを確認」で 採用（approved）／修正（modified）／採用しない（rejected）。結果は team_tactics の `defense_review {status, reviewer, reviewed_at, note}` に保存（教材モデル・原本は変えない、verified は自動で変えない）。修正はチーム版にコピーして編集。採用しないと教材モデルは表示せず、位置は想定ディフェンス。優先順位：チーム版 ＞ 教師確認済み ＞ 未確認 ＞ 想定。

## iPadで使う
- Macで `./run.sh ipad` を実行し、表示されたアドレス（http://このMacのIP:8765/）を同じWi-FiのiPadのSafariで開く。
- Safariの共有ボタン →「ホーム画面に追加」で、アプリのように全画面で起動できる（manifest.json・icons/）。
- iPad横向きでは、作戦盤・再生操作・STEP表示が1画面に入り、右側の説明だけがスクロールする。補足情報（戦術の情報・記号の見かた・資料の流れ・役割）は折りたためる。

## GitHub Pages で公開する
- 公開用フォルダ：`node build.js --dist`（または `npm run build:pages`）で `dist/` を作る。`dist/` 直下に `index.html` があり、パスはすべて相対パスなので `https://ユーザー名.github.io/リポジトリ名/` のようなサブパスでも動く。
- 自動公開：`.github/workflows/deploy-pages.yml`。main へ push（または Actions 画面の「Run workflow」）で、テスト（`npm test`）→ データチェック → `dist/` 作成 → Pages へ公開。テストやデータチェックが失敗したら公開されない（原因は Actions のログに表示）。
- GitHub 側の設定：リポジトリの Settings → Pages → Build and deployment の Source を「GitHub Actions」にする。
- 開発時は今まで通り `./run.sh`（Mac で確認）・`./run.sh ipad`（同じWi-FiのiPad）。GitHub Pages では使わない。

### 公開されるファイル（dist/ の中身＝サイト全体が誰でも見られる前提）
- アプリ：index.html・style.css・app.js・board.js・validate.js・manifest.json・icons/
- データ：data/ の原本（basketball_tactics_with_u16_setplays.json・diagrams.json）、守備ライブラリ（defense_pattern_library.json）、教材守備モデル（tactical_defense_models.json・defense_step_map.json）、チーム版（team_variants.json・team/team_tactics.json）、data/bundle.js
- 公開されないもの：build.js・tests/・docs/・_old_v1/・run.sh・README.md・package.json
- 注意：`data/team/team_tactics.json` と `data/team_variants.json` に書き出して置いたチームの内容（呼び名・合図・教師メモ・選手ごとの説明など）は公開される。公開したくない内容はこのファイルに入れず、各端末のブラウザ保存だけで使う（またはリポジトリを非公開にして別の公開方法を検討する）。

### チームデータの共有について
- GitHub Pages で「アプリを開ける」ことと、「複数の端末で同じチームデータをリアルタイムに共有する」ことは別。
- チーム戦術・教師確認・チーム版は、今まで通り各端末のブラウザに保存される（端末ごと・ブラウザごとに別）。
- ほかの端末に反映するには、チーム戦術管理の「書き出し」→ `data/team/team_tactics.json` を置き換えて push（全員に反映）、または各端末で「読み込み」。
