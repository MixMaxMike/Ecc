export type ThinkingLevelOption = 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';

export type NavSection =
  | 'orchestrator'
  | 'agents'
  | 'rules'
  | 'skills'
  | 'commands'
  | 'runner';

export type RuleCategory = string;

export type HookPhase = 'pre-run' | 'post-run';

export type HookSeverity = 'block' | 'warn';

export type RosterStatus = 'active' | 'bench';

export interface WorkerAgent {
  id: string;
  slug: string;
  name: string;
  roleSummary: string;
  systemPrompt: string;
  defaultThinkingLevel: ThinkingLevelOption;
  tools?: string[];
  rosterStatus: RosterStatus;
  attachedRuleIds: string[];
  attachedSkillIds: string[];
  attachedHookIds: string[];
  isCustom?: boolean;
  source?: string;
}

export interface EccRule {
  id: string;
  slug: string;
  category: RuleCategory;
  title: string;
  content: string;
  alwaysApply: boolean;
  isCustom?: boolean;
  source?: string;
}

export interface EccSkill {
  id: string;
  slug: string;
  name: string;
  triggerHint: string;
  workflowSteps: string[];
  markdownBody: string;
  isCustom?: boolean;
  source?: string;
}

export interface EccCommand {
  id: string;
  command: string;
  targetAgentId: string;
  recommendedThinkingLevel: ThinkingLevelOption;
  description: string;
  promptTemplate: string;
  isCustom?: boolean;
  source?: string;
}

export interface EccHook {
  id: string;
  slug: string;
  phase: HookPhase;
  name: string;
  description: string;
  checkInstruction: string;
  severity: HookSeverity;
  enabledByDefault: boolean;
  isCustom?: boolean;
}

export interface HookExecutionResult {
  hookId: string;
  hookName: string;
  phase: HookPhase;
  severity: HookSeverity;
  passed: boolean;
  summary: string;
  details?: string;
}

export interface AttachedFileItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'zip' | 'binary';
  base64Data?: string;
  textContent?: string;
  previewUrl?: string;
}

export interface RunSession {
  id: string;
  agentId: string;
  agentName: string;
  commandUsed?: string;
  thinkingLevel: ThinkingLevelOption;
  userInput: string;
  assembledPrompt: string;
  outputText: string;
  hookResults: HookExecutionResult[];
  durationMs: number;
  createdAt: string;
  error?: string;
}

export type OrchestratorMode = 'autonomous' | 'supervised';

export interface StaffingAction {
  id: string;
  type: 'hire' | 'fire' | 'create_custom';
  agentId: string;
  agentSlug: string;
  agentName: string;
  roleSummary?: string;
  systemPrompt?: string;
  reason: string;
  actor: 'Orchestrator Lead' | 'Deputy QA & Security' | 'User';
  status: 'applied' | 'pending' | 'rejected';
  timestamp: string;
}

export interface DeputyStepReview {
  approved: boolean;
  verdictSummary: string;
  recommendedAction: 'none' | 'hire_backup' | 'fire_and_replace';
  recommendedAgentSlug?: string;
  customAgentName?: string;
  customAgentPrompt?: string;
  followUpInstruction?: string;
  reason?: string;
}

export interface FilePatchRecord {
  path: string;
  action: 'create' | 'update' | 'delete';
  summary: string;
}

export interface OrchestratorStep {
  stepId: string;
  title: string;
  assignedAgentId: string;
  assignedAgentSlug: string;
  assignedAgentName: string;
  instructionForAgent: string;
  targetFiles?: string[];
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'replaced';
  outputText?: string;
  appliedPatches?: FilePatchRecord[];
  durationMs?: number;
  deputyReview?: DeputyStepReview;
}

export interface SandboxWorkspaceInfo {
  sandboxId: string;
  sourceLabel: string;
  sourceType: 'github' | 'zip';
  branch?: string;
  files: string[];
  totalFiles: number;
  hasPackageJson: boolean;
  packageScripts: string[];
}

export interface SandboxCheckItem {
  command: string;
  passed: boolean;
  exitCode: number;
  output: string;
}

export interface SandboxDiffResult {
  changedFiles: Array<{ status: string; path: string }>;
  diffText: string;
}

export interface OrchestratorChatMessage {
  id: string;
  role: 'user' | 'orchestrator';
  text: string;
  attachments?: Array<{
    name: string;
    kind: AttachedFileItem['kind'];
    size: number;
    previewUrl?: string;
  }>;
  createdAt: string;
}

export interface OrchestratorSession {
  id: string;
  task: string;
  mode: OrchestratorMode;
  analysis: string;
  deputyPlannerNote?: string;
  deputyQaEnabled: boolean;
  staffingLog: StaffingAction[];
  steps: OrchestratorStep[];
  finalSynthesis: string;
  totalDurationMs?: number;
  createdAt: string;
}

export interface EccWorkspaceState {
  agents: WorkerAgent[];
  rules: EccRule[];
  skills: EccSkill[];
  commands: EccCommand[];
  hooks: EccHook[];
  runHistory: RunSession[];
  orchestratorHistory: OrchestratorSession[];
}
