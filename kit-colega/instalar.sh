#!/bin/bash
# Instala o Pixel Agents (versão Sessim) num Mac, igual ao do Eduardo:
#  - compila esta pasta e deixa o escritório rodando em http://localhost:3100,
#    ligando sozinho com o Mac e religando se cair;
#  - instala o plugin do quadro de progresso (savvy-progress com "finalidade");
#  - copia o layout do escritório e os móveis extras (só se ainda não houver);
#  - acrescenta no ~/.claude/CLAUDE.md a regra que alimenta o quadro.
# Pode rodar de novo para atualizar (depois de um git pull): não apaga nada seu.
#
# Uso: bash kit-colega/instalar.sh

set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
KIT="$RAIZ/kit-colega"
PA="$HOME/.pixel-agents"
PORTA=3100
LABEL="br.com.sessim.pixel-agents-web"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOGS="$HOME/.claude/logs"

passo() { printf '\n▶ %s\n' "$1"; }
falha() { printf '\n✖ %s\n' "$1" >&2; exit 1; }

[ "$(uname)" = "Darwin" ] || falha "Este instalador é para Mac."

# ── 1. Node 20+ ────────────────────────────────────────────────────────
passo "Conferindo o Node"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
versao_ok() { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; }
if ! versao_ok; then
  if command -v nvm >/dev/null 2>&1; then
    nvm install 22 >/dev/null && nvm use 22 >/dev/null
  elif command -v brew >/dev/null 2>&1; then
    brew install node@22 && export PATH="$(brew --prefix node@22)/bin:$PATH"
  else
    echo "  Instalando o nvm e o Node 22…"
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash >/dev/null
    . "$NVM_DIR/nvm.sh"
    nvm install 22 >/dev/null && nvm use 22 >/dev/null
  fi
fi
versao_ok || falha "Não consegui deixar o Node 20+ disponível."
NODE="$(command -v node)"
echo "  Node $(node -v) em $NODE"

command -v claude >/dev/null 2>&1 || falha "Não achei o comando 'claude' (Claude Code). Instale o Claude Code antes."

# ── 2. Compila ─────────────────────────────────────────────────────────
passo "Instalando dependências e compilando (leva alguns minutos na 1ª vez)"
cd "$RAIZ"
HUSKY=0 npm ci --no-audit --no-fund >/dev/null
node esbuild.js --production >/dev/null
npm run build:webview >/dev/null
[ -f dist/cli.js ] || falha "A compilação não gerou dist/cli.js."
echo "  Pronto."

# ── 3. Escritório (layout e móveis) e configuração ────────────────────
passo "Preparando o escritório"
mkdir -p "$PA" "$LOGS"
if [ ! -f "$PA/layout.json" ]; then
  cp "$KIT/escritorio/layout.json" "$PA/layout.json"
  echo "  Layout do escritório copiado."
else
  echo "  Você já tem um layout; mantive o seu."
fi
rsync -a "$KIT/escritorio/pacote-tech/" "$PA/pacote-tech/"
"$NODE" - "$PA" <<'JS'
const fs = require('fs'), path = require('path');
const pa = process.argv[2], arq = path.join(pa, 'config.json');
let c = {};
try { c = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch {}
const tech = path.join(pa, 'pacote-tech');
c.externalAssetDirectories = Array.from(new Set([...(c.externalAssetDirectories || []), tech]));
// Ganchos do Claude Code ligados (é o que faz o escritório reagir na hora).
c.hooksConsent = { ...(c.hooksConsent || {}), claude: 'granted' };
c.hooksEnabled = { ...(c.hooksEnabled || {}), claude: true };
c.standalone = {
  soundEnabled: true, alwaysShowLabels: false, ghostHeadlessAgents: false,
  watchAllSessions: true, hooksInfoShown: true, showAreas: false, areaMappings: {},
  bypassPermissions: false, showHostDirectories: false, accentTheme: 'purple',
  ...(c.standalone || {}),
};
c.standalone.watchAllSessions = true; // mostra todas as conversas do Claude Code
fs.writeFileSync(arq, JSON.stringify(c, null, 2));
JS
echo "  Configuração pronta (todas as conversas aparecem no escritório)."

# ── 4. Liga sozinho com o Mac ──────────────────────────────────────────
passo "Deixando o escritório ligado em http://localhost:$PORTA"
mkdir -p "$HOME/Library/LaunchAgents"
cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Pixel Agents (versão Sessim): http://localhost:$PORTA — liga com o Mac e religa se cair. -->
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$RAIZ/dist/cli.js</string>
    <string>--port</string>
    <string>$PORTA</string>
  </array>
  <key>WorkingDirectory</key><string>$HOME</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(dirname "$NODE"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOGS/pixel-agents-web.log</string>
  <key>StandardErrorPath</key><string>$LOGS/pixel-agents-web.log</string>
</dict>
</plist>
EOF
launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
ok=""
for _ in $(seq 1 30); do
  if curl -fs "http://127.0.0.1:$PORTA/api/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
[ -n "$ok" ] || falha "O escritório não respondeu na porta $PORTA. Veja $LOGS/pixel-agents-web.log"
echo "  No ar."

# ── 5. Plugin do quadro de progresso ──────────────────────────────────
passo "Instalando o plugin do quadro de progresso"
claude plugin marketplace add "$KIT/plugin" >/dev/null 2>&1 || claude plugin marketplace update sessim-kit >/dev/null 2>&1 || true
claude plugin install savvy-progress@sessim-kit >/dev/null 2>&1 || claude plugin update savvy-progress@sessim-kit >/dev/null 2>&1 || true
if claude plugin list 2>/dev/null | grep -q "savvy-progress@sessim-kit"; then
  echo "  Plugin instalado."
else
  echo "  ⚠ Não consegui confirmar o plugin. No Claude Code, rode: /plugin marketplace add $KIT/plugin  e depois  /plugin install savvy-progress@sessim-kit"
fi

# ── 6. Regra no CLAUDE.md ──────────────────────────────────────────────
passo "Acrescentando a regra do quadro no ~/.claude/CLAUDE.md"
CM="$HOME/.claude/CLAUDE.md"
touch "$CM"
"$NODE" - "$CM" "$KIT/claude-md-trecho.md" <<'JS'
const fs = require('fs');
const [arq, trechoArq] = process.argv.slice(2);
const atual = fs.readFileSync(arq, 'utf8');
const trecho = fs.readFileSync(trechoArq, 'utf8').trim();
const re = /<!-- pixel-agents-sessim:inicio -->[\s\S]*?<!-- pixel-agents-sessim:fim -->/;
const novo = re.test(atual) ? atual.replace(re, trecho) : (atual.trimEnd() + (atual.trim() ? '\n\n' : '') + trecho + '\n');
fs.writeFileSync(arq, novo);
JS
echo "  Feito."

printf '\n✅ Pronto. Abra http://localhost:%s (no Claude Code: Simple Browser, ou no navegador).\n' "$PORTA"
printf '   Conversas do Claude Code abertas ANTES da instalação precisam ser reabertas para o plugin aparecer.\n'
open "http://localhost:$PORTA" >/dev/null 2>&1 || true
