import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  History,
  Play,
  ShieldAlert,
  Square,
  Trash2,
} from 'lucide-react';
import { ClipboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AttachedFileItem,
  EccCommand,
  EccHook,
  EccRule,
  EccSkill,
  HookExecutionResult,
  RunSession,
  ThinkingLevelOption,
  WorkerAgent,
} from '../types/ecc';
import { assembleWorkerSystemPrompt, formatDurationMs } from '../utils/eccComposer';
import { processSelectedFiles } from '../utils/fileAttachments';
import { AttachmentDropHelper } from './AttachmentDropzone';

interface RunnerViewProps {
  agents: WorkerAgent[];
  rules: EccRule[];
  skills: EccSkill[];
  commands: EccCommand[];
  hooks: EccHook[];
  selectedAgentId: string;
  onSelectAgentId: (id: string) => void;
  pendingCommandId: string | null;
  onConsumePendingCommand: () => void;
  runHistory: RunSession[];
  onSaveRun: (session: RunSession) => void;
  onClearHistory: () => void;
}

export function RunnerView({
  agents,
  rules,
  skills,
  commands,
  hooks,
  selectedAgentId,
  onSelectAgentId,
  pendingCommandId,
  onConsumePendingCommand,
  runHistory,
  onSaveRun,
  onClearHistory,
}: RunnerViewProps) {
  const activeAgent = agents.find((a) => a.id === selectedAgentId) ?? agents[0];

  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevelOption>(
    activeAgent?.defaultThinkingLevel ?? 'HIGH'
  );
  const [selectedCommand, setSelectedCommand] = useState<string>('');
  const [userInput, setUserInput] = useState<string>('');
  const [attachments, setAttachments] = useState<AttachedFileItem[]>([]);
  const [enabledHookIds, setEnabledHookIds] = useState<string[]>(
    activeAgent?.attachedHookIds ?? []
  );

  const [isRunning, setIsRunning] = useState(false);
  const [statusPhase, setStatusPhase] = useState<string>('');
  const [outputText, setOutputText] = useState<string>('');
  const [hookResults, setHookResults] = useState<HookExecutionResult[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const [copiedOutput, setCopiedOutput] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (activeAgent) {
      setThinkingLevel(activeAgent.defaultThinkingLevel);
      setEnabledHookIds(activeAgent.attachedHookIds);
    }
  }, [activeAgent?.id]);

  useEffect(() => {
    if (!pendingCommandId) return;
    const cmd = commands.find((c) => c.id === pendingCommandId);
    if (cmd) {
      onSelectAgentId(cmd.targetAgentId);
      setSelectedCommand(cmd.command);
      setThinkingLevel(cmd.recommendedThinkingLevel);
      setUserInput(cmd.promptTemplate);
    }
    onConsumePendingCommand();
  }, [pendingCommandId, commands, onSelectAgentId, onConsumePendingCommand]);

  const assembledPrompt = useMemo(() => {
    if (!activeAgent) return '';
    return assembleWorkerSystemPrompt(activeAgent, rules, skills);
  }, [activeAgent, rules, skills]);

  const applyCommandPreset = (cmdId: string) => {
    const cmd = commands.find((c) => c.id === cmdId);
    if (!cmd) {
      setSelectedCommand('');
      return;
    }
    onSelectAgentId(cmd.targetAgentId);
    setSelectedCommand(cmd.command);
    setThinkingLevel(cmd.recommendedThinkingLevel);
    setUserInput(cmd.promptTemplate);
  };

  const toggleHook = (hookId: string) => {
    setEnabledHookIds((prev) =>
      prev.includes(hookId) ? prev.filter((id) => id !== hookId) : [...prev, hookId]
    );
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedFiles = Array.from(e.clipboardData.files);
    if (pastedFiles.length > 0) {
      e.preventDefault();
      const { items, errors } = await processSelectedFiles(pastedFiles);
      if (errors.length > 0) setErrorMsg(errors.join(' '));
      if (items.length > 0) setAttachments((prev) => [...prev, ...items]);
    }
  };

  const runHookRequest = async (
    hook: EccHook,
    payload: { userInput: string; outputText?: string },
    signal: AbortSignal
  ): Promise<HookExecutionResult> => {
    const resp = await fetch('/api/worker/hook-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        hookId: hook.id,
        hookName: hook.name,
        phase: hook.phase,
        severity: hook.severity,
        checkInstruction: hook.checkInstruction,
        userInput: payload.userInput,
        outputText: payload.outputText ?? '',
      }),
    });

    const data = (await resp.json()) as HookExecutionResult;
    return data;
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsRunning(false);
    setStatusPhase('Остановлено пользователем');
  };

  const handleRun = async () => {
    if (!activeAgent || (!userInput.trim() && attachments.length === 0) || isRunning) {
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const startTime = performance.now();

    setIsRunning(true);
    setErrorMsg('');
    setOutputText('');
    setHookResults([]);
    setLastDurationMs(null);

    const activeHooks = hooks.filter((h) => enabledHookIds.includes(h.id));
    const preHooks = activeHooks.filter((h) => h.phase === 'pre-run');
    const postHooks = activeHooks.filter((h) => h.phase === 'post-run');

    const collectedHookResults: HookExecutionResult[] = [];

    try {
      if (preHooks.length > 0 && userInput.trim()) {
        setStatusPhase('Выполнение pre-run проверок...');
        for (const hook of preHooks) {
          const result = await runHookRequest(
            hook,
            { userInput },
            controller.signal
          );
          collectedHookResults.push(result);
          setHookResults([...collectedHookResults]);

          if (!result.passed && result.severity === 'block') {
            setErrorMsg(`Выполнение заблокировано хуком «${hook.name}»: ${result.summary}`);
            setIsRunning(false);
            setStatusPhase('');
            return;
          }
        }
      }

      setStatusPhase(`Генерация ответа (${activeAgent.slug})...`);
      const response = await fetch('/api/worker/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: assembledPrompt,
          userInput,
          thinkingLevel,
          attachments: attachments.map((a) => ({
            name: a.name,
            mimeType: a.mimeType,
            kind: a.kind,
            base64Data: a.base64Data,
            textContent: a.textContent,
          })),
        }),
      });

      if (!response.ok) {
        const errData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || `Ошибка сервера (${response.status})`);
      }

      if (!response.body) {
        throw new Error('Сервер не вернул поток данных.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullOutput = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const lines = frame.split('\n');
          let eventType = 'message';
          let dataLine = '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLine += line.slice(5).trim();
            }
          }

          if (!dataLine) continue;
          const parsed = JSON.parse(dataLine) as { text?: string; message?: string };

          if (eventType === 'meta' && parsed.message) {
            setStatusPhase(parsed.message);
          } else if (eventType === 'chunk' && parsed.text) {
            fullOutput += parsed.text;
            setOutputText(fullOutput);
          } else if (eventType === 'error') {
            throw new Error(parsed.message || 'Ошибка потоковой генерации Gemini API.');
          }
        }
      }

      if (postHooks.length > 0 && fullOutput.trim()) {
        setStatusPhase('Запуск post-run аудита...');
        for (const hook of postHooks) {
          const result = await runHookRequest(
            hook,
            { userInput, outputText: fullOutput },
            controller.signal
          );
          collectedHookResults.push(result);
          setHookResults([...collectedHookResults]);
        }
      }

      const elapsed = Math.round(performance.now() - startTime);
      setLastDurationMs(elapsed);
      setStatusPhase('');

      const session: RunSession = {
        id: `run-${Date.now()}`,
        agentId: activeAgent.id,
        agentName: activeAgent.name,
        commandUsed: selectedCommand || undefined,
        thinkingLevel,
        userInput: userInput || `[Вложения: ${attachments.map((a) => a.name).join(', ')}]`,
        assembledPrompt,
        outputText: fullOutput,
        hookResults: collectedHookResults,
        durationMs: elapsed,
        createdAt: new Date().toISOString(),
      };
      onSaveRun(session);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Неизвестная ошибка при запуске воркера.';
      setErrorMsg(message);
      setStatusPhase('');
    } finally {
      setIsRunning(false);
    }
  };

  const handleLoadHistorySession = (session: RunSession) => {
    onSelectAgentId(session.agentId);
    setThinkingLevel(session.thinkingLevel);
    setSelectedCommand(session.commandUsed ?? '');
    setUserInput(session.userInput);
    setOutputText(session.outputText);
    setHookResults(session.hookResults);
    setLastDurationMs(session.durationMs);
    setErrorMsg(session.error ?? '');
  };

  const handleCopyOutput = async () => {
    if (!outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopiedOutput(true);
      setTimeout(() => setCopiedOutput(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <section className="xl:col-span-5 bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-zinc-200 dark:border-slate-800">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-slate-100">
              Параметры запуска воркера
            </h2>
            <span className="font-mono text-xs text-zinc-500 dark:text-slate-400">
              gemini-4-hydrogen
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                Активный воркер
              </span>
              <select
                value={activeAgent?.id ?? ''}
                onChange={(e) => onSelectAgentId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                Глубина рассуждений
              </span>
              <select
                value={thinkingLevel}
                onChange={(e) => setThinkingLevel(e.target.value as ThinkingLevelOption)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
              >
                <option value="LOW">LOW · Минимальная задержка</option>
                <option value="MEDIUM">MEDIUM · Средняя</option>
                <option value="HIGH">HIGH · Глубокий анализ</option>
                <option value="XHIGH">XHIGH · Максимум</option>
              </select>
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
              Быстрая команда ECC
            </span>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {commands.slice(0, 12).map((cmd) => (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => applyCommandPreset(cmd.id)}
                  className={`px-2.5 py-1 rounded-md font-mono text-xs border transition-colors whitespace-nowrap ${
                    selectedCommand === cmd.command
                      ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-700'
                      : 'border-zinc-200 dark:border-slate-700 text-zinc-700 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {cmd.command}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <span className="text-xs font-medium text-zinc-700 dark:text-slate-300 block">
              Задача и файлы для воркера
            </span>
            <textarea
              rows={7}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onPaste={handlePaste}
              placeholder="Опишите инженерную задачу, вставьте код или прикрепите любые файлы (фото, видео, аудио, PDF, код)..."
              className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-950 text-sm leading-relaxed text-zinc-900 dark:text-slate-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
            />
            <AttachmentDropHelper
              attachments={attachments}
              onAddAttachments={(items) => setAttachments((prev) => [...prev, ...items])}
              onRemoveAttachment={(id) =>
                setAttachments((prev) => prev.filter((a) => a.id !== id))
              }
              onError={setErrorMsg}
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-slate-800">
            <span className="text-xs font-medium text-zinc-700 dark:text-slate-300 block">
              Проверки пайплайна (Hooks)
            </span>
            <div className="space-y-1.5">
              {hooks.map((hook) => (
                <label
                  key={hook.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-800 hover:bg-zinc-50 dark:hover:bg-slate-800/40 cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={enabledHookIds.includes(hook.id)}
                      onChange={() => toggleHook(hook.id)}
                      className="rounded border-zinc-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span className="text-xs text-zinc-800 dark:text-slate-200 truncate">
                      {hook.name}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400 dark:text-slate-500 shrink-0">
                    {hook.phase}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            {!isRunning ? (
              <button
                type="button"
                disabled={(!userInput.trim() && attachments.length === 0) || !activeAgent}
                onClick={handleRun}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                <Play className="h-4 w-4" />
                <span>Запустить воркера</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStop}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors whitespace-nowrap"
              >
                <Square className="h-4 w-4" />
                <span>Остановить выполнение</span>
              </button>
            )}
          </div>
        </section>

        <section className="xl:col-span-7 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-slate-100">
                <span>Результат выполнения</span>
                {lastDurationMs !== null && (
                  <span className="font-mono text-xs font-normal text-zinc-500 dark:text-slate-400 tabular-nums">
                    · {formatDurationMs(lastDurationMs)}
                  </span>
                )}
              </div>

              {outputText && (
                <button
                  type="button"
                  onClick={handleCopyOutput}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-slate-700 text-xs font-medium text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  {copiedOutput ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Скопировано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Копировать ответ</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="p-5 min-h-[340px]">
              {errorMsg && (
                <div className="mb-4 p-3.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 flex flex-wrap items-start justify-between gap-3 text-sm text-red-800 dark:text-red-200">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                    <div>
                      <div className="font-medium">Выполнение прервано</div>
                      <p className="mt-0.5 text-xs leading-relaxed">{errorMsg}</p>
                    </div>
                  </div>
                  {!isRunning && (userInput.trim() || attachments.length > 0) && (
                    <button
                      type="button"
                      onClick={() => void handleRun()}
                      className="px-3 py-1.5 rounded-lg bg-red-700 text-white text-xs font-medium hover:bg-red-800 whitespace-nowrap shrink-0"
                    >
                      Повторить
                    </button>
                  )}
                </div>
              )}

              {isRunning && !outputText && (
                <div className="space-y-3 py-4">
                  <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
                    {statusPhase || 'Подготовка запроса...'}
                  </div>
                  <div className="h-4 w-3/4 rounded bg-zinc-200 dark:bg-slate-800 animate-pulse" />
                  <div className="h-4 w-full rounded bg-zinc-200 dark:bg-slate-800 animate-pulse" />
                  <div className="h-4 w-5/6 rounded bg-zinc-200 dark:bg-slate-800 animate-pulse" />
                </div>
              )}

              {!isRunning && !outputText && !errorMsg && (
                <div className="py-12 text-center space-y-3">
                  <p className="text-sm text-zinc-600 dark:text-slate-300">
                    Выберите воркера слева, введите задачу или прикрепите файлы и запустите проверку.
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-slate-500 max-w-md mx-auto">
                    Поддерживаются изображения, видео, аудио, PDF и любые текстовые/исходные файлы.
                  </p>
                </div>
              )}

              {outputText && (
                <div className="space-y-3">
                  {isRunning && statusPhase && (
                    <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
                      {statusPhase}
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-900 dark:text-slate-100 overflow-x-auto">
                    {outputText}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {hookResults.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100">
                Отчёт проверок пайплайна (Hooks)
              </h3>
              <div className="divide-y divide-zinc-200 dark:divide-slate-800">
                {hookResults.map((hr, idx) => (
                  <div
                    key={`${hr.hookId}-${idx}`}
                    className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      {hr.passed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle
                          className={`h-4 w-4 mt-0.5 shrink-0 ${
                            hr.severity === 'block'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-zinc-900 dark:text-slate-100">
                          {hr.hookName}
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-600 dark:text-slate-400">
                          {hr.summary}
                        </p>
                        {hr.details && (
                          <p className="mt-1 text-xs text-zinc-500 dark:text-slate-500">
                            {hr.details}
                          </p>
                        )}
                      </div>
                    </div>

                    <span
                      className={`text-xs font-medium shrink-0 whitespace-nowrap ${
                        hr.passed
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : hr.severity === 'block'
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {hr.passed
                        ? 'Пройдено'
                        : hr.severity === 'block'
                        ? 'Блокировано'
                        : 'Предупреждение'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-slate-100">
                <History className="h-4 w-4 text-zinc-400 dark:text-slate-500" />
                <span>История запусков ({runHistory.length})</span>
              </div>
              {runHistory.length > 0 && (
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Очистить</span>
                </button>
              )}
            </div>

            {runHistory.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-slate-400 py-2">
                История пока пуста — здесь появятся ваши тестовые прогоны воркеров.
              </p>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {runHistory.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleLoadHistorySession(item)}
                    className="w-full text-left py-2.5 px-2 rounded-md hover:bg-zinc-50 dark:hover:bg-slate-800/50 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-900 dark:text-slate-100 truncate">
                        {item.agentName}
                        {item.commandUsed ? ` · ${item.commandUsed}` : ''}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-slate-400 truncate mt-0.5">
                        {item.userInput}
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-zinc-400 dark:text-slate-500 tabular-nums shrink-0">
                      {formatDurationMs(item.durationMs)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
