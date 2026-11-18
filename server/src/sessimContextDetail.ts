/**
 * Sessim: divisão detalhada do contexto (a mesma do /context do Claude Code).
 *
 * O JSONL só guarda o total de cada resposta. A divisão por categoria
 * (mensagens, ferramentas, MCP, skills, memória…) só o próprio Claude Code
 * sabe calcular. Por isso, quando o painel pede, rodamos o binário do Claude
 * Code sem janela com `/context`:
 * - sessão: `--resume <id> --fork-session --no-session-persistence` (não
 *   altera nem cria arquivo de sessão);
 * - projeto: sessão nova na pasta do projeto (o que toda sessão carrega).
 * `/context` é comando local: não chama o modelo e não custa nada. Os
 * conectores MCP levam alguns segundos para ligar; por isso a entrada é
 * stream-json e o comando só é enviado depois de MCP_WAIT_MS.
 * A sessão de cálculo leva PIXEL_AGENTS_SKIP_HOOK=1 para o hook do Pixel
 * Agents não criar um boneco para ela.
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface ContextCategory {
  /** Nome em inglês, como o Claude Code escreve (o webview traduz). */
  name: string;
  tokens: number;
  /** "(deferred)": carregado sob demanda, não ocupa a janela agora. */
  deferred: boolean;
}

export interface ContextItem {
  name: string;
  /** Servidor (MCP), origem (skill/agente) ou tipo (memória). */
  group: string;
  tokens: number;
}

export interface ContextDetail {
  model: string;
  used: number;
  max: number;
  categories: ContextCategory[];
  mcpTools: ContextItem[];
  agents: ContextItem[];
  memoryFiles: ContextItem[];
  skills: ContextItem[];
  /** Hora (ms) do cálculo. */
  at: number;
}

const MCP_WAIT_MS = 12_000;
const RUN_TIMEOUT_MS = 90_000;
const CACHE_MS = 2 * 60_000;

/** "152.2k" → 152200; "1m" → 1e6; "~160" → 160; "< 20" → 10; "362" → 362. */
export function parseTokenText(text: string): number {
  const t = text.trim().toLowerCase().replace(/,/g, '');
  if (t.startsWith('<')) {
    const n = parseFloat(t.slice(1));
    return Number.isFinite(n) ? Math.round(n / 2) : 0;
  }
  const m = /^~?\s*([\d.]+)\s*([km]?)/.exec(t);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  const mult = m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1;
  return Math.round(n * mult);
}

function tableRows(lines: string[]): string[][] {
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    // Linha separadora (|---|---|).
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    rows.push(cells);
  }
  // A primeira linha é o cabeçalho.
  return rows.slice(1);
}

/** Lê o markdown do /context. null se não for o formato esperado. */
export function parseContextMarkdown(md: string, at = Date.now()): ContextDetail | null {
  const tokensLine = /\*\*Tokens:\*\*\s*([^/]+)\/\s*([^\s(]+)/.exec(md);
  if (!tokensLine) return null;
  const model = /\*\*Model:\*\*\s*(\S+)/.exec(md)?.[1] ?? '';

  const sections = new Map<string, string[]>();
  let current = '';
  for (const line of md.split('\n')) {
    const h = /^###\s+(.+)$/.exec(line);
    if (h) {
      current = h[1].trim().toLowerCase();
      sections.set(current, []);
      continue;
    }
    if (current) sections.get(current)!.push(line);
  }
  const rowsOf = (title: string) => tableRows(sections.get(title) ?? []);
  const items = (title: string, nameCol: number, groupCol: number, tokCol: number) =>
    rowsOf(title)
      .filter((r) => r.length > tokCol)
      .map((r) => ({ name: r[nameCol], group: r[groupCol], tokens: parseTokenText(r[tokCol]) }));

  const categories = rowsOf('estimated usage by category')
    .filter((r) => r.length >= 2)
    .map((r) => ({
      name: r[0],
      tokens: parseTokenText(r[1]),
      deferred: /\(deferred\)/i.test(r[0]),
    }));
  if (categories.length === 0) return null;

  return {
    model,
    used: parseTokenText(tokensLine[1]),
    max: parseTokenText(tokensLine[2]),
    categories,
    mcpTools: items('mcp tools', 0, 1, 2),
    agents: items('custom agents', 0, 1, 2),
    // Memória: Tipo | Caminho | Tokens → nome = caminho, grupo = tipo.
    memoryFiles: items('memory files', 1, 0, 2),
    skills: items('skills', 0, 1, 2),
    at,
  };
}

/** Binário do Claude Code da extensão do VS Code mais nova instalada. */
export function findClaudeBinary(): string | null {
  const extDir = path.join(os.homedir(), '.vscode', 'extensions');
  let names: string[];
  try {
    names = fs.readdirSync(extDir).filter((n) => n.startsWith('anthropic.claude-code-'));
  } catch {
    return null;
  }
  const version = (n: string) =>
    (/claude-code-(\d+)\.(\d+)\.(\d+)/.exec(n)?.slice(1) ?? ['0', '0', '0']).map(Number);
  names.sort((a, b) => {
    const va = version(a);
    const vb = version(b);
    for (let i = 0; i < 3; i++) if (va[i] !== vb[i]) return vb[i] - va[i];
    return 0;
  });
  for (const n of names) {
    const bin = path.join(extDir, n, 'resources', 'native-binary', 'claude');
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

/** Roda /context sem janela e devolve o markdown da resposta. */
function runContextCommand(bin: string, cwd: string, sessionId?: string): Promise<string> {
  const args = [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--no-session-persistence',
  ];
  if (sessionId) args.push('--resume', sessionId, '--fork-session');
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      env: { ...process.env, PIXEL_AGENTS_SKIP_HOOK: '1' },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let buffer = '';
    let result: string | null = null;
    const killTimer = setTimeout(() => child.kill(), RUN_TIMEOUT_MS);
    const sendTimer = setTimeout(() => {
      const line = JSON.stringify({
        type: 'user',
        message: { role: 'user', content: '/context' },
      });
      child.stdin.write(line + '\n');
      child.stdin.end();
    }, MCP_WAIT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.includes('"result"')) continue;
        try {
          const rec = JSON.parse(line) as { type?: string; result?: unknown };
          if (rec.type === 'result' && typeof rec.result === 'string') result = rec.result;
        } catch {
          /* linha que não é JSON */
        }
      }
    });
    child.stdin.on('error', () => {});
    child.on('error', (err) => {
      clearTimeout(killTimer);
      clearTimeout(sendTimer);
      reject(err);
    });
    child.on('close', () => {
      clearTimeout(killTimer);
      clearTimeout(sendTimer);
      if (result) resolve(result);
      else reject(new Error('o /context não respondeu'));
    });
  });
}

const cache = new Map<string, ContextDetail>();
const pending = new Map<string, Promise<ContextDetail>>();

/**
 * Divisão do contexto da sessão (`sessionId`) ou do projeto (sem sessionId).
 * Resultado guardado por CACHE_MS; pedidos iguais em andamento são unidos.
 */
export function getContextDetail(
  cwd: string,
  sessionId: string | undefined,
  force = false,
): Promise<ContextDetail> {
  const key = sessionId ? `s:${sessionId}` : `p:${cwd}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit);
  const running = pending.get(key);
  if (running) return running;
  const bin = findClaudeBinary();
  if (!bin) return Promise.reject(new Error('Claude Code não encontrado'));
  const job = runContextCommand(bin, cwd, sessionId)
    .then((md) => {
      const detail = parseContextMarkdown(md);
      if (!detail) throw new Error('resposta do /context em formato inesperado');
      cache.set(key, detail);
      return detail;
    })
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

/** Store mínimo usado aqui (AgentStateStore cumpre). */
interface AgentLookup {
  get(id: number): { sessionId: string; jsonlFile: string } | undefined;
}

/**
 * Atende `sessimContextRequest` vindo do webview (VS Code e servidor avulso)
 * e responde `sessimContextDetail` só para quem pediu.
 */
export function handleSessimContextRequest(
  store: AgentLookup,
  msg: Record<string, unknown>,
  reply: (m: Record<string, unknown>) => void,
  resolveCwd: (jsonlFile: string) => string | undefined,
): void {
  const id = Number(msg.id);
  const scope = msg.scope === 'project' ? 'project' : 'session';
  const agent = store.get(id);
  const cwd = agent ? resolveCwd(agent.jsonlFile) : undefined;
  if (!agent || !cwd) {
    reply({ type: 'sessimContextDetail', id, scope, error: 'Pasta da sessão não encontrada' });
    return;
  }
  getContextDetail(cwd, scope === 'session' ? agent.sessionId : undefined, msg.force === true)
    .then((detail) => reply({ type: 'sessimContextDetail', id, scope, detail }))
    .catch((err: unknown) =>
      reply({
        type: 'sessimContextDetail',
        id,
        scope,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
}
