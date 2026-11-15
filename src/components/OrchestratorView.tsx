import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  FolderGit2,
  History,
  MessageSquare,
  Play,
  Send,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { ClipboardEvent, DragEvent, useMemo, useRef, useState } from 'react';
import {
  AttachedFileItem,
  DeputyStepReview,
  EccRule,
  EccSkill,
  FilePatchRecord,
  OrchestratorChatMessage,
  OrchestratorMode,
  OrchestratorSession,
  OrchestratorStep,
  SandboxCheckItem,
  SandboxDiffResult,
  SandboxWorkspaceInfo,
  StaffingAction,
  WorkerAgent,
} from '../types/ecc';
import { assembleWorkerSystemPrompt, formatDurationMs } from '../utils/eccComposer';
import { processSelectedFiles } from '../utils/fileAttachments';
import { AttachmentList, AttachmentPickerButton } from './AttachmentDropzone';

interface OrchestratorViewProps {
  agents: WorkerAgent[];
  rules: EccRule[];
  skills: EccSkill[];
  orchestratorHistory: OrchestratorSession[];
  onHireAgent: (agentId: string, reason: string, actor: StaffingAction['actor']) => void;
  onFireAgent: (agentId: string, reason: string, actor: StaffingAction['actor']) => void;
  onCreateCustomAgent: (
    agent: WorkerAgent,
    reason: string,
    actor: StaffingAction['actor']
  ) => void;
  onSaveSession: (session: OrchestratorSession) => void;
  onClearHistory: () => void;
  onOpenRoster: () => void;
}

interface PlanApiResponse {
  analysis: string;
  deputyPlannerNote?: string;
  staffingActions: Array<{
    actionType: 'hire' | 'fire' | 'create_custom';
    agentSlug: string;
    agentName: string;
    roleSummary?: string;
    customSystemPrompt?: string;
    reason: string;
  }>;
  steps: Array<{
    title: string;
    assignedAgentSlug: string;
    instructionForAgent: string;
    targetFiles?: string[];
  }>;
}

export function OrchestratorView({
  agents,
  rules,
  skills,
  orchestratorHistory,
  onHireAgent,
  onFireAgent,
  onCreateCustomAgent,
  onSaveSession,
  onClearHistory,
  onOpenRoster,
}: OrchestratorViewProps) {
  // Workspace tabs: Chat with Orchestrator | Pipeline & Plan | Code Diff & Tests
  const [centerTab, setCenterTab] = useState<'chat' | 'pipeline' | 'code'>('chat');

  // GitHub / ZIP Sandbox connection state
  const [githubUrl, setGithubUrl] = useState('');
  const [githubBranch, setGithubBranch] = useState('');
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandbox, setSandbox] = useState<SandboxWorkspaceInfo | null>(null);
  const [previewFilePath, setPreviewFilePath] = useState<string>('');
  const [previewFileContent, setPreviewFileContent] = useState<string>('');
  const [sandboxDiff, setSandboxDiff] = useState<SandboxDiffResult | null>(null);
  const [sandboxChecks, setSandboxChecks] = useState<SandboxCheckItem[]>([]);
  const [checksRunning, setChecksRunning] = useState(false);

  // Composer: text + universal file attachments (images, video, audio, PDF, code, ZIP)
  const [composerText, setComposerText] = useState('');
  const [attachments, setAttachments] = useState<AttachedFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Direct Chat with Orchestrator
  const [chatMessages, setChatMessages] = useState<OrchestratorChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'orchestrator',
      text: 'Привет! Я Главный Оркестратор. Вы можете общаться со мной прямо здесь: прикрепите ссылку на публичный GitHub-репозиторий сверху, перетащите сюда любые файлы (скриншоты, видео, аудио, PDF, код или ZIP-архив) и напишите задачу. Можно просто обсудить архитектуру кнопкой «Написать Оркестратору», а можно нажать «Запустить цикл» — тогда команда проведёт аналитику, покажет план на ваше подтверждение, отредактирует код и проверит сборку.',
      createdAt: new Date().toISOString(),
    },
  ]);

  // Orchestrator settings & pipeline state
  const [mode, setMode] = useState<OrchestratorMode>('autonomous');
  const [useDeputyPlanner, setUseDeputyPlanner] = useState(true);
  const [useDeputyQa, setUseDeputyQa] = useState(true);

  const [isRunning, setIsRunning] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastFailedKind, setLastFailedKind] = useState<'chat' | 'pipeline' | null>(null);

  const [activeTaskTitle, setActiveTaskTitle] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [deputyPlannerNote, setDeputyPlannerNote] = useState('');
  const [staffingLog, setStaffingLog] = useState<StaffingAction[]>([]);
  const [steps, setSteps] = useState<OrchestratorStep[]>([]);
  const [planAwaitingConfirm, setPlanAwaitingConfirm] = useState(false);
  const [planAdjustmentNote, setPlanAdjustmentNote] = useState('');

  const [finalSynthesis, setFinalSynthesis] = useState('');
  const [totalDurationMs, setTotalDurationMs] = useState<number | null>(null);
  const [copiedFinal, setCopiedFinal] = useState(false);
  const [manualHireId, setManualHireId] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const approvalResolverRef = useRef<((approved: boolean) => void) | null>(null);
  const [awaitingApprovalId, setAwaitingApprovalId] = useState<string | null>(null);
  const planConfirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  // Refs for latest pipeline inputs so confirmed plan continues smoothly
  const pipelineContextRef = useRef<{
    taskText: string;
    taskAttachments: AttachedFileItem[];
    workingAgents: WorkerAgent[];
    localStaffLog: StaffingAction[];
    planAnalysis: string;
    t0: number;
  } | null>(null);

  const activeAgents = useMemo(
    () => agents.filter((a) => a.rosterStatus === 'active'),
    [agents]
  );
  const reserveAgents = useMemo(
    () => agents.filter((a) => a.rosterStatus === 'bench'),
    [agents]
  );

  const findAgentBySlug = (slug: string, list: WorkerAgent[]) => {
    const clean = slug.trim().toLowerCase();
    return (
      list.find((a) => a.slug.toLowerCase() === clean) ??
      list.find(
        (a) =>
          a.slug.toLowerCase().replace(/^ecc:/, '') === clean.replace(/^ecc:/, '')
      )
    );
  };

  // --- Sandbox Handlers ---

  const handleCloneGithub = async () => {
    if (!githubUrl.trim() || sandboxLoading) return;
    setSandboxLoading(true);
    setErrorMsg('');
    try {
      const resp = await fetch('/api/sandbox/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: githubUrl.trim(),
          branch: githubBranch.trim() || undefined,
        }),
      });
      const data = (await resp.json()) as SandboxWorkspaceInfo & { error?: string };
      if (!resp.ok) {
        throw new Error(data.error || 'Не удалось клонировать репозиторий.');
      }
      setSandbox(data);
      setSandboxDiff(null);
      setSandboxChecks([]);
      setPreviewFilePath('');
      setPreviewFileContent('');
      setChatMessages((prev) => [
        ...prev,
        {
          id: `sys-repo-${Date.now()}`,
          role: 'orchestrator',
          text: `Репозиторий **${data.sourceLabel}** (ветка \`${data.branch ?? 'main'}\`) подключён в песочницу. Обнаружено файлов: ${data.totalFiles}. Теперь можно задавать вопросы по коду в чате или запустить цикл доработки.`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка подключения GitHub.');
    } finally {
      setSandboxLoading(false);
    }
  };

  const handleUnpackZipAttachment = async (zipItem: AttachedFileItem) => {
    if (!zipItem.base64Data || sandboxLoading) return;
    setSandboxLoading(true);
    setErrorMsg('');
    try {
      const resp = await fetch('/api/sandbox/upload-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Data: zipItem.base64Data,
          name: zipItem.name,
        }),
      });
      const data = (await resp.json()) as SandboxWorkspaceInfo & { error?: string };
      if (!resp.ok) throw new Error(data.error || 'Не удалось распаковать ZIP.');
      setSandbox(data);
      setSandboxDiff(null);
      setSandboxChecks([]);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `sys-zip-${Date.now()}`,
          role: 'orchestrator',
          text: `ZIP-архив **${data.sourceLabel}** распакован в песочницу (${data.totalFiles} файлов). Готов к аналитике и доработкам.`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка распаковки ZIP.');
    } finally {
      setSandboxLoading(false);
    }
  };

  const handlePreviewSandboxFile = async (relPath: string) => {
    if (!sandbox || !relPath) return;
    setPreviewFilePath(relPath);
    try {
      const resp = await fetch(
        `/api/sandbox/${sandbox.sandboxId}/file?path=${encodeURIComponent(relPath)}`
      );
      const data = (await resp.json()) as { content?: string; error?: string };
      setPreviewFileContent(data.content ?? data.error ?? '');
    } catch {
      setPreviewFileContent('Не удалось прочитать файл.');
    }
  };

  const refreshSandboxDiff = async (sandboxId: string): Promise<SandboxDiffResult | null> => {
    try {
      const resp = await fetch(`/api/sandbox/${sandboxId}/diff`);
      if (!resp.ok) return null;
      const data = (await resp.json()) as SandboxDiffResult;
      setSandboxDiff(data);
      return data;
    } catch {
      return null;
    }
  };

  const handleRunSandboxChecks = async (sandboxId: string): Promise<SandboxCheckItem[]> => {
    setChecksRunning(true);
    try {
      const resp = await fetch(`/api/sandbox/${sandboxId}/check`, {
        method: 'POST',
      });
      const data = (await resp.json()) as { results?: SandboxCheckItem[] };
      const list = Array.isArray(data.results) ? data.results : [];
      setSandboxChecks(list);
      return list;
    } catch {
      return [];
    } finally {
      setChecksRunning(false);
    }
  };

  // --- Drag/Drop & Paste Universal File Handlers ---

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const { items, errors } = await processSelectedFiles(e.dataTransfer.files);
      if (errors.length > 0) setErrorMsg(errors.join(' '));
      if (items.length > 0) {
        setAttachments((prev) => [...prev, ...items]);
        const zipItem = items.find((i) => i.kind === 'zip');
        if (zipItem) void handleUnpackZipAttachment(zipItem);
      }
    }
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

  // --- SSE Streaming Helper ---

  const streamSseText = async (
    url: string,
    payload: unknown,
    signal: AbortSignal,
    onChunk: (fullText: string) => void
  ): Promise<string> => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error || `Ошибка сервера (${response.status})`);
    }
    if (!response.body) throw new Error('Пустой поток ответа.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const lines = frame.split('\n');
        let evt = 'message';
        let dataLine = '';
        for (const line of lines) {
          if (line.startsWith('event:')) evt = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
        }
        if (!dataLine) continue;
        const parsed = JSON.parse(dataLine) as { text?: string; message?: string };
        if (evt === 'meta' && parsed.message) {
          setPhaseLabel(parsed.message);
        } else if (evt === 'chunk' && parsed.text) {
          full += parsed.text;
          onChunk(full);
        } else if (evt === 'error') {
          throw new Error(parsed.message || 'Ошибка генерации Gemini.');
        }
      }
    }
    return full;
  };

  // --- Direct Chat with Orchestrator Lead ---

  const handleSendChat = async () => {
    if ((!composerText.trim() && attachments.length === 0) || isRunning) return;

    const currentText = composerText.trim();
    const currentAttachments = [...attachments];
    setComposerText('');
    setAttachments([]);
    setErrorMsg('');
    setLastFailedKind(null);
    setCenterTab('chat');

    const userMsg: OrchestratorChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      text: currentText || '(Отправлены вложения)',
      attachments: currentAttachments.map((a) => ({
        name: a.name,
        kind: a.kind,
        size: a.size,
        previewUrl: a.previewUrl,
      })),
      createdAt: new Date().toISOString(),
    };

    const replyId = `msg-o-${Date.now() + 1}`;
    const placeholderReply: OrchestratorChatMessage = {
      id: replyId,
      role: 'orchestrator',
      text: '',
      createdAt: new Date().toISOString(),
    };

    const historySnapshot = chatMessages.map((m) => ({
      role: m.role,
      text: m.text,
    }));

    setChatMessages((prev) => [...prev, userMsg, placeholderReply]);
    setIsRunning(true);
    setPhaseLabel('Главный Оркестратор отвечает...');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamSseText(
        '/api/orchestrator/chat',
        {
          message: currentText,
          history: historySnapshot,
          attachments: currentAttachments.map((a) => ({
            name: a.name,
            mimeType: a.mimeType,
            kind: a.kind,
            base64Data: a.base64Data,
            textContent: a.textContent,
          })),
          sandboxId: sandbox?.sandboxId,
          activeAgents: activeAgents.map((a) => ({
            id: a.id,
            slug: a.slug,
            name: a.name,
            roleSummary: a.roleSummary,
          })),
          reserveAgents: reserveAgents.map((a) => ({
            id: a.id,
            slug: a.slug,
            name: a.name,
            roleSummary: a.roleSummary,
          })),
        },
        controller.signal,
        (partial) => {
          setChatMessages((prev) =>
            prev.map((m) => (m.id === replyId ? { ...m, text: partial } : m))
          );
        }
      );
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : 'Ошибка диалога с Оркестратором.';
        setErrorMsg(msg);
        setLastFailedKind('chat');
        setChatMessages((prev) => {
          const reply = prev.find((m) => m.id === replyId);
          if (reply && !reply.text) {
            return prev.filter((m) => m.id !== replyId && m.id !== userMsg.id);
          }
          return prev;
        });
        setComposerText((prev) => (prev.trim() ? prev : currentText));
        if (currentAttachments.length > 0) {
          setAttachments((prev) => (prev.length > 0 ? prev : currentAttachments));
        }
      }
    } finally {
      setIsRunning(false);
      setPhaseLabel('');
    }
  };

  // --- Staffing Helpers ---

  const waitForUserApproval = (actionId: string): Promise<boolean> => {
    setAwaitingApprovalId(actionId);
    return new Promise((resolve) => {
      approvalResolverRef.current = resolve;
    });
  };

  const handleDecisionClick = (actionId: string, approved: boolean) => {
    setStaffingLog((prev) =>
      prev.map((a) =>
        a.id === actionId ? { ...a, status: approved ? 'applied' : 'rejected' } : a
      )
    );
    setAwaitingApprovalId(null);
    approvalResolverRef.current?.(approved);
    approvalResolverRef.current = null;
  };

  const applyStaffingDecision = (
    rawAction: {
      actionType: 'hire' | 'fire' | 'create_custom';
      agentSlug: string;
      agentName: string;
      roleSummary?: string;
      customSystemPrompt?: string;
      reason: string;
    },
    actor: StaffingAction['actor'],
    workingAgents: WorkerAgent[]
  ): { logItem: StaffingAction } => {
    const existing = findAgentBySlug(rawAction.agentSlug, workingAgents);

    if (rawAction.actionType === 'hire' && existing) {
      onHireAgent(existing.id, rawAction.reason, actor);
      existing.rosterStatus = 'active';
      return {
        logItem: {
          id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'hire',
          agentId: existing.id,
          agentSlug: existing.slug,
          agentName: existing.name,
          reason: rawAction.reason,
          actor,
          status: 'applied',
          timestamp: new Date().toISOString(),
        },
      };
    }

    if (rawAction.actionType === 'fire' && existing) {
      onFireAgent(existing.id, rawAction.reason, actor);
      existing.rosterStatus = 'bench';
      return {
        logItem: {
          id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'fire',
          agentId: existing.id,
          agentSlug: existing.slug,
          agentName: existing.name,
          reason: rawAction.reason,
          actor,
          status: 'applied',
          timestamp: new Date().toISOString(),
        },
      };
    }

    const slug = rawAction.agentSlug.includes(':')
      ? rawAction.agentSlug
      : `custom:${rawAction.agentSlug}`;
    const newAgent: WorkerAgent = {
      id: `agent-orch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      slug,
      name: rawAction.agentName || slug,
      roleSummary:
        rawAction.roleSummary || 'Специализированный агент, нанятый Оркестратором под задачу.',
      systemPrompt:
        rawAction.customSystemPrompt ||
        `Ты — узкопрофильный специалист ${rawAction.agentName}.\nВыполняй свою часть задачи максимально точно и структурированно.`,
      defaultThinkingLevel: 'HIGH',
      rosterStatus: 'active',
      attachedRuleIds: rules.filter((r) => r.alwaysApply).map((r) => r.id),
      attachedSkillIds: [],
      attachedHookIds: ['hook-pre-secret-guard', 'hook-post-security-scan'],
      isCustom: true,
      source: 'orchestrator-hired',
    };
    onCreateCustomAgent(newAgent, rawAction.reason, actor);
    workingAgents.unshift(newAgent);

    return {
      logItem: {
        id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'create_custom',
        agentId: newAgent.id,
        agentSlug: newAgent.slug,
        agentName: newAgent.name,
        roleSummary: newAgent.roleSummary,
        systemPrompt: newAgent.systemPrompt,
        reason: rawAction.reason,
        actor,
        status: 'applied',
        timestamp: new Date().toISOString(),
      },
    };
  };

  // --- Full 4-Phase Engineering Pipeline (Analytics -> Plan Gate -> Execute/Edit/Test -> Final) ---

  const handleStop = () => {
    abortRef.current?.abort();
    approvalResolverRef.current?.(false);
    approvalResolverRef.current = null;
    planConfirmResolverRef.current?.(false);
    planConfirmResolverRef.current = null;
    setAwaitingApprovalId(null);
    setPlanAwaitingConfirm(false);
    setIsRunning(false);
    setPhaseLabel('Остановлено пользователем');
  };

  const handleConfirmPlanClick = (confirmed: boolean) => {
    setPlanAwaitingConfirm(false);
    planConfirmResolverRef.current?.(confirmed);
    planConfirmResolverRef.current = null;
  };

  const handleStartFullPipeline = async (overrideTask?: string) => {
    const taskText = (overrideTask ?? composerText).trim();
    const currentAttachments = [...attachments];
    if ((!taskText && currentAttachments.length === 0) || isRunning) return;

    if (!overrideTask) {
      setComposerText('');
      setAttachments([]);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const t0 = performance.now();

    setCenterTab('pipeline');
    setIsRunning(true);
    setErrorMsg('');
    setActiveTaskTitle(taskText || 'Анализ и доработка по прикреплённым материалам');
    setAnalysis('');
    setDeputyPlannerNote('');
    setStaffingLog([]);
    setSteps([]);
    setFinalSynthesis('');
    setTotalDurationMs(null);
    setPlanAwaitingConfirm(false);
    setPlanAdjustmentNote('');

    const workingAgents: WorkerAgent[] = agents.map((a) => ({ ...a }));
    const localStaffLog: StaffingAction[] = [];

    const serializedAttachments = currentAttachments.map((a) => ({
      name: a.name,
      mimeType: a.mimeType,
      kind: a.kind,
      base64Data: a.base64Data,
      textContent: a.textContent,
    }));

    try {
      setPhaseLabel('Фаза 1: Аналитика проекта и подбор команды...');

      const planResp = await fetch('/api/orchestrator/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          task: taskText,
          sandboxId: sandbox?.sandboxId,
          attachments: serializedAttachments,
          activeAgents: workingAgents
            .filter((a) => a.rosterStatus === 'active')
            .map((a) => ({
              id: a.id,
              slug: a.slug,
              name: a.name,
              roleSummary: a.roleSummary,
            })),
          reserveAgents: workingAgents
            .filter((a) => a.rosterStatus === 'bench')
            .map((a) => ({
              id: a.id,
              slug: a.slug,
              name: a.name,
              roleSummary: a.roleSummary,
            })),
          useDeputyPlanner,
          useDeputyQa,
        }),
      });

      if (!planResp.ok) {
        const err = (await planResp.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || 'Не удалось выполнить аналитику и составить план.');
      }

      const plan = (await planResp.json()) as PlanApiResponse;
      setAnalysis(plan.analysis || '');
      setDeputyPlannerNote(plan.deputyPlannerNote || '');

      for (const rawAct of plan.staffingActions ?? []) {
        const existing = findAgentBySlug(rawAct.agentSlug, workingAgents);
        if (rawAct.actionType === 'hire' && existing?.rosterStatus === 'active') continue;
        if (rawAct.actionType === 'fire' && existing?.rosterStatus === 'bench') continue;

        if (mode === 'supervised') {
          const pendingId = `staff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const pendingItem: StaffingAction = {
            id: pendingId,
            type: rawAct.actionType,
            agentId: existing?.id ?? pendingId,
            agentSlug: rawAct.agentSlug,
            agentName: existing?.name ?? rawAct.agentName,
            roleSummary: rawAct.roleSummary,
            systemPrompt: rawAct.customSystemPrompt,
            reason: rawAct.reason,
            actor: 'Orchestrator Lead',
            status: 'pending',
            timestamp: new Date().toISOString(),
          };
          localStaffLog.push(pendingItem);
          setStaffingLog([...localStaffLog]);
          setPhaseLabel(`Подтвердите кадровое решение: ${rawAct.actionType} ${rawAct.agentSlug}...`);
          const approved = await waitForUserApproval(pendingId);
          if (controller.signal.aborted) return;

          if (approved) {
            applyStaffingDecision(rawAct, 'Orchestrator Lead', workingAgents);
            pendingItem.status = 'applied';
          } else {
            pendingItem.status = 'rejected';
          }
          setStaffingLog([...localStaffLog]);
        } else {
          const { logItem } = applyStaffingDecision(
            rawAct,
            'Orchestrator Lead',
            workingAgents
          );
          localStaffLog.push(logItem);
          setStaffingLog([...localStaffLog]);
        }
      }

      const executionQueue: OrchestratorStep[] = (plan.steps ?? []).map((s, idx) => {
        const resolved =
          findAgentBySlug(s.assignedAgentSlug, workingAgents) ??
          workingAgents.find((a) => a.rosterStatus === 'active') ??
          workingAgents[0];
        return {
          stepId: `step-${idx + 1}`,
          title: s.title,
          assignedAgentId: resolved.id,
          assignedAgentSlug: resolved.slug,
          assignedAgentName: resolved.name,
          instructionForAgent: s.instructionForAgent,
          targetFiles: Array.isArray(s.targetFiles) ? s.targetFiles : [],
          status: 'pending',
        };
      });
      setSteps([...executionQueue]);

      pipelineContextRef.current = {
        taskText,
        taskAttachments: currentAttachments,
        workingAgents,
        localStaffLog,
        planAnalysis: plan.analysis || '',
        t0,
      };

      // --- Phase 2: Plan Confirmation Gate ---
      setPhaseLabel('Фаза 2: Ожидание вашего подтверждения плана...');
      setPlanAwaitingConfirm(true);
      const userConfirmed = await new Promise<boolean>((resolve) => {
        planConfirmResolverRef.current = resolve;
      });
      if (controller.signal.aborted) return;

      if (!userConfirmed) {
        setPhaseLabel('План отклонён или отправлен на переработку.');
        setIsRunning(false);
        return;
      }

      // --- Phase 3: Execute Workers, Edit Code in Sandbox, Deputy QA & Run Tests ---
      const adjustmentSuffix = planAdjustmentNote.trim()
        ? `\n\nДОПОЛНИТЕЛЬНАЯ КОРРЕКТИРОВКА РУКОВОДИТЕЛЯ ПРИ УТВЕРЖДЕНИИ ПЛАНА:\n${planAdjustmentNote.trim()}`
        : '';

      let stepIdx = 0;
      const MAX_TOTAL_STEPS = 7;

      while (stepIdx < executionQueue.length && stepIdx < MAX_TOTAL_STEPS) {
        if (controller.signal.aborted) return;
        const current = executionQueue[stepIdx];
        const agent =
          workingAgents.find((a) => a.id === current.assignedAgentId) ??
          findAgentBySlug(current.assignedAgentSlug, workingAgents) ??
          workingAgents[0];

        current.status = 'running';
        setSteps([...executionQueue]);
        setPhaseLabel(
          `Фаза 3 · Этап ${stepIdx + 1}/${executionQueue.length}: работает ${agent.name}...`
        );

        const stepStart = performance.now();
        const priorContext = executionQueue
          .slice(0, stepIdx)
          .filter((s) => s.status === 'completed' && s.outputText)
          .map(
            (s) =>
              `### Этап (${s.title} — ${s.assignedAgentName}):\n${s.outputText}`
          )
          .join('\n\n');

        const systemInstruction = assembleWorkerSystemPrompt(agent, rules, skills);

        let outText = '';
        if (sandbox) {
          const stepResp = await fetch('/api/orchestrator/execute-step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              sandboxId: sandbox.sandboxId,
              task: taskText + adjustmentSuffix,
              stepTitle: current.title,
              instructionForAgent: current.instructionForAgent,
              targetFiles: current.targetFiles,
              priorContext,
              systemInstruction,
              thinkingLevel: agent.defaultThinkingLevel,
              attachments: serializedAttachments,
            }),
          });

          if (!stepResp.ok) {
            const err = (await stepResp.json().catch(() => ({}))) as { error?: string };
            throw new Error(err.error || 'Ошибка выполнения этапа в песочнице.');
          }
          const stepData = (await stepResp.json()) as {
            report: string;
            appliedPatches: FilePatchRecord[];
          };
          outText = stepData.report;
          current.appliedPatches = stepData.appliedPatches;
          await refreshSandboxDiff(sandbox.sandboxId);
        } else {
          const promptForAgent = `ОБЩАЯ ЗАДАЧА ПОЛЬЗОВАТЕЛЯ:\n${taskText}${adjustmentSuffix}\n\nТВОЁ КОНКРЕТНОЕ ЗАДАНИЕ (${current.title}):\n${current.instructionForAgent}${
            priorContext ? `\n\nКОНТЕКСТ ПРЕДЫДУЩИХ ЭТАПОВ:\n${priorContext}` : ''
          }\n\nОтвечай на русском языке.`;

          outText = await streamSseText(
            '/api/worker/run',
            {
              systemInstruction,
              userInput: promptForAgent,
              thinkingLevel: agent.defaultThinkingLevel,
              attachments: serializedAttachments,
            },
            controller.signal,
            (partial) => {
              current.outputText = partial;
              setSteps([...executionQueue]);
            }
          );
        }

        current.outputText = outText;
        current.durationMs = Math.round(performance.now() - stepStart);
        current.status = 'completed';
        setSteps([...executionQueue]);

        // Deputy QA & Security dynamic review
        if (useDeputyQa && executionQueue.length < MAX_TOTAL_STEPS) {
          setPhaseLabel(
            `Заместитель QA & Security проверяет этап «${current.title}»...`
          );
          const revResp = await fetch('/api/orchestrator/review-step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              task: taskText,
              stepTitle: current.title,
              assignedAgentSlug: agent.slug,
              stepOutput: outText,
              remainingStepsCount: executionQueue.length - stepIdx - 1,
              activeAgents: workingAgents
                .filter((a) => a.rosterStatus === 'active')
                .map((a) => ({
                  id: a.id,
                  slug: a.slug,
                  name: a.name,
                  roleSummary: a.roleSummary,
                })),
              reserveAgents: workingAgents
                .filter((a) => a.rosterStatus === 'bench')
                .map((a) => ({
                  id: a.id,
                  slug: a.slug,
                  name: a.name,
                  roleSummary: a.roleSummary,
                })),
            }),
          });

          if (revResp.ok) {
            const review = (await revResp.json()) as DeputyStepReview;
            current.deputyReview = review;
            setSteps([...executionQueue]);

            if (
              (review.recommendedAction === 'hire_backup' ||
                review.recommendedAction === 'fire_and_replace') &&
              review.recommendedAgentSlug
            ) {
              const targetReserve = findAgentBySlug(
                review.recommendedAgentSlug,
                workingAgents
              );

              if (review.recommendedAction === 'fire_and_replace' && mode === 'autonomous') {
                const { logItem } = applyStaffingDecision(
                  {
                    actionType: 'fire',
                    agentSlug: agent.slug,
                    agentName: agent.name,
                    reason:
                      review.reason ||
                      'Заместитель QA рекомендовал заменить агента профильным специалистом.',
                  },
                  'Deputy QA & Security',
                  workingAgents
                );
                localStaffLog.push(logItem);
                setStaffingLog([...localStaffLog]);
                current.status = 'replaced';
              }

              if (targetReserve && targetReserve.rosterStatus === 'bench') {
                const hireRaw = {
                  actionType: 'hire' as const,
                  agentSlug: targetReserve.slug,
                  agentName: targetReserve.name,
                  reason:
                    review.reason ||
                    `Заместитель QA запросил привлечение ${targetReserve.name}.`,
                };

                let canAddStep = true;
                if (mode === 'supervised') {
                  const pendingId = `staff-qa-${Date.now()}`;
                  const pendingItem: StaffingAction = {
                    id: pendingId,
                    type: 'hire',
                    agentId: targetReserve.id,
                    agentSlug: targetReserve.slug,
                    agentName: targetReserve.name,
                    reason: hireRaw.reason,
                    actor: 'Deputy QA & Security',
                    status: 'pending',
                    timestamp: new Date().toISOString(),
                  };
                  localStaffLog.push(pendingItem);
                  setStaffingLog([...localStaffLog]);
                  setPhaseLabel(`Заместитель QA предлагает нанять ${targetReserve.name}...`);
                  canAddStep = await waitForUserApproval(pendingId);
                  if (controller.signal.aborted) return;
                  if (canAddStep) {
                    applyStaffingDecision(hireRaw, 'Deputy QA & Security', workingAgents);
                    pendingItem.status = 'applied';
                  } else {
                    pendingItem.status = 'rejected';
                  }
                  setStaffingLog([...localStaffLog]);
                } else {
                  const { logItem } = applyStaffingDecision(
                    hireRaw,
                    'Deputy QA & Security',
                    workingAgents
                  );
                  localStaffLog.push(logItem);
                  setStaffingLog([...localStaffLog]);
                }

                if (canAddStep && review.followUpInstruction) {
                  executionQueue.splice(stepIdx + 1, 0, {
                    stepId: `step-qa-${executionQueue.length + 1}`,
                    title: `Доп. проверка: ${targetReserve.name}`,
                    assignedAgentId: targetReserve.id,
                    assignedAgentSlug: targetReserve.slug,
                    assignedAgentName: targetReserve.name,
                    instructionForAgent: review.followUpInstruction,
                    targetFiles: current.targetFiles,
                    status: 'pending',
                  });
                  setSteps([...executionQueue]);
                }
              }
            }
          }
        }

        stepIdx += 1;
      }

      // Run sandbox checks (lint / typecheck / test / build) if sandbox connected
      let diffSummaryText = '';
      let checksSummaryText = '';
      if (sandbox) {
        setPhaseLabel('Фаза 3.5: Запуск автоматических проверок и тестов в песочнице...');
        const latestDiff = await refreshSandboxDiff(sandbox.sandboxId);
        if (latestDiff) {
          diffSummaryText = latestDiff.changedFiles
            .map((f) => `${f.status} ${f.path}`)
            .join('\n');
        }
        const checkList = await handleRunSandboxChecks(sandbox.sandboxId);
        checksSummaryText = checkList
          .map((c) => `${c.command}: ${c.passed ? 'PASS' : `FAIL (exit ${c.exitCode})`}`)
          .join('\n');
      }

      // --- Phase 4: Final Synthesis ---
      setPhaseLabel('Фаза 4: Главный Оркестратор формирует финальный отчёт...');
      const staffingSummary =
        localStaffLog.length > 0
          ? localStaffLog
              .map(
                (s) =>
                  `- [${s.type.toUpperCase()} · ${s.status}] ${s.agentName} (${s.agentSlug}): ${s.reason}`
              )
              .join('\n')
          : 'Штат не менялся.';

      const synthText = await streamSseText(
        '/api/orchestrator/synthesize',
        {
          task: taskText,
          analysis: plan.analysis,
          staffingSummary,
          sandboxDiffSummary: diffSummaryText,
          checksSummary: checksSummaryText,
          completedSteps: executionQueue
            .filter((s) => s.outputText)
            .map((s) => ({
              title: s.title,
              agentName: s.assignedAgentName,
              agentSlug: s.assignedAgentSlug,
              outputText: s.outputText ?? '',
              deputyVerdict: s.deputyReview?.verdictSummary,
            })),
        },
        controller.signal,
        (partial) => setFinalSynthesis(partial)
      );

      setFinalSynthesis(synthText);
      const elapsed = Math.round(performance.now() - t0);
      setTotalDurationMs(elapsed);
      setPhaseLabel('');

      const session: OrchestratorSession = {
        id: `orch-${Date.now()}`,
        task: taskText || 'Доработка по файлам',
        mode,
        analysis: plan.analysis,
        deputyPlannerNote: plan.deputyPlannerNote,
        deputyQaEnabled: useDeputyQa,
        staffingLog: localStaffLog,
        steps: executionQueue,
        finalSynthesis: synthText,
        totalDurationMs: elapsed,
        createdAt: new Date().toISOString(),
      };
      onSaveSession(session);

      setChatMessages((prev) => [
        ...prev,
        {
          id: `msg-done-${Date.now()}`,
          role: 'orchestrator',
          text: `Цикл завершён за ${formatDurationMs(elapsed)}. ${
            sandbox
              ? 'Патчи применены к проекту в песочнице — посмотрите вкладку «Код, Diff и Тесты» и скачайте готовый ZIP-архив.'
              : 'Итоговый отчёт готов во вкладке «Конвейер и план».'
          }`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Ошибка выполнения Оркестратора.';
      setErrorMsg(msg);
      setLastFailedKind('pipeline');
      setComposerText((prev) => (prev.trim() ? prev : taskText));
      if (currentAttachments.length > 0) {
        setAttachments((prev) => (prev.length > 0 ? prev : currentAttachments));
      }
      setPhaseLabel('');
    } finally {
      setIsRunning(false);
    }
  };

  const handleManualHire = () => {
    if (!manualHireId) return;
    const target = reserveAgents.find((a) => a.id === manualHireId);
    if (!target) return;
    const reason = 'Нанят вручную руководителем проекта в активный штат.';
    onHireAgent(target.id, reason, 'User');
    setStaffingLog((prev) => [
      {
        id: `staff-user-${Date.now()}`,
        type: 'hire',
        agentId: target.id,
        agentSlug: target.slug,
        agentName: target.name,
        reason,
        actor: 'User',
        status: 'applied',
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);
    setManualHireId('');
  };

  const handleManualFire = (agent: WorkerAgent) => {
    const reason = 'Уволен (переведён в резерв) вручную пользователем.';
    onFireAgent(agent.id, reason, 'User');
    setStaffingLog((prev) => [
      {
        id: `staff-user-${Date.now()}`,
        type: 'fire',
        agentId: agent.id,
        agentSlug: agent.slug,
        agentName: agent.name,
        reason,
        actor: 'User',
        status: 'applied',
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  const handleLoadSession = (s: OrchestratorSession) => {
    setActiveTaskTitle(s.task);
    setMode(s.mode);
    setAnalysis(s.analysis);
    setDeputyPlannerNote(s.deputyPlannerNote ?? '');
    setStaffingLog(s.staffingLog);
    setSteps(s.steps);
    setFinalSynthesis(s.finalSynthesis);
    setTotalDurationMs(s.totalDurationMs ?? null);
    setErrorMsg('');
    setCenterTab('pipeline');
  };

  const handleCopyFinal = async () => {
    if (!finalSynthesis) return;
    try {
      await navigator.clipboard.writeText(finalSynthesis);
      setCopiedFinal(true);
      setTimeout(() => setCopiedFinal(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div
      className="space-y-6"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {/* Top Project Connection Bar (GitHub URL or ZIP Sandbox) */}
      <section className="bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FolderGit2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <h1 className="text-sm font-semibold text-zinc-900 dark:text-slate-100">
              Подключение проекта для анализа, правки кода и тестов
            </h1>
          </div>
          {sandbox && (
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums">
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                Подключено: {sandbox.sourceLabel} ({sandbox.totalFiles} файлов)
              </span>
              <a
                href={`/api/sandbox/${sandbox.sandboxId}/download`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 font-sans font-medium"
              >
                <Download className="h-3 w-3" />
                <span>Скачать ZIP</span>
              </a>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="url"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/owner/repository (публичный GitHub)"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
          />
          <input
            type="text"
            value={githubBranch}
            onChange={(e) => setGithubBranch(e.target.value)}
            placeholder="Ветка (необяз.)"
            className="sm:w-36 px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
          />
          <button
            type="button"
            disabled={!githubUrl.trim() || sandboxLoading}
            onClick={handleCloneGithub}
            className="px-4 py-2 rounded-lg bg-zinc-900 dark:bg-blue-600 text-white text-xs font-medium hover:bg-zinc-800 dark:hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {sandboxLoading ? 'Клонирование...' : 'Подключить GitHub'}
          </button>
          <AttachmentPickerButton
            label="Загрузить .zip"
            onAddAttachments={(items) => {
              const zip = items.find((i) => i.kind === 'zip');
              if (zip) void handleUnpackZipAttachment(zip);
              else setAttachments((prev) => [...prev, ...items]);
            }}
            onError={setErrorMsg}
            onZipDetected={handleUnpackZipAttachment}
          />
        </div>
      </section>

      {errorMsg && (
        <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-800 dark:text-red-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {lastFailedKind && !isRunning && (composerText.trim() || attachments.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  if (lastFailedKind === 'chat') void handleSendChat();
                  else void handleStartFullPipeline();
                }}
                className="px-3 py-1.5 rounded-lg bg-red-700 text-white font-medium hover:bg-red-800 whitespace-nowrap"
              >
                Повторить
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setErrorMsg('');
                setLastFailedKind(null);
              }}
              className="px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 whitespace-nowrap"
            >
              Скрыть
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: Team Settings, Active Roster, History */}
        <aside className="xl:col-span-4 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-slate-100">
              Режим Оркестратора и Заместители
            </h2>

            <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setMode('autonomous')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'autonomous'
                    ? 'bg-white dark:bg-slate-900 text-zinc-900 dark:text-slate-100 shadow-xs'
                    : 'text-zinc-600 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-slate-100'
                }`}
              >
                Автономный найм
              </button>
              <button
                type="button"
                onClick={() => setMode('supervised')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'supervised'
                    ? 'bg-white dark:bg-slate-900 text-zinc-900 dark:text-slate-100 shadow-xs'
                    : 'text-zinc-600 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-slate-100'
                }`}
              >
                С подтверждением
              </button>
            </div>

            <div className="space-y-2">
              <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-zinc-200 dark:border-slate-800 cursor-pointer hover:bg-zinc-50 dark:hover:bg-slate-800/40">
                <input
                  type="checkbox"
                  checked={useDeputyPlanner}
                  onChange={(e) => setUseDeputyPlanner(e.target.checked)}
                  className="mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-600"
                />
                <div className="text-xs">
                  <div className="font-medium text-zinc-900 dark:text-slate-100">
                    Заместитель-планировщик
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-slate-400">
                    Декомпозирует этапы и зависимости файлов.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-zinc-200 dark:border-slate-800 cursor-pointer hover:bg-zinc-50 dark:hover:bg-slate-800/40">
                <input
                  type="checkbox"
                  checked={useDeputyQa}
                  onChange={(e) => setUseDeputyQa(e.target.checked)}
                  className="mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-600"
                />
                <div className="text-xs">
                  <div className="font-medium text-zinc-900 dark:text-slate-100">
                    Заместитель QA & Security
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-slate-400">
                    Контролирует этапы, донанимает и заменяет агентов.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-zinc-400 dark:text-slate-500" />
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-slate-100">
                  Активный штат ({activeAgents.length}/{agents.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={onOpenRoster}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
              >
                Каталог 71
              </button>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={manualHireId}
                onChange={(e) => setManualHireId(e.target.value)}
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-zinc-900 dark:text-slate-100"
              >
                <option value="">Нанять из резерва ({reserveAgents.length})...</option>
                {reserveAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.slug})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!manualHireId}
                onClick={handleManualHire}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-slate-700 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Нанять</span>
              </button>
            </div>

            <div className="divide-y divide-zinc-200 dark:divide-slate-800 max-h-52 overflow-y-auto">
              {activeAgents.map((agent) => (
                <div key={agent.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-zinc-900 dark:text-slate-100 truncate">
                      {agent.name}
                    </div>
                    <div className="font-mono text-[11px] text-zinc-400 dark:text-slate-500 truncate">
                      {agent.slug}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleManualFire(agent)}
                    disabled={activeAgents.length <= 1}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-950/30 disabled:opacity-30 shrink-0"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                    <span>Уволить</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-slate-100">
                <History className="h-4 w-4 text-zinc-400 dark:text-slate-500" />
                <span>История циклов ({orchestratorHistory.length})</span>
              </div>
              {orchestratorHistory.length > 0 && (
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
            {orchestratorHistory.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-slate-400">
                Сохранённые запуски конвейера появятся здесь.
              </p>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-slate-800 max-h-44 overflow-y-auto">
                {orchestratorHistory.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleLoadSession(item)}
                    className="w-full text-left py-2 px-1.5 rounded hover:bg-zinc-50 dark:hover:bg-slate-800/50 flex items-center justify-between gap-2"
                  >
                    <span className="text-xs font-medium text-zinc-800 dark:text-slate-200 truncate">
                      {item.task}
                    </span>
                    {item.totalDurationMs !== undefined && (
                      <span className="font-mono text-[11px] text-zinc-400 tabular-nums shrink-0">
                        {formatDurationMs(item.totalDurationMs)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Right Main Area: Chat + Pipeline + Code Diff/Tests + Universal Multimodal Composer */}
        <section className="xl:col-span-8 bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-1 bg-zinc-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setCenterTab('chat')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  centerTab === 'chat'
                    ? 'bg-white dark:bg-slate-900 text-zinc-900 dark:text-slate-100 shadow-xs'
                    : 'text-zinc-600 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-slate-100'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Диалог с Оркестратором</span>
              </button>
              <button
                type="button"
                onClick={() => setCenterTab('pipeline')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  centerTab === 'pipeline'
                    ? 'bg-white dark:bg-slate-900 text-zinc-900 dark:text-slate-100 shadow-xs'
                    : 'text-zinc-600 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-slate-100'
                }`}
              >
                <Play className="h-3.5 w-3.5" />
                <span>Конвейер и план ({steps.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setCenterTab('code')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  centerTab === 'code'
                    ? 'bg-white dark:bg-slate-900 text-zinc-900 dark:text-slate-100 shadow-xs'
                    : 'text-zinc-600 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-slate-100'
                }`}
              >
                <FileCode2 className="h-3.5 w-3.5" />
                <span>
                  Код, Diff и Тесты
                  {sandboxDiff ? ` (${sandboxDiff.changedFiles.length})` : ''}
                </span>
              </button>
            </div>

            {phaseLabel && (
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                {phaseLabel}
              </span>
            )}
          </div>

          {/* Center Viewport */}
          <div className="p-5 min-h-[420px] max-h-[620px] overflow-y-auto space-y-4">
            {centerTab === 'chat' && (
              <div className="space-y-4">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[88%] rounded-xl p-3.5 text-sm leading-relaxed space-y-2 ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-50 dark:bg-slate-950 border border-zinc-200 dark:border-slate-800 text-zinc-900 dark:text-slate-100'
                      }`}
                    >
                      <div className="text-[11px] font-medium opacity-75">
                        {msg.role === 'user' ? 'Вы' : 'Главный Оркестратор'}
                      </div>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {msg.attachments.map((att, idx) => (
                            <div
                              key={`${att.name}-${idx}`}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-black/15 text-xs"
                            >
                              {att.previewUrl && (
                                <img
                                  src={att.previewUrl}
                                  alt={att.name}
                                  className="h-5 w-5 rounded object-cover"
                                />
                              )}
                              <span className="truncate max-w-[160px]">{att.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                        {msg.text || '...'}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {centerTab === 'pipeline' && (
              <div className="space-y-5">
                {!activeTaskTitle && !analysis && steps.length === 0 && (
                  <div className="py-12 text-center space-y-2">
                    <p className="text-sm text-zinc-600 dark:text-slate-300">
                      Напишите задачу в поле ниже и нажмите «Запустить цикл (Аналитика → План)».
                    </p>
                    <p className="text-xs text-zinc-400 dark:text-slate-500 max-w-lg mx-auto">
                      Сначала команда проведёт аналитику и покажет план на ваше подтверждение, и только потом работники начнут редактировать код и прогонять тесты.
                    </p>
                  </div>
                )}

                {activeTaskTitle && (
                  <div className="pb-3 border-b border-zinc-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-slate-100">
                      Задача: {activeTaskTitle}
                    </div>
                    {totalDurationMs !== null && (
                      <span className="font-mono text-xs text-zinc-500 tabular-nums shrink-0">
                        {formatDurationMs(totalDurationMs)}
                      </span>
                    )}
                  </div>
                )}

                {analysis && (
                  <div className="space-y-2.5">
                    <div className="text-xs font-semibold text-zinc-500 dark:text-slate-400">
                      Аналитика Главного Оркестратора
                    </div>
                    <p className="text-sm text-zinc-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {analysis}
                    </p>
                    {deputyPlannerNote && (
                      <div className="p-3 rounded-lg border border-zinc-200 dark:border-slate-800 bg-zinc-50 dark:bg-slate-950 text-xs text-zinc-600 dark:text-slate-400">
                        <span className="font-medium text-zinc-800 dark:text-slate-200">
                          Заместитель по декомпозиции:
                        </span>{' '}
                        {deputyPlannerNote}
                      </div>
                    )}
                  </div>
                )}

                {staffingLog.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-slate-800">
                    <div className="text-xs font-semibold text-zinc-500 dark:text-slate-400">
                      Кадровые решения ({staffingLog.length})
                    </div>
                    {staffingLog.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-lg border border-zinc-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div>
                            <span
                              className={`font-medium ${
                                item.type === 'fire'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                              }`}
                            >
                              {item.type === 'hire'
                                ? 'Нанят из ECC'
                                : item.type === 'create_custom'
                                ? 'Создан новый агент'
                                : 'Уволен в резерв'}
                            </span>{' '}
                            <strong className="text-zinc-900 dark:text-slate-100">
                              {item.agentName}
                            </strong>{' '}
                            <span className="font-mono text-[11px] text-zinc-400">
                              {item.agentSlug} · {item.actor}
                            </span>
                          </div>
                          <p className="text-zinc-600 dark:text-slate-400">{item.reason}</p>
                        </div>

                        {item.status === 'pending' && awaitingApprovalId === item.id ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleDecisionClick(item.id, true)}
                              className="px-2.5 py-1 rounded bg-blue-600 text-white font-medium hover:bg-blue-700"
                            >
                              Утвердить
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDecisionClick(item.id, false)}
                              className="px-2.5 py-1 rounded border border-zinc-300 dark:border-slate-700 font-medium"
                            >
                              Отклонить
                            </button>
                          </div>
                        ) : (
                          <span className="font-mono text-[11px] text-zinc-500">
                            {item.status === 'applied'
                              ? 'Применено'
                              : item.status === 'rejected'
                              ? 'Отклонено'
                              : 'Ожидает'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Plan Confirmation Gate */}
                {planAwaitingConfirm && (
                  <div className="p-4 rounded-xl border border-blue-300 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/30 space-y-3">
                    <div className="text-sm font-semibold text-blue-950 dark:text-blue-200">
                      План аналитики готов — требуется ваше подтверждение
                    </div>
                    <p className="text-xs text-blue-900/80 dark:text-blue-300">
                      Проверьте список этапов и целевых файлов ниже. При желании допишите уточнения — работники получат их сразу при запуске.
                    </p>
                    <input
                      type="text"
                      value={planAdjustmentNote}
                      onChange={(e) => setPlanAdjustmentNote(e.target.value)}
                      placeholder="Необязательная корректировка к плану перед запуском..."
                      className="w-full px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-950 text-xs text-zinc-900 dark:text-slate-100"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleConfirmPlanClick(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Подтвердить план и запустить работников</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConfirmPlanClick(false)}
                        className="px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-zinc-700 dark:text-slate-200"
                      >
                        Отменить запуск
                      </button>
                    </div>
                  </div>
                )}

                {steps.length > 0 && (
                  <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-slate-800">
                    <div className="text-xs font-semibold text-zinc-500 dark:text-slate-400">
                      Этапы команды ({steps.length})
                    </div>
                    {steps.map((step, idx) => (
                      <div
                        key={step.stepId}
                        className="p-4 rounded-lg border border-zinc-200 dark:border-slate-800 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-zinc-900 dark:text-slate-100">
                            {idx + 1}. {step.title}
                          </div>
                          <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                            <span className="text-zinc-500">{step.assignedAgentName}</span>
                            <span>·</span>
                            <span
                              className={
                                step.status === 'completed'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : step.status === 'running'
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-zinc-400'
                              }
                            >
                              {step.status === 'completed'
                                ? 'Готово'
                                : step.status === 'running'
                                ? 'В работе'
                                : step.status === 'replaced'
                                ? 'Заменён'
                                : 'В очереди'}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-zinc-500 dark:text-slate-400">
                          {step.instructionForAgent}
                        </p>

                        {step.targetFiles && step.targetFiles.length > 0 && (
                          <div className="font-mono text-[11px] text-zinc-400 dark:text-slate-500">
                            Файлы: {step.targetFiles.join(', ')}
                          </div>
                        )}

                        {step.appliedPatches && step.appliedPatches.length > 0 && (
                          <div className="p-2.5 rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 text-xs space-y-1">
                            <div className="font-medium text-emerald-800 dark:text-emerald-300">
                              Применены правки файлов:
                            </div>
                            {step.appliedPatches.map((p) => (
                              <div key={p.path} className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                                [{p.action}] {p.path} — {p.summary}
                              </div>
                            ))}
                          </div>
                        )}

                        {step.outputText && (
                          <details open={step.status === 'running'}>
                            <summary className="cursor-pointer text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                              Отчёт агента ({step.outputText.length} симв.)
                            </summary>
                            <pre className="mt-2 p-3 rounded bg-zinc-50 dark:bg-slate-950 border border-zinc-200 dark:border-slate-800 whitespace-pre-wrap font-sans text-xs text-zinc-800 dark:text-slate-200 max-h-72 overflow-y-auto">
                              {step.outputText}
                            </pre>
                          </details>
                        )}

                        {step.deputyReview && (
                          <div className="pt-2 border-t border-zinc-100 dark:border-slate-800 flex items-start gap-2 text-xs">
                            {step.deputyReview.approved ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            )}
                            <div>
                              <span className="font-medium">Заместитель QA:</span>{' '}
                              <span className="text-zinc-600 dark:text-slate-400">
                                {step.deputyReview.verdictSummary}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {finalSynthesis && (
                  <div className="space-y-2.5 pt-3 border-t border-zinc-200 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-slate-100">
                        <ShieldCheck className="h-4 w-4 text-blue-600" />
                        <span>Финальное заключение Оркестратора</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyFinal}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-zinc-200 dark:border-slate-700 text-xs"
                      >
                        {copiedFinal ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Скопировано</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Копировать</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-4 rounded-lg bg-zinc-50 dark:bg-slate-950 border border-zinc-200 dark:border-slate-800 whitespace-pre-wrap font-sans text-sm leading-relaxed">
                      {finalSynthesis}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {centerTab === 'code' && (
              <div className="space-y-5">
                {!sandbox ? (
                  <div className="py-12 text-center text-sm text-zinc-500 dark:text-slate-400">
                    Подключите публичный GitHub-репозиторий или загрузите `.zip` сверху, чтобы видеть дерево файлов, реальные патчи (`git diff`), тесты и скачивать готовое приложение.
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs font-mono text-zinc-500 dark:text-slate-400">
                        {sandbox.sourceLabel} · {sandbox.totalFiles} файлов
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={checksRunning}
                          onClick={() => void handleRunSandboxChecks(sandbox.sandboxId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-slate-700 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-slate-800"
                        >
                          <Terminal className="h-3.5 w-3.5" />
                          <span>{checksRunning ? 'Проверка...' : 'Запустить тесты/сборку'}</span>
                        </button>
                        <a
                          href={`/api/sandbox/${sandbox.sandboxId}/patch`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-slate-700 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-slate-800"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Скачать .patch</span>
                        </a>
                        <a
                          href={`/api/sandbox/${sandbox.sandboxId}/download`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Скачать проект (.zip)</span>
                        </a>
                      </div>
                    </div>

                    {sandboxChecks.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-zinc-500">
                          Результаты тестов и сборки
                        </div>
                        {sandboxChecks.map((chk, i) => (
                          <div
                            key={`${chk.command}-${i}`}
                            className="p-3 rounded-lg border border-zinc-200 dark:border-slate-800 space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-xs font-mono">
                              <span className="font-semibold">{chk.command}</span>
                              <span
                                className={
                                  chk.passed
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-red-600 dark:text-red-400'
                                }
                              >
                                {chk.passed ? 'PASS (0)' : `FAIL (${chk.exitCode})`}
                              </span>
                            </div>
                            <pre className="p-2 rounded bg-zinc-50 dark:bg-slate-950 font-mono text-[11px] overflow-x-auto max-h-40 whitespace-pre-wrap">
                              {chk.output}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-zinc-500">
                        Git Diff ({sandboxDiff?.changedFiles.length ?? 0} изменённых файлов)
                      </div>
                      <pre className="p-3 rounded-lg border border-zinc-200 dark:border-slate-800 bg-zinc-50 dark:bg-slate-950 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-64 whitespace-pre">
                        {sandboxDiff?.diffText || '(Пока нет изменённых файлов)'}
                      </pre>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      <div className="md:col-span-5 border border-zinc-200 dark:border-slate-800 rounded-lg max-h-60 overflow-y-auto divide-y divide-zinc-100 dark:divide-slate-800">
                        {sandbox.files.map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => void handlePreviewSandboxFile(f)}
                            className={`w-full text-left px-3 py-1.5 font-mono text-[11px] truncate ${
                              previewFilePath === f
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                                : 'hover:bg-zinc-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                      <div className="md:col-span-7 border border-zinc-200 dark:border-slate-800 rounded-lg p-3 bg-zinc-50 dark:bg-slate-950 max-h-60 overflow-auto">
                        <div className="font-mono text-[11px] text-zinc-500 mb-2">
                          {previewFilePath || 'Нажмите на файл слева для просмотра'}
                        </div>
                        {previewFileContent && (
                          <pre className="font-mono text-[11px] whitespace-pre-wrap text-zinc-800 dark:text-slate-200">
                            {previewFileContent}
                          </pre>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Always-visible Multimodal Composer (Text + Images + Video + Audio + PDF + Code + ZIP) */}
          <div
            className={`p-4 border-t border-zinc-200 dark:border-slate-800 bg-zinc-50/70 dark:bg-slate-950/70 space-y-3 transition-colors ${
              isDragging ? 'ring-2 ring-blue-600 bg-blue-50/50 dark:bg-blue-950/20' : ''
            }`}
          >
            <AttachmentList
              attachments={attachments}
              onRemoveAttachment={(id) =>
                setAttachments((prev) => prev.filter((a) => a.id !== id))
              }
              onUnpackZip={handleUnpackZipAttachment}
            />

            <textarea
              rows={3}
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void handleSendChat();
                }
              }}
              placeholder="Напишите сообщение Главному Оркестратору или опишите задачу для команды... (Ctrl+Enter — отправить в чат, либо перетащите сюда любые фото, видео, PDF, код, ZIP)"
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-zinc-900 dark:text-slate-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
            />

            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <AttachmentPickerButton
                onAddAttachments={(items) => setAttachments((prev) => [...prev, ...items])}
                onError={setErrorMsg}
                onZipDetected={handleUnpackZipAttachment}
                label="Прикрепить файлы (фото, видео, аудио, PDF, код, ZIP)"
              />

              <div className="flex flex-wrap items-center gap-2">
                {isRunning ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 whitespace-nowrap"
                  >
                    <Square className="h-3.5 w-3.5" />
                    <span>Остановить</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!composerText.trim() && attachments.length === 0}
                      onClick={() => void handleSendChat()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-zinc-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-zinc-900 dark:text-slate-100 hover:bg-zinc-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Написать Оркестратору</span>
                    </button>
                    <button
                      type="button"
                      disabled={!composerText.trim() && attachments.length === 0}
                      onClick={() => void handleStartFullPipeline()}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>Запустить цикл (Аналитика → План)</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
