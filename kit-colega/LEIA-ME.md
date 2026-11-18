# Pixel Agents: versão do Eduardo

Um escritório em pixel art onde cada conversa do Claude Code vira um personagem. Ao lado fica um quadro com o que cada agente está fazendo e quanto já andou. Ele roda no seu Mac em **http://localhost:3100**.

## Instalar (uma vez)

Abra o Claude Code numa pasta qualquer e cole:

> Clone o repositório https://github.com/Sessim404/pixel-agents-sessim na pasta ~/Projetos/Pixel Agents e rode `bash kit-colega/instalar.sh` lá dentro. Se algum passo falhar, leia o erro, corrija e rode de novo. No fim, me diga se http://localhost:3100 abriu.

O instalador faz tudo sozinho:

- compila o escritório e deixa ele ligado em http://localhost:3100. Ele liga junto com o Mac e volta sozinho se cair;
- instala o plugin do quadro de progresso;
- copia o layout do escritório e os móveis extras;
- acrescenta no seu `~/.claude/CLAUDE.md` a regra que faz o Claude dizer, a cada pedido, o que está fazendo. É esse texto que aparece no quadro.

Depois de instalar, **feche e abra de novo** as conversas do Claude Code que já estavam abertas. Só assim elas carregam o plugin.

## Abrir dentro do VS Code

1. Aperte `Cmd+Shift+P`.
2. Escolha **"Simple Browser: Show"** (abre um navegador simples dentro do VS Code).
3. Digite `http://localhost:3100`.

Arraste a aba para o lado da conversa do Claude Code.

## Atualizar (quando o Eduardo mudar algo)

Peça ao Claude Code:

> Na pasta ~/Projetos/Pixel Agents, rode `git pull` e depois `bash kit-colega/instalar.sh`.

A atualização não apaga o seu layout.

## Se não abrir

- O registro do escritório fica em `~/.claude/logs/pixel-agents-web.log`.
- Para reiniciar, peça ao Claude Code: "rode `launchctl kickstart -k gui/$(id -u)/br.com.sessim.pixel-agents-web`".
