/**
 * Sessim: nome legível do projeto de uma sessão externa.
 *
 * A pasta de projeto do Claude é o caminho codificado com hífens
 * ("-Users-eu-Projetos-Meu-Projeto"), e pegar só o último pedaço perde tudo
 * que tinha hífen ou espaço ("Projeto" em vez de "Meu Projeto"). O caminho
 * real está no campo `cwd` dos primeiros registros do JSONL da sessão, então
 * lemos só o começo do arquivo (sem carregar tudo) e devolvemos o basename.
 * Sem `cwd` (sessão recém-criada ou arquivo inexistente), caímos no nome
 * derivado da pasta, igual antes.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Quanto do começo do JSONL vale a pena ler atrás do `cwd`. */
const MAX_BYTES = 256 * 1024;

/** Deriva um nome legível do nome codificado da pasta de projeto do Claude. */
export function directoryNameFromProjectDir(dirName: string): string {
  const parts = dirName.replace(/^-+/, '').split('-');
  return parts[parts.length - 1] || dirName;
}

/** Lê os primeiros bytes do arquivo; '' se ele não existir ou não puder ser lido. */
function readHead(file: string): string {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(MAX_BYTES);
    const n = fs.readSync(fd, buf, 0, MAX_BYTES, 0);
    return buf.toString('utf-8', 0, n);
  } catch {
    return '';
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignora */
      }
    }
  }
}

/**
 * Basename do `cwd` do primeiro registro do JSONL que tiver um. `undefined`
 * quando o arquivo não existe, não tem `cwd` no trecho lido ou o cwd é vazio.
 */
export function projectNameFromJsonl(jsonlFile: string): string | undefined {
  const cwd = cwdFromJsonl(jsonlFile);
  return cwd ? path.basename(cwd) || undefined : undefined;
}

/** Caminho completo do `cwd` do primeiro registro do JSONL que tiver um. */
export function cwdFromJsonl(jsonlFile: string): string | undefined {
  if (!jsonlFile) return undefined;
  const head = readHead(jsonlFile);
  if (!head) return undefined;
  for (const line of head.split('\n')) {
    if (!line.includes('"cwd"')) continue;
    try {
      // A última linha pode vir cortada pelo limite de bytes; o parse falha e seguimos.
      const rec = JSON.parse(line) as { cwd?: unknown };
      if (typeof rec.cwd === 'string' && rec.cwd && path.basename(rec.cwd)) return rec.cwd;
    } catch {
      /* linha incompleta ou não-JSON */
    }
  }
  return undefined;
}

/**
 * Nome do projeto para exibir: o `cwd` do JSONL quando existe, senão o nome
 * derivado da pasta de projeto (`projectDir`), senão `undefined`.
 */
export function resolveProjectName(jsonlFile: string, projectDir?: string): string | undefined {
  const fromJsonl = projectNameFromJsonl(jsonlFile);
  if (fromJsonl) return fromJsonl;
  if (projectDir) return directoryNameFromProjectDir(path.basename(projectDir));
  return undefined;
}
