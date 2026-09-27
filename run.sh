#!/bin/bash
# バスケ作戦盤を起動します。終了するときは Ctrl+C。
cd "$(dirname "$0")" || exit 1

# 1) データのチェック（問題があれば止まります）
if command -v node >/dev/null 2>&1; then
  node build.js || { echo "データに問題があるため起動を中止しました。上のメッセージを確認してください。"; exit 1; }
fi

# 2) 空いているポートでローカルサーバーを起動してブラウザで開く
#    ./run.sh ipad … 同じWi-FiのiPadからも開けるようにする（このMacのIPアドレスで公開）
BIND=127.0.0.1
if [ "$1" = "ipad" ]; then BIND=0.0.0.0; fi
if command -v python3 >/dev/null 2>&1; then
  for PORT in 8765 8766 8767 8768 8769; do
    if ! lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      URL="http://localhost:$PORT/"
      echo "作戦盤を開きます: $URL （終了は Ctrl+C）"
      if [ "$BIND" = "0.0.0.0" ]; then
        IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
        echo "iPadのSafariで開くアドレス: http://${IP:-このMacのIPアドレス}:$PORT/"
        echo "（同じWi-Fiにつないでください。共有ボタン →「ホーム画面に追加」でアプリのように使えます）"
      fi
      (sleep 1 && open "$URL") &
      exec python3 -m http.server "$PORT" --bind "$BIND"
    fi
  done
  echo "ポート 8765〜8769 が使用中です。index.html をダブルクリックで開きます。"
fi
open index.html
