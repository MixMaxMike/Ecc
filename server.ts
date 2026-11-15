import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  applyPatchesToSandbox,
  buildSandboxZipBuffer,
  cloneGithubRepoToSandbox,
  collectSandboxContextBundle,
  extractZipToSandbox,
  type FilePatchInput,
  getSandboxDiff,
  readSandboxFile,
  runSandboxChecks,
} from './server/sandboxManager.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const MODEL_NAME = 'gemini-4-hydrogen';
const FALLBACK_MODEL_NAME = 'gemini-3.1-flash-lite';

interface RepoAgentSummary {
  id: string;
  slug: string;
  name: string;
  roleSummary: string;
  rosterStatus?: string;
}

interface EccRepoData {
  agents: Array<Record<string, unknown>>;
  rules: Array<Record<string, unknown>>;
  commands: Array<Record<string, unknown>>;
  skills: Array<Record<string, unknown>>;
}

interface IncomingAttachment {
  name: string;
  mimeType: string;
  kind: 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'zip' | 'binary';
  base64Data?: string;
  textContent?: string;
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

let cachedRepo: EccRepoData | null = null;
let cachedSkillBodies: Record<string, string> | null = null;

function loadEccRepository(): EccRepoData {
  if (cachedRepo) return cachedRepo;
  const repoPath = path.resolve(__dirname, 'server/data/ecc-repository.json');
  const raw = fs.readFileSync(repoPath, 'utf8');
  cachedRepo = JSON.parse(raw) as EccRepoData;
  return cachedRepo;
}

function loadSkillBodies(): Record<string, string> {
  if (cachedSkillBodies) return cachedSkillBodies;
  const bodiesPath = path.resolve(__dirname, 'server/data/ecc-skills-bodies.json');
  const raw = fs.readFileSync(bodiesPath, 'utf8');
  cachedSkillBodies = JSON.parse(raw) as Record<string, string>;
  return cachedSkillBodies;
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function mapThinkingLevel(level?: string): ThinkingLevel {
  switch (level) {
    case 'LOW':
      return ThinkingLevel.LOW;
    case 'MEDIUM':
      return ThinkingLevel.MEDIUM;
    case 'XHIGH':
      return ThinkingLevel.XHIGH;
    case 'HIGH':
    default:
      return ThinkingLevel.HIGH;
  }
}

function clampThinkingForModel(model: string, level: ThinkingLevel): ThinkingLevel {
  if (model !== MODEL_NAME && level === ThinkingLevel.XHIGH) {
    return ThinkingLevel.HIGH;
  }
  return level;
}

interface ParsedErrorDetails {
  code?: number;
  status?: string;
  message: string;
}

function extractErrorDetails(err: unknown): ParsedErrorDetails {
  let rawMessage =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
      ? err
      : 'Неизвестная ошибка Gemini API.';
  let code: number | undefined;
  let status: string | undefined;

  if (typeof err === 'object' && err !== null) {
    const obj = err as { status?: unknown; code?: unknown };
    if (typeof obj.code === 'number') code = obj.code;
    if (typeof obj.status === 'number') code = obj.status;
    if (typeof obj.status === 'string') status = obj.status;
  }

  for (let depth = 0; depth < 3; depth += 1) {
    const trimmed = rawMessage.trim();
    if (!trimmed.startsWith('{')) break;
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: { code?: number; status?: string; message?: string };
        code?: number;
        status?: string;
        message?: string;
      };
      const inner = parsed.error ?? parsed;
      if (typeof inner.code === 'number') code = inner.code;
      if (typeof inner.status === 'string') status = inner.status;
      if (typeof inner.message === 'string' && inner.message.trim()) {
        rawMessage = inner.message;
        continue;
      }
      break;
    } catch {
      break;
    }
  }

  return { code, status, message: rawMessage };
}

function isTransientOverloadError(err: unknown): boolean {
  const details = extractErrorDetails(err);
  const text = `${details.status ?? ''} ${details.message}`.toUpperCase();
  if (details.code === 503 || details.code === 502 || details.code === 504 || details.code === 500) {
    return true;
  }
  return (
    text.includes('UNAVAILABLE') ||
    text.includes('HIGH DEMAND') ||
    text.includes('OVERLOADED') ||
    text.includes('503') ||
    text.includes('ECONNRESET') ||
    text.includes('ETIMEDOUT') ||
    text.includes('FETCH FAILED')
  );
}

function formatGeminiErrorRussian(err: unknown): string {
  const details = extractErrorDetails(err);
  const text = `${details.status ?? ''} ${details.message}`.toUpperCase();

  if (details.message.includes('GEMINI_API_KEY')) {
    return 'API-ключ Gemini не задан. Добавьте GEMINI_API_KEY в панели Settings > Secrets.';
  }
  if (
    details.code === 403 ||
    details.code === 400 &&
      (text.includes('API_KEY') || text.includes('PERMISSION_DENIED'))
  ) {
    return 'Ошибка доступа или недействительный API-ключ Gemini. Проверьте ключ в панели Settings > Secrets.';
  }
  if (details.code === 429 || text.includes('RESOURCE_EXHAUSTED')) {
    return 'Превышен лимит запросов к Gemini API (429). Подождите немного или проверьте квоту ключа в панели Settings > Secrets.';
  }
  if (details.code === 404 || text.includes('NOT_FOUND')) {
    return 'Запрошенная модель Gemini недоступна (404).';
  }
  if (isTransientOverloadError(err)) {
    return 'Серверы Gemini API сейчас перегружены (503 UNAVAILABLE), автоповторы и резерв не смогли получить ответ. Повторите запрос через 10–20 секунд.';
  }
  return details.message.slice(0, 320);
}

async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

interface GeminiGenerateConfig {
  systemInstruction?: string;
  thinkingConfig?: { thinkingLevel: ThinkingLevel };
  responseMimeType?: string;
  responseSchema?: unknown;
  abortSignal?: AbortSignal;
}

function linkAbortSignals(
  parent: AbortSignal | undefined,
  timeoutMs: number
): { controller: AbortController; didTimeout: () => boolean; cleanup: () => void } {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException(`Attempt timed out after ${timeoutMs}ms`, 'TimeoutError'));
  }, timeoutMs);

  const onParentAbort = () => {
    controller.abort(parent?.reason);
  };
  if (parent) {
    if (parent.aborted) {
      controller.abort(parent.reason);
    } else {
      parent.addEventListener('abort', onParentAbort, { once: true });
    }
  }

  return {
    controller,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', onParentAbort);
    },
  };
}

async function generateContentWithRetryAndFallback(
  ai: GoogleGenAI,
  params: {
    contents: unknown;
    config: GeminiGenerateConfig;
  },
  signal?: AbortSignal
) {
  const plan: Array<{ model: string; delayBeforeMs: number; timeoutMs: number }> = [
    { model: MODEL_NAME, delayBeforeMs: 0, timeoutMs: 18000 },
    { model: MODEL_NAME, delayBeforeMs: 1000, timeoutMs: 18000 },
    { model: FALLBACK_MODEL_NAME, delayBeforeMs: 600, timeoutMs: 22000 },
    { model: FALLBACK_MODEL_NAME, delayBeforeMs: 1200, timeoutMs: 22000 },
  ];

  let lastError: unknown;
  for (let i = 0; i < plan.length; i += 1) {
    const attempt = plan[i];
    if (attempt.delayBeforeMs > 0) {
      await sleepWithAbort(attempt.delayBeforeMs, signal);
    }
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const linked = linkAbortSignals(signal, attempt.timeoutMs);
    const config: GeminiGenerateConfig = {
      ...params.config,
      abortSignal: linked.controller.signal,
    };
    if (config.thinkingConfig) {
      config.thinkingConfig = {
        thinkingLevel: clampThinkingForModel(
          attempt.model,
          config.thinkingConfig.thinkingLevel
        ),
      };
    }

    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model: attempt.model,
          contents: params.contents as never,
          config: config as never,
        }),
        new Promise<never>((_resolve, reject) => {
          linked.controller.signal.addEventListener(
            'abort',
            () => {
              reject(
                linked.didTimeout()
                  ? new Error('503 UNAVAILABLE: Превышено время ожидания ответа модели.')
                  : new DOMException('Aborted', 'AbortError')
              );
            },
            { once: true }
          );
        }),
      ]);
      linked.cleanup();
      return {
        response,
        usedModel: attempt.model,
        usedFallback: attempt.model !== MODEL_NAME,
      };
    } catch (err: unknown) {
      linked.cleanup();
      lastError = linked.didTimeout()
        ? new Error('503 UNAVAILABLE: Превышено время ожидания ответа модели.')
        : err;
      if (signal?.aborted || (!linked.didTimeout() && !isTransientOverloadError(err))) {
        throw lastError;
      }
    }
  }
  throw lastError;
}

async function streamContentWithRetryAndFallback(
  ai: GoogleGenAI,
  params: {
    contents: unknown;
    config: GeminiGenerateConfig;
  },
  onChunk: (text: string) => void,
  onStatus?: (info: { phase: 'retrying' | 'fallback'; model: string; message: string }) => void,
  signal?: AbortSignal
): Promise<{ usedModel: string; usedFallback: boolean }> {
  const plan: Array<{ model: string; delayBeforeMs: number; firstByteTimeoutMs: number }> = [
    { model: MODEL_NAME, delayBeforeMs: 0, firstByteTimeoutMs: 10000 },
    { model: MODEL_NAME, delayBeforeMs: 1000, firstByteTimeoutMs: 10000 },
    { model: FALLBACK_MODEL_NAME, delayBeforeMs: 500, firstByteTimeoutMs: 15000 },
    { model: FALLBACK_MODEL_NAME, delayBeforeMs: 1000, firstByteTimeoutMs: 18000 },
  ];

  let lastError: unknown;
  for (let i = 0; i < plan.length; i += 1) {
    const attempt = plan[i];
    if (attempt.delayBeforeMs > 0) {
      const isFallback = attempt.model !== MODEL_NAME;
      onStatus?.({
        phase: isFallback ? 'fallback' : 'retrying',
        model: attempt.model,
        message: isFallback
          ? `Основная модель не отвечает / перегружена — переключаюсь на резерв ${attempt.model}...`
          : 'Сервер Gemini перегружен — повторная попытка...',
      });
      await sleepWithAbort(attempt.delayBeforeMs, signal);
    }
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const linked = linkAbortSignals(signal, attempt.firstByteTimeoutMs);
    const config: GeminiGenerateConfig = {
      ...params.config,
      abortSignal: linked.controller.signal,
    };
    if (config.thinkingConfig) {
      config.thinkingConfig = {
        thinkingLevel: clampThinkingForModel(
          attempt.model,
          config.thinkingConfig.thinkingLevel
        ),
      };
    }

    let emittedAnyChunk = false;
    let clearedFirstByteTimer = false;
    try {
      const streamPromise = ai.models.generateContentStream({
        model: attempt.model,
        contents: params.contents as never,
        config: config as never,
      });

      const stream = await Promise.race([
        streamPromise,
        new Promise<never>((_resolve, reject) => {
          linked.controller.signal.addEventListener(
            'abort',
            () => {
              reject(
                linked.didTimeout()
                  ? new Error('503 UNAVAILABLE: Превышено время ожидания потока.')
                  : new DOMException('Aborted', 'AbortError')
              );
            },
            { once: true }
          );
        }),
      ]);

      const iterator = stream[Symbol.asyncIterator]();
      while (true) {
        const nextPromise = iterator.next();
        const nextRes = !emittedAnyChunk
          ? await Promise.race([
              nextPromise,
              new Promise<never>((_resolve, reject) => {
                linked.controller.signal.addEventListener(
                  'abort',
                  () => {
                    reject(
                      linked.didTimeout()
                        ? new Error('503 UNAVAILABLE: Модель не прислала первый фрагмент вовремя.')
                        : new DOMException('Aborted', 'AbortError')
                    );
                  },
                  { once: true }
                );
              }),
            ])
          : await nextPromise;

        if (!clearedFirstByteTimer) {
          linked.cleanup();
          clearedFirstByteTimer = true;
        }
        if (nextRes.done || signal?.aborted) break;
        const chunk = nextRes.value;
        if (chunk.text) {
          emittedAnyChunk = true;
          onChunk(chunk.text);
        }
      }

      if (!clearedFirstByteTimer) linked.cleanup();
      return {
        usedModel: attempt.model,
        usedFallback: attempt.model !== MODEL_NAME,
      };
    } catch (err: unknown) {
      if (!clearedFirstByteTimer) linked.cleanup();
      lastError = linked.didTimeout()
        ? new Error('503 UNAVAILABLE: Превышено время ожидания ответа модели.')
        : err;
      if (
        signal?.aborted ||
        emittedAnyChunk ||
        (!linked.didTimeout() && !isTransientOverloadError(err))
      ) {
        throw lastError;
      }
    }
  }
  throw lastError;
}

function buildMultimodalParts(
  textPrompt: string,
  attachments?: IncomingAttachment[]
): GeminiPart[] {
  const parts: GeminiPart[] = [];
  const textAttachments: string[] = [];

  if (Array.isArray(attachments)) {
    for (const att of attachments) {
      if (att.kind === 'text' && att.textContent) {
        textAttachments.push(
          `--- ПРИКРЕПЛЁННЫЙ ФАЙЛ: ${att.name} ---\n${att.textContent.slice(0, 30000)}`
        );
      } else if (
        (att.kind === 'image' ||
          att.kind === 'video' ||
          att.kind === 'audio' ||
          att.kind === 'pdf') &&
        att.base64Data
      ) {
        parts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: att.base64Data,
          },
        });
      } else if (att.kind === 'zip') {
        textAttachments.push(`[Прикреплён ZIP-архив проекта: ${att.name}]`);
      } else if (att.kind === 'binary') {
        textAttachments.push(
          `[Прикреплён бинарный файл: ${att.name} (${att.mimeType})]`
        );
      }
    }
  }

  const combinedText = [textPrompt, ...textAttachments].filter(Boolean).join('\n\n');
  parts.push({ text: combinedText || 'Выполни запрос.' });
  return parts;
}

interface WorkerRunBody {
  systemInstruction?: string;
  userInput?: string;
  thinkingLevel?: string;
  attachments?: IncomingAttachment[];
}

interface HookCheckBody {
  hookId?: string;
  hookName?: string;
  phase?: 'pre-run' | 'post-run';
  severity?: 'block' | 'warn';
  checkInstruction?: string;
  userInput?: string;
  outputText?: string;
}

interface OrchestratorChatBody {
  message?: string;
  history?: Array<{ role: 'user' | 'orchestrator'; text: string }>;
  attachments?: IncomingAttachment[];
  sandboxId?: string;
  activeAgents?: RepoAgentSummary[];
  reserveAgents?: RepoAgentSummary[];
}

interface OrchestratorPlanBody {
  task?: string;
  sandboxId?: string;
  attachments?: IncomingAttachment[];
  activeAgents?: RepoAgentSummary[];
  reserveAgents?: RepoAgentSummary[];
  useDeputyPlanner?: boolean;
  useDeputyQa?: boolean;
}

interface OrchestratorExecuteStepBody {
  sandboxId?: string;
  task?: string;
  stepTitle?: string;
  instructionForAgent?: string;
  targetFiles?: string[];
  priorContext?: string;
  systemInstruction?: string;
  thinkingLevel?: string;
  attachments?: IncomingAttachment[];
}

interface OrchestratorReviewBody {
  task?: string;
  stepTitle?: string;
  assignedAgentSlug?: string;
  stepOutput?: string;
  remainingStepsCount?: number;
  activeAgents?: RepoAgentSummary[];
  reserveAgents?: RepoAgentSummary[];
}

interface OrchestratorSynthesizeBody {
  task?: string;
  analysis?: string;
  staffingSummary?: string;
  sandboxDiffSummary?: string;
  checksSummary?: string;
  completedSteps?: Array<{
    title: string;
    agentName: string;
    agentSlug: string;
    outputText: string;
    deputyVerdict?: string;
  }>;
}

function detectDeterministicSecrets(text: string): string[] {
  const findings: string[] = [];
  const patterns: Array<{ label: string; regex: RegExp }> = [
    { label: 'Google API key (AIza...)', regex: /AIza[0-9A-Za-z_-]{20,}/g },
    { label: 'OpenAI / Secret key (sk-...)', regex: /\bsk-[A-Za-z0-9_-]{20,}/g },
    {
      label: 'GitHub token (ghp_/github_pat_)',
      regex: /\b(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,
    },
    { label: 'PEM Private Key block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
    { label: 'Bearer token', regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi },
  ];

  for (const item of patterns) {
    if (item.regex.test(text)) {
      findings.push(item.label);
    }
  }
  return findings;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req, res) => {
    const repo = loadEccRepository();
    res.json({
      ok: true,
      model: MODEL_NAME,
      fallbackModel: FALLBACK_MODEL_NAME,
      counts: {
        agents: repo.agents.length,
        rules: repo.rules.length,
        commands: repo.commands.length,
        skills: repo.skills.length,
      },
    });
  });

  app.get('/api/ecc/repository', (_req, res) => {
    try {
      const repo = loadEccRepository();
      res.json(repo);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Не удалось загрузить каталог ECC.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/ecc/skills/:id', (req, res) => {
    try {
      const bodies = loadSkillBodies();
      const id = req.params.id;
      const body = bodies[id] ?? '';
      res.json({ id, markdownBody: body });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Не удалось загрузить тело скилла.';
      res.status(500).json({ error: message });
    }
  });

  // --- Sandbox GitHub / ZIP Project Endpoints ---

  app.post('/api/sandbox/clone', async (req, res) => {
    try {
      const { url, branch } = (req.body ?? {}) as { url?: string; branch?: string };
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'Укажите ссылку на GitHub репозиторий.' });
        return;
      }
      const overview = await cloneGithubRepoToSandbox(url, branch);
      res.json(overview);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Не удалось клонировать репозиторий.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/sandbox/upload-zip', async (req, res) => {
    try {
      const { base64Data, name } = (req.body ?? {}) as {
        base64Data?: string;
        name?: string;
      };
      if (!base64Data) {
        res.status(400).json({ error: 'ZIP-архив пуст.' });
        return;
      }
      const overview = await extractZipToSandbox(base64Data, name || 'project.zip');
      res.json(overview);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Не удалось распаковать ZIP-архив.';
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/sandbox/:id/file', (req, res) => {
    try {
      const relPath = typeof req.query.path === 'string' ? req.query.path : '';
      if (!relPath) {
        res.status(400).json({ error: 'Укажите путь к файлу.' });
        return;
      }
      const content = readSandboxFile(req.params.id, relPath);
      res.json({ path: relPath, content });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка чтения файла.';
      res.status(404).json({ error: message });
    }
  });

  app.get('/api/sandbox/:id/diff', async (req, res) => {
    try {
      const diff = await getSandboxDiff(req.params.id);
      res.json(diff);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка получения git diff.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/sandbox/:id/check', async (req, res) => {
    try {
      const results = await runSandboxChecks(req.params.id);
      res.json({ results });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка запуска проверок.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/sandbox/:id/download', (req, res) => {
    try {
      const zipBuffer = buildSandboxZipBuffer(req.params.id);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="ecc-updated-project-${req.params.id}.zip"`
      );
      res.send(zipBuffer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка сборки ZIP-архива.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/sandbox/:id/patch', async (req, res) => {
    try {
      const { diffText } = await getSandboxDiff(req.params.id);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="ecc-changes-${req.params.id}.patch"`
      );
      res.send(diffText);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка формирования патча.';
      res.status(500).json({ error: message });
    }
  });

  // --- Orchestrator Direct Chat (SSE) ---

  app.post('/api/orchestrator/chat', async (req, res) => {
    const body = (req.body ?? {}) as OrchestratorChatBody;
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message && (!body.attachments || body.attachments.length === 0)) {
      res.status(400).json({ error: 'Введите сообщение или прикрепите файл.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(': connected\n\n');

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abortController.abort();
    });
    const keepalive = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, 4000);

    const sendEvent = (event: string, data: unknown) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      const ai = getAiClient();
      const activeAgents = Array.isArray(body.activeAgents) ? body.activeAgents : [];
      const reserveAgents = Array.isArray(body.reserveAgents) ? body.reserveAgents : [];

      let sandboxSummary = 'Репозиторий сейчас не подключён.';
      if (body.sandboxId) {
        try {
          const ctx = collectSandboxContextBundle(body.sandboxId, undefined, 25000);
          sandboxSummary = `ПОДКЛЮЧЁННЫЙ ПРОЕКТ (Дерево файлов):\n${ctx.treeText}\n\nКЛЮЧЕВЫЕ ФАЙЛЫ:\n${ctx.filesContentText}`;
        } catch {
          sandboxSummary = 'Подключённая песочница недоступна.';
        }
      }

      const historyText = (body.history ?? [])
        .slice(-10)
        .map(
          (m) =>
            `${m.role === 'user' ? 'Пользователь' : 'Главный Оркестратор'}: ${m.text}`
        )
        .join('\n\n');

      const promptParts = buildMultimodalParts(
        `${historyText ? `ИСТОРИЯ ДИАЛОГА:\n${historyText}\n\n` : ''}НОВОЕ СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ:\n${message || '(Смотри прикреплённые файлы)'}\n\n${sandboxSummary}`,
        body.attachments
      );

      const result = await streamContentWithRetryAndFallback(
        ai,
        {
          contents: { parts: promptParts },
          config: {
            systemInstruction: `Ты — Главный Оркестратор команды AI-воркеров (Orchestrator Lead) в ECC Worker Studio.
Ты общаешься напрямую с руководителем проекта (пользователем) на русском языке.

Твои возможности и контекст:
- Активный штат команды (${activeAgents.length}): ${activeAgents.map((a) => `${a.slug} (${a.name})`).join(', ') || 'нет'}.
- Доступный резерв из ECC (${reserveAgents.length}): ${reserveAgents.slice(0, 35).map((a) => a.slug).join(', ')}.
- Ты можешь анализировать прикреплённые пользователем изображения, видео, аудио, PDF, исходный код, логи и файлы подключённого GitHub/ZIP проекта.
- Если пользователь спрашивает, как лучше разбить задачу, кого из агентов нанять/уволить или просит уточнить детали перед запуском цикла правок — давай чёткий, практичный ответ с конкретными ролями и шагами.`,
            thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          },
        },
        (text) => sendEvent('chunk', { text }),
        (info) => sendEvent('meta', info),
        abortController.signal
      );

      if (!abortController.signal.aborted) {
        sendEvent('done', { ok: true, usedModel: result.usedModel, usedFallback: result.usedFallback });
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        sendEvent('error', { message: formatGeminiErrorRussian(err) });
      }
    } finally {
      clearInterval(keepalive);
      if (!res.writableEnded) res.end();
    }
  });

  // --- Orchestrator Phase 1: Analytics & Proposed Plan (with Sandbox Context) ---

  app.post('/api/orchestrator/plan', async (req, res) => {
    const body = (req.body ?? {}) as OrchestratorPlanBody;
    const task = typeof body.task === 'string' ? body.task.trim() : '';
    if (!task && (!body.attachments || body.attachments.length === 0)) {
      res.status(400).json({ error: 'Опишите задачу для Оркестратора.' });
      return;
    }

    const activeAgents = Array.isArray(body.activeAgents) ? body.activeAgents : [];
    const reserveAgents = Array.isArray(body.reserveAgents) ? body.reserveAgents : [];
    const useDeputyPlanner = body.useDeputyPlanner !== false;
    const useDeputyQa = body.useDeputyQa !== false;

    const activeListText = activeAgents
      .map((a) => `- ${a.slug} (${a.name}): ${a.roleSummary.slice(0, 150)}`)
      .join('\n');
    const reserveListText = reserveAgents
      .map((a) => `- ${a.slug} (${a.name}): ${a.roleSummary.slice(0, 130)}`)
      .join('\n');

    let sandboxContext = '';
    if (body.sandboxId) {
      try {
        const ctx = collectSandboxContextBundle(body.sandboxId, undefined, 32000);
        sandboxContext = `\n\nПОДКЛЮЧЁННЫЙ ПРОЕКТ В ПЕСОЧНИЦЕ (реальное дерево файлов):\n${ctx.treeText}\n\nСОДЕРЖИМОЕ КЛЮЧЕВЫХ ФАЙЛОВ:\n${ctx.filesContentText}`;
      } catch {
        sandboxContext = '';
      }
    }

    try {
      const ai = getAiClient();
      const promptParts = buildMultimodalParts(
        `ЗАДАЧА ПОЛЬЗОВАТЕЛЯ:\n${task || 'Проанализируй прикреплённые материалы и предложи план.'}${sandboxContext}\n\nТЕКУЩИЙ АКТИВНЫЙ ШТАТ:\n${activeListText || '(пусто)'}\n\nДОСТУПНЫЙ РЕЗЕРВ ECC (можно нанять под эту задачу):\n${reserveListText || '(пусто)'}\n\nЗаместитель по декомпозиции: ${useDeputyPlanner ? 'ВКЛЮЧЁН' : 'ВЫКЛЮЧЕН'}\nЗаместитель по качеству: ${useDeputyQa ? 'ВКЛЮЧЁН' : 'ВЫКЛЮЧЕН'}`,
        body.attachments
      );

      const { response } = await generateContentWithRetryAndFallback(ai, {
        contents: { parts: promptParts },
        config: {
          systemInstruction: `Ты — Главный Оркестратор команды AI-воркеров (Orchestrator Lead) из экосистемы affaan-m/ECC.
Твоя задача на этапе АНАЛИТИКИ И ПЛАНИРОВАНИЯ (до редактирования кода):
1. Изучить задачу, прикреплённые файлы/медиа и (если подключён) реальный код проекта в песочнице.
2. Подобрать команду:
   - Задействуй подходящих агентов из активного штата.
   - Если не хватает узкого специалиста — найми его (actionType: "hire") из доступного резерва ECC по точному slug.
   - Если кто-то из активного штата явно лишний для задачи — можешь временно перевести в резерв (actionType: "fire").
   - Если нужной роли нет в резерве — создай кастомного специалиста (actionType: "create_custom").
3. Сформулировать аналитический отчёт (analysis) + заметку Заместителя по декомпозиции (deputyPlannerNote).
4. Составить от 2 до 4 конкретных этапов (steps). Если подключён проект в песочнице, в targetFiles каждого этапа укажи точные относительные пути файлов, которые агент должен прочитать и/или доработать.

Отвечай строго на русском языке.`,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              analysis: {
                type: Type.STRING,
                description: 'Подробный аналитический разбор проекта/задачи и выявленных проблем.',
              },
              deputyPlannerNote: {
                type: Type.STRING,
                description: 'Заметка Заместителя по декомпозиции о порядке этапов и рисках.',
              },
              staffingActions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    actionType: { type: Type.STRING },
                    agentSlug: { type: Type.STRING },
                    agentName: { type: Type.STRING },
                    roleSummary: { type: Type.STRING },
                    customSystemPrompt: { type: Type.STRING },
                    reason: { type: Type.STRING },
                  },
                  required: ['actionType', 'agentSlug', 'agentName', 'reason'],
                },
              },
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    assignedAgentSlug: { type: Type.STRING },
                    instructionForAgent: { type: Type.STRING },
                    targetFiles: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ['title', 'assignedAgentSlug', 'instructionForAgent'],
                },
              },
            },
            required: ['analysis', 'staffingActions', 'steps'],
          },
        },
      });

      const raw = (response.text ?? '{}').trim();
      res.json(JSON.parse(raw));
    } catch (err: unknown) {
      res.status(500).json({ error: formatGeminiErrorRussian(err) });
    }
  });

  // --- Orchestrator Phase 3: Execute Step with Real File Patching in Sandbox ---

  app.post('/api/orchestrator/execute-step', async (req, res) => {
    const body = (req.body ?? {}) as OrchestratorExecuteStepBody;
    if (!body.sandboxId) {
      res.status(400).json({ error: 'Для патчинга файлов требуется подключённый проект (sandboxId).' });
      return;
    }

    try {
      const ctx = collectSandboxContextBundle(body.sandboxId, body.targetFiles, 42000);
      const ai = getAiClient();
      const thinkingLevel = mapThinkingLevel(body.thinkingLevel);

      const promptText = `ОБЩАЯ ЗАДАЧА:\n${body.task ?? ''}\n\nТВОЁ ЗАДАНИЕ НА ЭТОМ ЭТАПЕ (${body.stepTitle ?? ''}):\n${body.instructionForAgent ?? ''}\n\nЦЕЛЕВЫЕ ФАЙЛЫ: ${(body.targetFiles ?? []).join(', ') || 'определи по структуре проекта'}\n${
        body.priorContext ? `\nРЕЗУЛЬТАТЫ ПРЕДЫДУЩИХ ЭТАПОВ:\n${body.priorContext}\n` : ''
      }\nДЕРЕВО ФАЙЛОВ ПРОЕКТА:\n${ctx.treeText}\n\nТЕКУЩЕЕ СОДЕРЖИМОЕ ФАЙЛОВ:\n${ctx.filesContentText}`;

      const parts = buildMultimodalParts(promptText, body.attachments);

      const { response } = await generateContentWithRetryAndFallback(ai, {
        contents: { parts },
        config: {
          systemInstruction: `${body.systemInstruction ?? ''}\n\nВАЖНО: Ты работаешь с реальной копией проекта в песочнице.
Если твой этап предполагает изменение или создание кода/документации/тестов, верни массив filePatches с ПОЛНЫМ обновлённым содержимым каждого изменяемого файла (content — полный готовый файл без пропусков вроде "// остальной код без изменений"). Если этап чисто аналитический/ревью без правки файлов — оставь filePatches пустым [].`,
          thinkingConfig: { thinkingLevel },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              report: {
                type: Type.STRING,
                description: 'Подробный отчёт агента о проделанной работе на русском языке.',
              },
              filePatches: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    path: {
                      type: Type.STRING,
                      description: 'Относительный путь к файлу от корня проекта',
                    },
                    action: {
                      type: Type.STRING,
                      description: 'Одно из: create, update, delete',
                    },
                    content: {
                      type: Type.STRING,
                      description: 'Полное содержимое файла для create/update',
                    },
                    summary: {
                      type: Type.STRING,
                      description: 'Краткое описание внесённой правки',
                    },
                  },
                  required: ['path', 'action', 'summary'],
                },
              },
            },
            required: ['report', 'filePatches'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        report?: string;
        filePatches?: FilePatchInput[];
      };

      const patches = Array.isArray(parsed.filePatches) ? parsed.filePatches : [];
      const appliedPatches =
        patches.length > 0 ? applyPatchesToSandbox(body.sandboxId, patches) : [];

      res.json({
        report: parsed.report || 'Этап выполнен.',
        appliedPatches,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: formatGeminiErrorRussian(err) });
    }
  });

  app.post('/api/orchestrator/review-step', async (req, res) => {
    const body = (req.body ?? {}) as OrchestratorReviewBody;
    const task = body.task ?? '';
    const stepTitle = body.stepTitle ?? '';
    const assignedAgentSlug = body.assignedAgentSlug ?? '';
    const stepOutput = body.stepOutput ?? '';
    const activeAgents = Array.isArray(body.activeAgents) ? body.activeAgents : [];
    const reserveAgents = Array.isArray(body.reserveAgents) ? body.reserveAgents : [];

    const activeSlugs = activeAgents.map((a) => `${a.slug} (${a.name})`).join(', ');
    const reserveSample = reserveAgents
      .slice(0, 60)
      .map((a) => `${a.slug}: ${a.roleSummary.slice(0, 90)}`)
      .join('\n');

    try {
      const ai = getAiClient();
      const { response } = await generateContentWithRetryAndFallback(ai, {
        contents: `ИСХОДНАЯ ЗАДАЧА:\n${task}\n\nТОЛЬКО ЧТО ЗАВЕРШЁННЫЙ ЭТАП: ${stepTitle}\nИСПОЛНИТЕЛЬ: ${assignedAgentSlug}\nОСТАЛОСЬ ЭТАПОВ ПО ПЛАНУ: ${body.remainingStepsCount ?? 0}\n\nРЕЗУЛЬТАТ ИСПОЛНИТЕЛЯ (сокращённо до 6000 симв.):\n${stepOutput.slice(0, 6000)}\n\nАКТИВНЫЙ ШТАТ: ${activeSlugs}\n\nРЕЗЕРВ ECC ДЛЯ ДОНАЙМА/ЗАМЕНЫ:\n${reserveSample}`,
        config: {
          systemInstruction: `Ты — Заместитель Оркестратора по контролю качества и безопасности (Deputy QA & Security).
Проверь результат этапа.
Реши:
- Если работа качественная и соответствует задаче: approved=true, recommendedAction="none".
- Если выявлены важные пробелы или ошибки сборки/тестов: recommendedAction="hire_backup", укажи exact recommendedAgentSlug из резерва или активного штата и followUpInstruction.
- Если текущий исполнитель выдал поверхностный/нерелевантный результат и его стоит отстранить/заменить на более подходящего специалиста: approved=false, recommendedAction="fire_and_replace", укажи recommendedAgentSlug для замены и reason.`,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              approved: { type: Type.BOOLEAN },
              verdictSummary: { type: Type.STRING },
              recommendedAction: { type: Type.STRING },
              recommendedAgentSlug: { type: Type.STRING },
              followUpInstruction: { type: Type.STRING },
              reason: { type: Type.STRING },
            },
            required: ['approved', 'verdictSummary', 'recommendedAction'],
          },
        },
      });

      const raw = (response.text ?? '{}').trim();
      res.json(JSON.parse(raw));
    } catch (err: unknown) {
      res.status(500).json({ error: formatGeminiErrorRussian(err) });
    }
  });

  app.post('/api/orchestrator/synthesize', async (req, res) => {
    const body = (req.body ?? {}) as OrchestratorSynthesizeBody;
    const task = typeof body.task === 'string' ? body.task.trim() : '';
    const completedSteps = Array.isArray(body.completedSteps) ? body.completedSteps : [];

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(': connected\n\n');

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abortController.abort();
    });
    const keepalive = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, 4000);

    const sendEvent = (event: string, data: unknown) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      const ai = getAiClient();
      const stepsDigest = completedSteps
        .map(
          (s, i) =>
            `### Этап ${i + 1}: ${s.title} (Агент: ${s.agentName} / ${s.agentSlug})\n${
              s.deputyVerdict ? `Заключение Заместителя QA: ${s.deputyVerdict}\n` : ''
            }Результат агента:\n${s.outputText}`
        )
        .join('\n\n---\n\n');

      const result = await streamContentWithRetryAndFallback(
        ai,
        {
          contents: `ИСХОДНАЯ ЗАДАЧА:\n${task || 'Обработка проекта'}\n\nПЕРВИЧНЫЙ РАЗБОР:\n${body.analysis ?? ''}\n\nКАДРОВЫЕ ИЗМЕНЕНИЯ:\n${body.staffingSummary ?? 'Без изменений'}\n\nИЗМЕНЕНИЯ ФАЙЛОВ:\n${body.sandboxDiffSummary ?? 'Без файловых изменений'}\n\nРЕЗУЛЬТАТЫ ПРОВЕРОК И ТЕСТОВ:\n${body.checksSummary ?? 'Не запускались'}\n\nОТЧЁТЫ КОМАНДЫ ВОРКЕРОВ:\n${stepsDigest}`,
          config: {
            systemInstruction: `Ты — Главный Оркестратор команды AI-воркеров.
Сведи результаты всех отработавших специалистов, файловые патчи, итоги тестов и замечания Заместителей в финальный отчёт на русском языке:
1. Что сделано и какие файлы обновлены
2. Итоги проверок / тестов и оставшиеся риски
3. Что делать пользователю дальше (скачать ZIP/патч, проверить локально и т.д.).`,
            thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          },
        },
        (text) => sendEvent('chunk', { text }),
        (info) => sendEvent('meta', info),
        abortController.signal
      );

      if (!abortController.signal.aborted) {
        sendEvent('done', { ok: true, usedModel: result.usedModel, usedFallback: result.usedFallback });
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        sendEvent('error', { message: formatGeminiErrorRussian(err) });
      }
    } finally {
      clearInterval(keepalive);
      if (!res.writableEnded) res.end();
    }
  });

  // --- Solo Worker Runner (Multimodal + SSE) ---

  app.post('/api/worker/run', async (req, res) => {
    const body = (req.body ?? {}) as WorkerRunBody;
    const userInput = typeof body.userInput === 'string' ? body.userInput.trim() : '';
    const systemInstruction =
      typeof body.systemInstruction === 'string' ? body.systemInstruction.trim() : '';
    const hasAttachments = Array.isArray(body.attachments) && body.attachments.length > 0;

    if (!userInput && !hasAttachments) {
      res.status(400).json({ error: 'Введите текст задачи или прикрепите файл.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(': connected\n\n');

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abortController.abort();
    });
    const keepalive = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, 4000);

    const sendEvent = (event: string, data: unknown) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      const ai = getAiClient();
      const thinkingLevel = mapThinkingLevel(body.thinkingLevel);
      const parts = buildMultimodalParts(userInput, body.attachments);

      const result = await streamContentWithRetryAndFallback(
        ai,
        {
          contents: { parts },
          config: {
            ...(systemInstruction ? { systemInstruction } : {}),
            thinkingConfig: { thinkingLevel },
          },
        },
        (text) => sendEvent('chunk', { text }),
        (info) => sendEvent('meta', info),
        abortController.signal
      );

      if (!abortController.signal.aborted) {
        sendEvent('done', { ok: true, usedModel: result.usedModel, usedFallback: result.usedFallback });
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        sendEvent('error', { message: formatGeminiErrorRussian(err) });
      }
    } finally {
      clearInterval(keepalive);
      if (!res.writableEnded) res.end();
    }
  });

  app.post('/api/worker/hook-check', async (req, res) => {
    const body = (req.body ?? {}) as HookCheckBody;
    const phase = body.phase === 'pre-run' ? 'pre-run' : 'post-run';
    const severity = body.severity === 'block' ? 'block' : 'warn';
    const hookId = body.hookId ?? 'unknown-hook';
    const hookName = body.hookName ?? 'ECC Hook';
    const checkInstruction = body.checkInstruction ?? '';
    const userInput = body.userInput ?? '';
    const outputText = body.outputText ?? '';

    if (phase === 'pre-run' && hookId === 'hook-pre-secret-guard') {
      const found = detectDeterministicSecrets(userInput);
      if (found.length > 0) {
        res.json({
          hookId,
          hookName,
          phase,
          severity,
          passed: false,
          summary: `Обнаружены потенциальные секреты: ${found.join(', ')}`,
          details: 'Удалите или замаскируйте токены и ключи перед отправкой задачи воркеру.',
        });
        return;
      }
      res.json({
        hookId,
        hookName,
        phase,
        severity,
        passed: true,
        summary: 'Утечек ключей и токенов во входном тексте не обнаружено.',
      });
      return;
    }

    try {
      const ai = getAiClient();
      const targetContent =
        phase === 'pre-run'
          ? `ВХОДНАЯ ЗАДАЧА ПОЛЬЗОВАТЕЛЯ:\n${userInput}`
          : `ЗАДАЧА ПОЛЬЗОВАТЕЛЯ:\n${userInput}\n\nОТВЕТ ВОРКЕРА:\n${outputText}`;

      const { response } = await generateContentWithRetryAndFallback(ai, {
        contents: `${checkInstruction}\n\nПроверь следующий материал и верни структурированный вердикт на русском языке:\n\n${targetContent}`,
        config: {
          systemInstruction:
            'Ты — автоматический инспектор пайплайна ECC (hook validator). Отвечай кратко, объективно и строго по заданному критерию.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              passed: { type: Type.BOOLEAN },
              summary: { type: Type.STRING },
              details: { type: Type.STRING },
            },
            required: ['passed', 'summary'],
          },
        },
      });

      const raw = (response.text ?? '{}').trim();
      const parsed = JSON.parse(raw) as {
        passed?: boolean;
        summary?: string;
        details?: string;
      };

      res.json({
        hookId,
        hookName,
        phase,
        severity,
        passed: Boolean(parsed.passed),
        summary: parsed.summary || 'Проверка завершена.',
        details: parsed.details || '',
      });
    } catch (err: unknown) {
      res.status(500).json({
        hookId,
        hookName,
        phase,
        severity,
        passed: false,
        summary: 'Ошибка запуска хука',
        details: formatGeminiErrorRussian(err),
      });
    }
  });

  const httpServer = http.createServer(app);

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: process.env.DISABLE_HMR !== 'true' ? { server: httpServer } : false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ECC Worker Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
