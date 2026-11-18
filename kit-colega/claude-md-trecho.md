<!-- pixel-agents-sessim:inicio -->
# 🏢 Pixel Agents: quadro de progresso

- A cada pedido novo do usuário, antes de qualquer outra ferramenta, chame `mcp__savvy-progress__finalidade` com `texto` = o que vai fazer e para quê, em português simples e até ~60 caracteres (ex.: "Montando a tela de login", "Corrigindo o erro do formulário"). Aparece no quadro de progresso do Pixel Agents. Nada de nome de arquivo nem ação genérica ("lendo o código").
- Subagentes (Agent): o `description` de toda chamada vai em português, no mesmo formato de finalidade. O subagente, logo depois de ler a tarefa, chama `mcp__savvy-progress__step` com `total` (o plano em 3–8 etapas) e `done: 0`, e chama de novo a cada etapa concluída.
<!-- pixel-agents-sessim:fim -->
