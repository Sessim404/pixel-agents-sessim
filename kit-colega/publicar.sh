#!/bin/bash
# Publica o estado atual do fork (ramo atual) no repositório privado do colega
# (remoto "sessim" → Sessim404/pixel-agents-sessim, ramo main), como UM commit
# novo por publicação, sem .github/workflows (o token do gh não tem a permissão
# "workflow" e o colega não precisa do CI).
#
# Uso: bash kit-colega/publicar.sh ["mensagem"]

set -euo pipefail
cd "$(dirname "$0")/.."

REMOTO=sessim
URL=https://github.com/Sessim404/pixel-agents-sessim.git
git remote get-url "$REMOTO" >/dev/null 2>&1 || git remote add "$REMOTO" "$URL"
git remote set-url "$REMOTO" "$URL"

MSG="${1:-Atualização do Pixel Agents ($(git rev-parse --short HEAD))}"
IDX="$(mktemp)"
trap 'rm -f "$IDX"' EXIT

# Árvore do commit atual sem .github/workflows.
GIT_INDEX_FILE="$IDX" git read-tree HEAD
GIT_INDEX_FILE="$IDX" git rm -r -q --cached --ignore-unmatch .github/workflows
TREE="$(GIT_INDEX_FILE="$IDX" git write-tree)"

PAI=""
if git fetch -q "$REMOTO" main 2>/dev/null; then
  PAI="$(git rev-parse FETCH_HEAD)"
  if [ "$(git rev-parse "$PAI^{tree}")" = "$TREE" ]; then
    echo "Nada novo para publicar."
    exit 0
  fi
fi

COMMIT="$(git commit-tree "$TREE" ${PAI:+-p "$PAI"} -m "$MSG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>")"
git push -q "$REMOTO" "$COMMIT:refs/heads/main"
echo "Publicado: $(git rev-parse --short "$COMMIT") em $URL"
