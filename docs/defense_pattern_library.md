# 守備パターン・リファレンス（15件）

この資料は、既存作戦盤へ登録する守備パターンの共通ライブラリです。各戦術への適用は教師が選択・確認します。

## DEF-01 マッチアップ・ボールポジション
- 分類：基本ポジショニング
- 対象：U15
- 難易度：★
- 目的：自分のマークマンとボールの両方を意識した基本位置を学ぶ。
- 発動場面：ハーフコート開始 / ボールまたはマークマンの移動
- 動作：stay_in_matchup, adjust_to_ball
- 出典：
  - JBA なぜマンツーマンが必要か？ 第5版 — pp.13-16
    https://www.japanbasketball.jp/wp-content/uploads/U15mandf_Leaflet_v5_20250401.pdf
  - FIBA WABC Coaching Manual Level 1 — 1.1 Man to Man Defence
    https://assets.fiba.basketball/image/upload/documents-corporate-wabc-coaching-level-manuals-level-1-eng.pdf

## DEF-02 1パスアウェイ・ディナイ
- 分類：オフボール
- 対象：U15
- 難易度：★
- 目的：ボールに近いオフボール選手へのパスを制限する。
- 発動場面：自分のマークマンが1パス距離
- 動作：deny
- 出典：
  - JBA なぜマンツーマンが必要か？ 第5版 — pp.15-16
    https://www.japanbasketball.jp/wp-content/uploads/U15mandf_Leaflet_v5_20250401.pdf
  - FIBA WABC Coaching Manual Level 1 — 1.1.3 Defending one pass away
    https://assets.fiba.basketball/image/upload/documents-corporate-wabc-coaching-level-manuals-level-1-eng.pdf

## DEF-03 ヘルプポジション
- 分類：ヘルプ
- 対象：U15
- 難易度：★
- 目的：ヘルプサイドからボールマンへの対応準備をする。
- 発動場面：ヘルプサイド
- 動作：help_position
- 出典：
  - JBA なぜマンツーマンが必要か？ 第5版 — pp.15-17
    https://www.japanbasketball.jp/wp-content/uploads/U15mandf_Leaflet_v5_20250401.pdf
  - FIBA WABC Coaching Manual Level 1 — 1.1.7 Help defence - split line defence
    https://assets.fiba.basketball/image/upload/documents-corporate-wabc-coaching-level-manuals-level-1-eng.pdf

## DEF-04 ヘルプ・アンド・リカバー
- 分類：ヘルプ
- 対象：U15
- 難易度：★★
- 目的：ドライブやカットを一時的に助け、マッチアップへ戻る。
- 発動場面：ドライブ / リングへのカット
- 動作：help, recover
- 出典：
  - JBA なぜマンツーマンが必要か？ 第5版 — pp.16-17
    https://www.japanbasketball.jp/wp-content/uploads/U15mandf_Leaflet_v5_20250401.pdf
  - FIBA WABC Coaching Manual Level 2 — help and recover
    https://assets.fiba.basketball/image/upload/documents-corporate-wabc-coaching-manual-level-2-eng.pdf

## DEF-05 ヘルプ・ローテーション
- 分類：ヘルプ
- 対象：U15
- 難易度：★★★
- 目的：ヘルプ後にチームとしてマッチアップを再構成する。
- 発動場面：ドライブでオンボールDFが抜かれる / ヘルプ発生
- 動作：help_rotation, matchup_recover
- 出典：
  - JBA なぜマンツーマンが必要か？ 第5版 — pp.16-17
    https://www.japanbasketball.jp/wp-content/uploads/U15mandf_Leaflet_v5_20250401.pdf
  - JBA 15歳以下でのマンツーマンディフェンス推進・実施について 導入準備資料 — 5. ヘルプローテーション
    https://www.japanbasketball.jp/wp-content/uploads/2015/08/U15mandf_20150812.pdf

## DEF-06 クローズアウト
- 分類：ボール対応
- 対象：U15
- 難易度：★
- 目的：パスを受けた選手へ素早く対応し、シュートとドライブを制限する。
- 発動場面：パス / キックアウト / ヘルプから復帰
- 動作：closeout
- 出典：
  - JBA 2021年度 U15ナショナル育成キャンプ 練習映像（局面順） — 1-3-3-1 クローズアウトドリル
    https://www.japanbasketball.jp/wp-content/uploads/2022-5-9_JBA_U15movielist-B.pdf
  - JBA マンツーマン推進における判定基準の考え方 — アンダーカテゴリー代表：オンボールディフェンス
    https://www.japanbasketball.jp/wp-content/uploads/mandf_reconfirmation_20190513.pdf

## DEF-07 オフボールスクリーン・チェイス（Lock & Trail）
- 分類：スクリーン対応
- 対象：U15+
- 難易度：★★
- 目的：オフボールスクリーン後もマークマンを追う。
- 発動場面：オフボールスクリーン
- 動作：lock_and_trail
- 出典：
  - FIBA WABC Coaching Manual Level 1 — 1.2.1 Defending off ball screens – lock and trail
    https://assets.fiba.basketball/image/upload/documents-corporate-wabc-coaching-level-manuals-level-1-eng.pdf

## DEF-08 オフボールスクリーン・アンダー
- 分類：スクリーン対応
- 対象：U15+
- 難易度：★★
- 目的：スクリーンの下を通ってマークマンへ戻る。
- 発動場面：オフボールスクリーン
- 動作：screen_avoid_under
- 出典：
  - FIBA WABC Coaching Manual Level 1 — 1.2.2 Defending off ball screens – under
    https://assets.fiba.basketball/image/upload/documents-corporate-wabc-coaching-level-manuals-level-1-eng.pdf

## DEF-09 オフボールスクリーン・スルー
- 分類：スクリーン対応
- 対象：U15+
- 難易度：★★
- 目的：スクリーンの間を通ってマークマンへ戻る。
- 発動場面：オフボールスクリーン
- 動作：screen_avoid_through
- 出典：
  - FIBA WABC Coaching Manual Level 1 — 1.2.3 Defending off ball screens – through
    https://assets.fiba.basketball/image/upload/documents-corporate-wabc-coaching-level-manuals-level-1-eng.pdf

## DEF-10 オフボールスクリーン・スイッチ
- 分類：スクリーン対応
- 対象：U15+
- 難易度：★★
- 目的：スクリーンを契機に2人のマッチアップを交換する。
- 発動場面：オフボールスクリーン
- 動作：switch
- 出典：
  - JBA なぜマンツーマンが必要か？ 第5版 — pp.17-18, 21-22
    https://www.japanbasketball.jp/wp-content/uploads/U15mandf_Leaflet_v5_20250401.pdf
  - FIBA WABC Coaching Manual Level 1 — off-ball screen – switch
    https://assets.fiba.basketball/image/upload/documents-corporate-wabc-coaching-level-manuals-level-1-eng.pdf

## DEF-11 オンボールスクリーン・アンダー
- 分類：ボールスクリーン対応
- 対象：U15+
- 難易度：★★
- 目的：ボールスクリーンの下を通る。
- 発動場面：オンボールスクリーン
- 動作：screen_avoid_under
- 出典：
  - FIBA WABC Coaching Manual Level 1 — 1.2.5 Defending on ball screens – under
    https://assets.fiba.basketball/image/upload/documents-corporate-wabc-coaching-level-manuals-level-1-eng.pdf

## DEF-12 オンボールスクリーン・オーバー
- 分類：ボールスクリーン対応
- 対象：U15+
- 難易度：★★
- 目的：ボールスクリーンの上を通って追従する。
- 発動場面：オンボールスクリーン
- 動作：screen_avoid_over
- 出典：
  - FIBA WABC Coaching Manual Level 1 — 1.2.6 Defending on ball screens – over
    https://assets.fiba.basketball/image/upload/documents-corporate-wabc-coaching-level-manuals-level-1-eng.pdf

## DEF-13 オンボールスクリーン・スルー
- 分類：ボールスクリーン対応
- 対象：U15+
- 難易度：★★
- 目的：スクリーナーとボールマンの間を通る。
- 発動場面：オンボールスクリーン
- 動作：screen_avoid_through
- 出典：
  - FIBA WABC Coaching Manual Level 1 — 1.2.7 Defending on ball screens – through
    https://assets.fiba.basketball/image/upload/documents-corporate-wabc-coaching-level-manuals-level-1-eng.pdf

## DEF-14 オンボールスクリーン・スイッチ
- 分類：ボールスクリーン対応
- 対象：U15+
- 難易度：★★
- 目的：ボールスクリーンを契機にマッチアップを交換する。
- 発動場面：オンボールスクリーン
- 動作：switch
- 出典：
  - JBA なぜマンツーマンが必要か？ 第5版 — pp.17-18, 21-22
    https://www.japanbasketball.jp/wp-content/uploads/U15mandf_Leaflet_v5_20250401.pdf
  - FIBA WABC Coaching Manual Level 1 — Defending on ball screens – switch
    https://assets.fiba.basketball/image/upload/documents-corporate-wabc-coaching-level-manuals-level-1-eng.pdf

## DEF-15 オンボールスクリーン・ダブル
- 分類：ボールスクリーン対応
- 対象：U16+ / チーム方針
- 難易度：★★★
- 目的：ボールスクリーンで2人がボールマンを挟む。
- 発動場面：オンボールスクリーン
- 動作：double
- 出典：
  - FIBA WABC Coaching Manual Level 1 — 1.2.9 Defending on ball screens – double
    https://assets.fiba.basketball/image/upload/documents-corporate-wabc-coaching-level-manuals-level-1-eng.pdf
