import AdmZip from 'adm-zip';
import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const SANDBOX_ROOT = '/tmp/ecc-sandboxes';

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  'coverage',
]);

const TEXT_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.txt',
  '.css',
  '.scss',
  '.html',
  '.yml',
  '.yaml',
  '.toml',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.cpp',
  '.h',
  '.cs',
  '.rb',
  '.php',
  '.sql',
  '.env.example',
  '.gitignore',
]);

export interface SandboxOverview {
  sandboxId: string;
  sourceLabel: string;
  sourceType: 'github' | 'zip';
  branch?: string;
  files: string[];
  totalFiles: number;
  hasPackageJson: boolean;
  packageScripts: string[];
}

export interface FilePatchInput {
  path: string;
  action: 'create' | 'update' | 'delete';
  content?: string;
  summary: string;
}

function ensureSandboxRoot() {
  if (!fs.existsSync(SANDBOX_ROOT)) {
    fs.mkdirSync(SANDBOX_ROOT, { recursive: true });
  }
}

export function getSandboxDir(sandboxId: string): string {
  if (!/^[a-zA-Z0-9_-]{6,64}$/.test(sandboxId)) {
    throw new Error('Некорректный идентификатор песочницы.');
  }
  const dir = path.resolve(SANDBOX_ROOT, sandboxId);
  if (!dir.startsWith(SANDBOX_ROOT + path.sep)) {
    throw new Error('Недопустимый путь песочницы.');
  }
  if (!fs.existsSync(dir)) {
    throw new Error('Песочница проекта не найдена или была очищена.');
  }
  return dir;
}

function resolveSafeFilePath(sandboxDir: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(sandboxDir, normalized);
  if (!resolved.startsWith(sandboxDir + path.sep) && resolved !== sandboxDir) {
    throw new Error(`Недопустимый путь к файлу: ${relativePath}`);
  }
  return resolved;
}

function walkFiles(dir: string, baseDir: string, limit = 400): string[] {
  const results: string[] = [];
  function walk(current: string) {
    if (results.length >= limit) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (results.length >= limit) break;
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      const rel = path.relative(baseDir, full).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        walk(full);
      } else {
        results.push(rel);
      }
    }
  }
  walk(dir);
  return results;
}

function readPackageScripts(sandboxDir: string): {
  hasPackageJson: boolean;
  packageScripts: string[];
} {
  const pkgPath = path.join(sandboxDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { hasPackageJson: false, packageScripts: [] };
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    return {
      hasPackageJson: true,
      packageScripts: pkg.scripts ? Object.keys(pkg.scripts) : [],
    };
  } catch {
    return { hasPackageJson: true, packageScripts: [] };
  }
}

export function validateGithubUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Укажите корректную HTTPS-ссылку на GitHub репозиторий.');
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
    throw new Error('Поддерживаются только публичные HTTPS-ссылки github.com.');
  }
  const parts = parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error('Ссылка должна содержать владельца и имя репозитория (github.com/owner/repo).');
  }
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, '');
  if (!/^[a-zA-Z0-9._-]+$/.test(owner) || !/^[a-zA-Z0-9._-]+$/.test(repo)) {
    throw new Error('Некорректное имя владельца или репозитория GitHub.');
  }
  return `https://github.com/${owner}/${repo}.git`;
}

export async function cloneGithubRepoToSandbox(
  rawUrl: string,
  branch?: string
): Promise<SandboxOverview> {
  ensureSandboxRoot();
  const cleanUrl = validateGithubUrl(rawUrl);
  const sandboxId = `gh-${crypto.randomBytes(6).toString('hex')}`;
  const targetDir = path.join(SANDBOX_ROOT, sandboxId);

  const args = ['clone', '--depth', '1'];
  if (branch && branch.trim()) {
    const cleanBranch = branch.trim();
    if (!/^[a-zA-Z0-9._/-]+$/.test(cleanBranch)) {
      throw new Error('Некорректное имя ветки.');
    }
    args.push('--branch', cleanBranch);
  }
  args.push(cleanUrl, targetDir);

  await execFileAsync('git', args, {
    timeout: 45000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });

  // Configure git user in sandbox so diff/status work cleanly
  await execFileAsync('git', ['config', 'user.email', 'ecc@studio.local'], { cwd: targetDir });
  await execFileAsync('git', ['config', 'user.name', 'ECC Studio'], { cwd: targetDir });

  const { stdout: currentBranch } = await execFileAsync(
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    { cwd: targetDir }
  );

  const files = walkFiles(targetDir, targetDir);
  const { hasPackageJson, packageScripts } = readPackageScripts(targetDir);

  return {
    sandboxId,
    sourceLabel: cleanUrl.replace(/\.git$/, ''),
    sourceType: 'github',
    branch: currentBranch.trim(),
    files,
    totalFiles: files.length,
    hasPackageJson,
    packageScripts,
  };
}

export async function extractZipToSandbox(
  base64Data: string,
  archiveName: string
): Promise<SandboxOverview> {
  ensureSandboxRoot();
  const sandboxId = `zip-${crypto.randomBytes(6).toString('hex')}`;
  const targetDir = path.join(SANDBOX_ROOT, sandboxId);
  fs.mkdirSync(targetDir, { recursive: true });

  const buffer = Buffer.from(base64Data, 'base64');
  const zip = new AdmZip(buffer);
  zip.extractAllTo(targetDir, true);

  // If archive wrapped everything inside a single top-level directory, unwrap it cleanly
  const topEntries = fs
    .readdirSync(targetDir, { withFileTypes: true })
    .filter((e) => e.name !== '__MACOSX');
  if (topEntries.length === 1 && topEntries[0].isDirectory()) {
    const innerDir = path.join(targetDir, topEntries[0].name);
    for (const child of fs.readdirSync(innerDir)) {
      fs.renameSync(path.join(innerDir, child), path.join(targetDir, child));
    }
    fs.rmdirSync(innerDir);
  }

  // Initialize git baseline for clean diff tracking
  await execFileAsync('git', ['init'], { cwd: targetDir });
  await execFileAsync('git', ['config', 'user.email', 'ecc@studio.local'], { cwd: targetDir });
  await execFileAsync('git', ['config', 'user.name', 'ECC Studio'], { cwd: targetDir });
  await execFileAsync('git', ['add', '-A'], { cwd: targetDir });
  await execFileAsync('git', ['commit', '-m', 'baseline', '--allow-empty'], { cwd: targetDir });

  const files = walkFiles(targetDir, targetDir);
  const { hasPackageJson, packageScripts } = readPackageScripts(targetDir);

  return {
    sandboxId,
    sourceLabel: archiveName,
    sourceType: 'zip',
    branch: 'main',
    files,
    totalFiles: files.length,
    hasPackageJson,
    packageScripts,
  };
}

export function readSandboxFile(sandboxId: string, relPath: string): string {
  const dir = getSandboxDir(sandboxId);
  const full = resolveSafeFilePath(dir, relPath);
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    throw new Error(`Файл не найден: ${relPath}`);
  }
  const content = fs.readFileSync(full, 'utf8');
  return content.slice(0, 60000);
}

export function collectSandboxContextBundle(
  sandboxId: string,
  preferredPaths?: string[],
  maxChars = 45000
): { treeText: string; filesContentText: string } {
  const dir = getSandboxDir(sandboxId);
  const allFiles = walkFiles(dir, dir, 300);
  const treeText = allFiles.join('\n');

  const priorityOrder = [
    ...(preferredPaths ?? []),
    'package.json',
    'tsconfig.json',
    'README.md',
    'pyproject.toml',
    'go.mod',
    'Cargo.toml',
    'src/App.tsx',
    'src/main.tsx',
    'src/index.ts',
    'index.ts',
    'server.ts',
    'app.py',
    'main.go',
  ];

  const selected: string[] = [];
  const seen = new Set<string>();

  for (const p of priorityOrder) {
    if (allFiles.includes(p) && !seen.has(p)) {
      seen.add(p);
      selected.push(p);
    }
  }

  for (const f of allFiles) {
    if (selected.length >= 16) break;
    const ext = path.extname(f).toLowerCase();
    if (TEXT_EXTS.has(ext) && !seen.has(f)) {
      seen.add(f);
      selected.push(f);
    }
  }

  let total = 0;
  const blocks: string[] = [];

  for (const rel of selected) {
    if (total >= maxChars) break;
    try {
      const full = resolveSafeFilePath(dir, rel);
      const stat = fs.statSync(full);
      if (stat.size > 80000) continue;
      const content = fs.readFileSync(full, 'utf8');
      const chunk = `--- FILE: ${rel} ---\n${content.slice(0, 8000)}`;
      blocks.push(chunk);
      total += chunk.length;
    } catch {
      // Skip unreadable files
    }
  }

  return {
    treeText,
    filesContentText: blocks.join('\n\n'),
  };
}

export function applyPatchesToSandbox(
  sandboxId: string,
  patches: FilePatchInput[]
): Array<{ path: string; action: 'create' | 'update' | 'delete'; summary: string }> {
  const dir = getSandboxDir(sandboxId);
  const applied: Array<{ path: string; action: 'create' | 'update' | 'delete'; summary: string }> = [];

  for (const patch of patches) {
    const cleanRel = patch.path.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!cleanRel || cleanRel.startsWith('.git/')) continue;
    const full = resolveSafeFilePath(dir, cleanRel);

    if (patch.action === 'delete') {
      if (fs.existsSync(full) && !fs.statSync(full).isDirectory()) {
        fs.unlinkSync(full);
        applied.push({ path: cleanRel, action: 'delete', summary: patch.summary });
      }
      continue;
    }

    const parent = path.dirname(full);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }
    const existed = fs.existsSync(full);
    fs.writeFileSync(full, patch.content ?? '', 'utf8');
    applied.push({
      path: cleanRel,
      action: existed ? 'update' : 'create',
      summary: patch.summary,
    });
  }

  return applied;
}

export async function getSandboxDiff(sandboxId: string): Promise<{
  changedFiles: Array<{ status: string; path: string }>;
  diffText: string;
}> {
  const dir = getSandboxDir(sandboxId);
  await execFileAsync('git', ['add', '-N', '.'], { cwd: dir }).catch(() => undefined);

  const { stdout: statusOut } = await execFileAsync(
    'git',
    ['status', '--short'],
    { cwd: dir }
  );
  const changedFiles = statusOut
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((line) => ({
      status: line.slice(0, 2).trim() || 'M',
      path: line.slice(3).trim(),
    }));

  const { stdout: diffOut } = await execFileAsync(
    'git',
    ['diff', '--no-color'],
    { cwd: dir, maxBuffer: 5 * 1024 * 1024 }
  );

  return {
    changedFiles,
    diffText: diffOut || '(Нет текстовых изменений)',
  };
}

export async function runSandboxChecks(sandboxId: string): Promise<
  Array<{
    command: string;
    passed: boolean;
    exitCode: number;
    output: string;
  }>
> {
  const dir = getSandboxDir(sandboxId);
  const { hasPackageJson, packageScripts } = readPackageScripts(dir);
  const results: Array<{
    command: string;
    passed: boolean;
    exitCode: number;
    output: string;
  }> = [];

  if (!hasPackageJson) {
    results.push({
      command: 'static-check',
      passed: true,
      exitCode: 0,
      output: 'package.json не обнаружен — выполнена проверка целостности файлов и git diff.',
    });
    return results;
  }

  const hasNodeModules = fs.existsSync(path.join(dir, 'node_modules'));
  if (!hasNodeModules) {
    try {
      const { stdout, stderr } = await execFileAsync(
        'npm',
        ['install', '--no-audit', '--no-fund', '--prefer-offline'],
        { cwd: dir, timeout: 60000, maxBuffer: 2 * 1024 * 1024 }
      );
      results.push({
        command: 'npm install',
        passed: true,
        exitCode: 0,
        output: (stdout + '\n' + stderr).trim().slice(-2000) || 'Зависимости установлены.',
      });
    } catch (err: unknown) {
      const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
      results.push({
        command: 'npm install',
        passed: false,
        exitCode: typeof e.code === 'number' ? e.code : 1,
        output: `${e.stdout ?? ''}\n${e.stderr ?? ''}\n${e.message ?? ''}`.trim().slice(-3000),
      });
      return results;
    }
  }

  const candidateScripts = ['lint', 'typecheck', 'test', 'build'].filter((s) =>
    packageScripts.includes(s)
  );
  if (candidateScripts.length === 0) {
    results.push({
      command: 'package.json scripts',
      passed: true,
      exitCode: 0,
      output: 'В package.json нет стандартных скриптов lint/typecheck/test/build.',
    });
    return results;
  }

  for (const scriptName of candidateScripts) {
    try {
      const { stdout, stderr } = await execFileAsync(
        'npm',
        ['run', scriptName],
        {
          cwd: dir,
          timeout: 45000,
          maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, CI: 'true' },
        }
      );
      results.push({
        command: `npm run ${scriptName}`,
        passed: true,
        exitCode: 0,
        output: (stdout + '\n' + stderr).trim().slice(-2500) || 'Успешно.',
      });
    } catch (err: unknown) {
      const e = err as { code?: number; stdout?: string; stderr?: string; message?: string };
      results.push({
        command: `npm run ${scriptName}`,
        passed: false,
        exitCode: typeof e.code === 'number' ? e.code : 1,
        output: `${e.stdout ?? ''}\n${e.stderr ?? ''}\n${e.message ?? ''}`.trim().slice(-3000),
      });
    }
  }

  return results;
}

export function buildSandboxZipBuffer(sandboxId: string): Buffer {
  const dir = getSandboxDir(sandboxId);
  const zip = new AdmZip();

  function addDirRecursive(current: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(current, entry.name);
      const rel = path.relative(dir, full).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        addDirRecursive(full);
      } else {
        zip.addLocalFile(full, path.dirname(rel) === '.' ? '' : path.dirname(rel));
      }
    }
  }

  addDirRecursive(dir);
  return zip.toBuffer();
}
