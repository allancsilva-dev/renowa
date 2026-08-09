#!/bin/zsh
# Driver do teste automatizado no Safari.
#   ./run.sh inject          — (re)injeta qa.js + phases.js na aba do app
#   ./run.sh phase p0        — roda uma fase e imprime o resultado
#   ./run.sh dump            — grava o estado acumulado em out/state.json
#   ./run.sh reset           — zera o estado acumulado
set -u
DIR="${0:a:h}"
mkdir -p "$DIR/out"
APP_URL_MATCH="${APP_URL_MATCH:-localhost:5173}"

find_tab() {
  osascript <<OSA
tell application "Safari"
  set w to window 1
  repeat with i from 1 to (count of tabs of w)
    if (URL of tab i of w) contains "$APP_URL_MATCH" then return i
  end repeat
  return 0
end tell
OSA
}

TAB="$(find_tab)"
if [[ "$TAB" == "0" || -z "$TAB" ]]; then
  print -r -- "ERRO: nenhuma aba com $APP_URL_MATCH na janela 1 do Safari" >&2
  exit 1
fi

focus() {
  osascript >/dev/null <<OSA
tell application "Safari"
  activate
  set current tab of window 1 to tab $TAB of window 1
end tell
OSA
}

js() { # js <código>  — executa e devolve o resultado como texto
  osascript -e "tell application \"Safari\" to do JavaScript \"$1\" in tab $TAB of window 1"
}

js_file() { # js_file <arquivo>
  osascript <<OSA
tell application "Safari"
  do JavaScript (read POSIX file "$1" as «class utf8») in tab $TAB of window 1
end tell
OSA
}

inject() {
  focus
  js_file "$DIR/qa.js"
  js_file "$DIR/phases.js"
}

case "${1:-}" in
  tab) print -r -- "$TAB" ;;
  inject) inject ;;
  reset) js "QA.reset()" ;;
  dump)
    js "QA.dump()" > "$DIR/out/state.json"
    print -r -- "state.json: $(wc -c < "$DIR/out/state.json") bytes"
    ;;
  phase)
    PH="${2:?fase}"
    TIMEOUT="${3:-180}"
    inject >/dev/null
    js "QA.run('$PH')" >/dev/null
    i=0
    while (( i < TIMEOUT )); do
      d="$(js "localStorage.getItem('__QA_DONE')" 2>/dev/null)"
      [[ "$d" == "1" ]] && break
      sleep 2
      i=$(( i + 2 ))
    done
    if [[ "$(js "localStorage.getItem('__QA_DONE')")" != "1" ]]; then
      print -r -- "TIMEOUT na fase $PH após ${TIMEOUT}s"
      exit 2
    fi
    js "localStorage.getItem('__QA_R')"
    ;;
  all)
    "$0" reset >/dev/null
    FASES=(p0 p1 p2 p3 p3b p4 p5 p6 p6b p7 p8 p7c p8b p9 p10 p11 p12 p13 p14)
    for f in $FASES; do
      print -r -- "── $f"
      "$0" phase "$f" 300 | tail -c 600
      "$0" dump >/dev/null
      cp "$DIR/out/state.json" "$DIR/out/state-$f.json"
    done
    ;;
  *) print -r -- "uso: run.sh inject|phase <fase>|all|dump|reset|tab" ;;
esac
