import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  directoryNameFromProjectDir,
  projectNameFromJsonl,
  resolveProjectName,
} from '../src/sessimProjectName.js';

/**
 * Sessim: o nome do projeto vem do `cwd` do JSONL da sessão; sem ele, do nome
 * codificado da pasta de projeto do Claude. Disco só para o arquivo de teste.
 */
describe('sessimProjectName', () => {
  let tmpDir: string;
  const projectDir = '/home/eu/.claude/projects/-Users-eu-Projetos-Meu-Projeto';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-sessim-name-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeJsonl(lines: unknown[]): string {
    const file = path.join(tmpDir, 'session.jsonl');
    fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    return file;
  }

  it('usa o basename do primeiro cwd encontrado no JSONL', () => {
    const file = writeJsonl([
      { type: 'queue-operation', operation: 'enqueue' },
      { type: 'user', cwd: '/Users/eu/Projetos/Meu Projeto', message: {} },
      { type: 'assistant', cwd: '/outro/lugar' },
    ]);
    expect(projectNameFromJsonl(file)).toBe('Meu Projeto');
    expect(resolveProjectName(file, projectDir)).toBe('Meu Projeto');
  });

  it('ignora cwd vazio ou que não é string e segue para o próximo registro', () => {
    const file = writeJsonl([{ cwd: '' }, { cwd: 42 }, { cwd: '/x/FilmStar' }]);
    expect(projectNameFromJsonl(file)).toBe('FilmStar');
  });

  it('sem cwd no JSONL cai no nome derivado da pasta de projeto', () => {
    const file = writeJsonl([{ type: 'queue-operation' }, { type: 'summary' }]);
    expect(projectNameFromJsonl(file)).toBeUndefined();
    expect(resolveProjectName(file, projectDir)).toBe('Projeto');
  });

  it('arquivo inexistente: undefined sem projectDir, reserva com projectDir', () => {
    const missing = path.join(tmpDir, 'nao-existe.jsonl');
    expect(projectNameFromJsonl(missing)).toBeUndefined();
    expect(resolveProjectName(missing)).toBeUndefined();
    expect(resolveProjectName(missing, projectDir)).toBe('Projeto');
    expect(resolveProjectName('', projectDir)).toBe('Projeto');
  });

  it('linha cortada ou não-JSON não derruba a leitura', () => {
    const file = path.join(tmpDir, 'session.jsonl');
    fs.writeFileSync(file, 'lixo "cwd" sem json\n{"cwd":"/a/Certo"}\n{"cwd":"/a/Cort');
    expect(projectNameFromJsonl(file)).toBe('Certo');
  });

  it('directoryNameFromProjectDir mantém o comportamento antigo', () => {
    expect(directoryNameFromProjectDir('-Users-eu-Projetos-Meu-Projeto')).toBe('Projeto');
    expect(directoryNameFromProjectDir('semhifen')).toBe('semhifen');
  });
});
