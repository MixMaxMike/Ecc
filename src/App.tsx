import { Check, Copy, Download, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AgentsView } from './components/AgentsView';
import { CommandsHooksView } from './components/CommandsHooksView';
import { OrchestratorView } from './components/OrchestratorView';
import { RulesView } from './components/RulesView';
import { RunnerView } from './components/RunnerView';
import { MobileMenuButton, Sidebar } from './components/Sidebar';
import { SkillsView } from './components/SkillsView';
import { createInitialWorkspaceState } from './data/eccCatalog';
import {
  EccCommand,
  EccHook,
  EccRule,
  EccSkill,
  EccWorkspaceState,
  NavSection,
  OrchestratorSession,
  RunSession,
  WorkerAgent,
} from './types/ecc';
import { downloadTextFile, generateAgentsMarkdownBundle } from './utils/eccComposer';
import {
  clearOverrides,
  loadOverrides,
  loadThemePreference,
  mergeRepositoryWithOverrides,
  saveOverrides,
  saveThemePreference,
  WorkspaceOverrides,
} from './utils/storage';

const SECTION_LABELS: Record<NavSection, string> = {
  orchestrator: 'Оркестратор и команда',
  agents: 'Штат воркеров (ECC)',
  rules: 'Правила и стандарты',
  skills: 'Скиллы и воркфлоу',
  commands: 'Команды и хуки',
  runner: 'Соло-песочница',
};

interface RepoPayload {
  agents: WorkerAgent[];
  rules: EccRule[];
  commands: EccCommand[];
  skills: EccSkill[];
}

export default function App() {
  const [baseRepo, setBaseRepo] = useState<RepoPayload>(() => {
    const initial = createInitialWorkspaceState();
    return {
      agents: initial.agents,
      rules: initial.rules,
      commands: initial.commands,
      skills: initial.skills,
    };
  });
  const [overrides, setOverrides] = useState<WorkspaceOverrides>(() => loadOverrides());
  const [repoLoading, setRepoLoading] = useState(true);

  const [activeSection, setActiveSection] = useState<NavSection>('orchestrator');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('ecc-agent-planner');
  const [pendingCommandId, setPendingCommandId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => loadThemePreference());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [copiedBundle, setCopiedBundle] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ecc/repository')
      .then((res) => res.json())
      .then((data: RepoPayload) => {
        if (!cancelled && Array.isArray(data.agents) && data.agents.length > 0) {
          setBaseRepo(data);
          setSelectedAgentId((prev) =>
            data.agents.some((a) => a.id === prev) ? prev : data.agents[0].id
          );
        }
      })
      .catch(() => {
        // Fallback to local initial catalog if offline
      })
      .finally(() => {
        if (!cancelled) setRepoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    saveOverrides(overrides);
  }, [overrides]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveThemePreference(theme);
  }, [theme]);

  const workspace: EccWorkspaceState = useMemo(
    () => mergeRepositoryWithOverrides(baseRepo, overrides),
    [baseRepo, overrides]
  );

  const exportMarkdown = useMemo(() => {
    const activeOnlyWorkspace: EccWorkspaceState = {
      ...workspace,
      agents: workspace.agents.filter((a) => a.rosterStatus === 'active'),
    };
    return generateAgentsMarkdownBundle(activeOnlyWorkspace);
  }, [workspace]);

  const selectedAgent = workspace.agents.find((a) => a.id === selectedAgentId);
  const activeAgentsCount = useMemo(
    () => workspace.agents.filter((a) => a.rosterStatus === 'active').length,
    [workspace.agents]
  );

  const handleUpdateAgent = (updated: WorkerAgent) => {
    setOverrides((prev) => {
      const nextRoster = {
        ...prev.rosterStatusById,
        [updated.id]: updated.rosterStatus,
      };
      if (updated.isCustom) {
        return {
          ...prev,
          rosterStatusById: nextRoster,
          customAgents: prev.customAgents.map((a) =>
            a.id === updated.id ? updated : a
          ),
        };
      }
      return {
        ...prev,
        rosterStatusById: nextRoster,
        editedAgents: {
          ...prev.editedAgents,
          [updated.id]: updated,
        },
      };
    });
  };

  const handleCreateAgent = (created: WorkerAgent) => {
    setOverrides((prev) => ({
      ...prev,
      rosterStatusById: {
        ...prev.rosterStatusById,
        [created.id]: created.rosterStatus,
      },
      customAgents: [created, ...prev.customAgents],
    }));
  };

  const handleDeleteAgent = (agentId: string) => {
    setOverrides((prev) => ({
      ...prev,
      customAgents: prev.customAgents.filter((a) => a.id !== agentId),
    }));
  };

  const handleHireAgent = (agentId: string) => {
    setOverrides((prev) => ({
      ...prev,
      rosterStatusById: { ...prev.rosterStatusById, [agentId]: 'active' },
    }));
  };

  const handleFireAgent = (agentId: string) => {
    setOverrides((prev) => ({
      ...prev,
      rosterStatusById: { ...prev.rosterStatusById, [agentId]: 'bench' },
    }));
  };

  const handleUpdateRule = (updated: EccRule) => {
    setOverrides((prev) => {
      if (updated.isCustom) {
        return {
          ...prev,
          customRules: prev.customRules.map((r) => (r.id === updated.id ? updated : r)),
        };
      }
      return {
        ...prev,
        editedRules: { ...prev.editedRules, [updated.id]: updated },
      };
    });
  };

  const handleCreateRule = (created: EccRule) => {
    setOverrides((prev) => ({
      ...prev,
      customRules: [created, ...prev.customRules],
    }));
  };

  const handleDeleteRule = (ruleId: string) => {
    setOverrides((prev) => ({
      ...prev,
      customRules: prev.customRules.filter((r) => r.id !== ruleId),
    }));
  };

  const handleUpdateSkill = (updated: EccSkill) => {
    setOverrides((prev) => {
      if (updated.isCustom) {
        return {
          ...prev,
          customSkills: prev.customSkills.map((s) =>
            s.id === updated.id ? updated : s
          ),
        };
      }
      return {
        ...prev,
        editedSkills: { ...prev.editedSkills, [updated.id]: updated },
      };
    });
  };

  const handleCreateSkill = (created: EccSkill) => {
    setOverrides((prev) => ({
      ...prev,
      customSkills: [created, ...prev.customSkills],
    }));
  };

  const handleDeleteSkill = (skillId: string) => {
    setOverrides((prev) => ({
      ...prev,
      customSkills: prev.customSkills.filter((s) => s.id !== skillId),
    }));
  };

  const handleUpdateCommand = (updated: EccCommand) => {
    setOverrides((prev) => {
      if (updated.isCustom) {
        return {
          ...prev,
          customCommands: prev.customCommands.map((c) =>
            c.id === updated.id ? updated : c
          ),
        };
      }
      return {
        ...prev,
        editedCommands: { ...prev.editedCommands, [updated.id]: updated },
      };
    });
  };

  const handleCreateCommand = (created: EccCommand) => {
    setOverrides((prev) => ({
      ...prev,
      customCommands: [created, ...prev.customCommands],
    }));
  };

  const handleDeleteCommand = (cmdId: string) => {
    setOverrides((prev) => ({
      ...prev,
      customCommands: prev.customCommands.filter((c) => c.id !== cmdId),
    }));
  };

  const handleUpdateHook = (updated: EccHook) => {
    setOverrides((prev) => ({
      ...prev,
      hooks: prev.hooks.map((h) => (h.id === updated.id ? updated : h)),
    }));
  };

  const handleCreateHook = (created: EccHook) => {
    setOverrides((prev) => ({
      ...prev,
      hooks: [created, ...prev.hooks],
    }));
  };

  const handleDeleteHook = (hookId: string) => {
    setOverrides((prev) => ({
      ...prev,
      hooks: prev.hooks.filter((h) => h.id !== hookId),
    }));
  };

  const handleSaveRun = (session: RunSession) => {
    setOverrides((prev) => ({
      ...prev,
      runHistory: [session, ...prev.runHistory].slice(0, 25),
    }));
  };

  const handleClearRunHistory = () => {
    setOverrides((prev) => ({ ...prev, runHistory: [] }));
  };

  const handleSaveOrchestratorSession = (session: OrchestratorSession) => {
    setOverrides((prev) => ({
      ...prev,
      orchestratorHistory: [session, ...prev.orchestratorHistory].slice(0, 15),
    }));
  };

  const handleClearOrchestratorHistory = () => {
    setOverrides((prev) => ({ ...prev, orchestratorHistory: [] }));
  };

  const handleResetDefaults = () => {
    const empty = clearOverrides();
    setOverrides(empty);
    if (baseRepo.agents[0]) {
      setSelectedAgentId(baseRepo.agents[0].id);
    }
  };

  const handleCopyBundle = async () => {
    try {
      await navigator.clipboard.writeText(exportMarkdown);
      setCopiedBundle(true);
      setTimeout(() => setCopiedBundle(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div className="min-h-screen flex bg-zinc-50 text-zinc-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        counts={{
          activeAgents: activeAgentsCount,
          totalAgents: workspace.agents.length,
          rules: workspace.rules.length,
          skills: workspace.skills.length,
          commandsAndHooks: workspace.commands.length + workspace.hooks.length,
          runs: workspace.runHistory.length,
        }}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        onResetDefaults={handleResetDefaults}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-zinc-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <MobileMenuButton onClick={() => setMobileMenuOpen(true)} />
            <nav
              className="flex items-center gap-2 text-xs sm:text-sm text-zinc-500 dark:text-slate-400 truncate"
              aria-label="Хлебные крошки"
            >
              <span className="font-medium text-zinc-900 dark:text-slate-100 whitespace-nowrap">
                ECC Studio
              </span>
              <span aria-hidden="true">/</span>
              <span className="whitespace-nowrap">{SECTION_LABELS[activeSection]}</span>
              {activeSection === 'agents' && selectedAgent && (
                <>
                  <span aria-hidden="true" className="hidden sm:inline">
                    /
                  </span>
                  <span className="hidden sm:inline truncate text-zinc-700 dark:text-slate-300">
                    {selectedAgent.name}
                  </span>
                </>
              )}
            </nav>
          </div>

          <button
            type="button"
            onClick={() => setExportModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 text-white dark:bg-blue-600 dark:hover:bg-blue-700 hover:bg-zinc-800 text-xs font-medium transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Экспорт AGENTS.md</span>
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {repoLoading ? (
            <div className="bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl p-8 space-y-3">
              <div className="h-5 w-64 rounded bg-zinc-200 dark:bg-slate-800 animate-pulse" />
              <div className="h-4 w-full rounded bg-zinc-200 dark:bg-slate-800 animate-pulse" />
              <div className="h-4 w-2/3 rounded bg-zinc-200 dark:bg-slate-800 animate-pulse" />
            </div>
          ) : (
            <>
              {activeSection === 'orchestrator' && (
                <OrchestratorView
                  agents={workspace.agents}
                  rules={workspace.rules}
                  skills={workspace.skills}
                  orchestratorHistory={workspace.orchestratorHistory}
                  onHireAgent={(agentId) => handleHireAgent(agentId)}
                  onFireAgent={(agentId) => handleFireAgent(agentId)}
                  onCreateCustomAgent={(agent) => handleCreateAgent(agent)}
                  onSaveSession={handleSaveOrchestratorSession}
                  onClearHistory={handleClearOrchestratorHistory}
                  onOpenRoster={() => setActiveSection('agents')}
                />
              )}

              {activeSection === 'agents' && (
                <AgentsView
                  agents={workspace.agents}
                  rules={workspace.rules}
                  skills={workspace.skills}
                  hooks={workspace.hooks}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={setSelectedAgentId}
                  onUpdateAgent={handleUpdateAgent}
                  onCreateAgent={handleCreateAgent}
                  onDeleteAgent={handleDeleteAgent}
                  onRunAgent={(agentId) => {
                    setSelectedAgentId(agentId);
                    setActiveSection('runner');
                  }}
                />
              )}

              {activeSection === 'rules' && (
                <RulesView
                  rules={workspace.rules}
                  onUpdateRule={handleUpdateRule}
                  onCreateRule={handleCreateRule}
                  onDeleteRule={handleDeleteRule}
                />
              )}

              {activeSection === 'skills' && (
                <SkillsView
                  skills={workspace.skills}
                  onUpdateSkill={handleUpdateSkill}
                  onCreateSkill={handleCreateSkill}
                  onDeleteSkill={handleDeleteSkill}
                />
              )}

              {activeSection === 'commands' && (
                <CommandsHooksView
                  commands={workspace.commands}
                  hooks={workspace.hooks}
                  agents={workspace.agents}
                  onUpdateCommand={handleUpdateCommand}
                  onCreateCommand={handleCreateCommand}
                  onDeleteCommand={handleDeleteCommand}
                  onUpdateHook={handleUpdateHook}
                  onCreateHook={handleCreateHook}
                  onDeleteHook={handleDeleteHook}
                  onLaunchCommand={(cmdId) => {
                    setPendingCommandId(cmdId);
                    setActiveSection('runner');
                  }}
                />
              )}

              {activeSection === 'runner' && (
                <RunnerView
                  agents={workspace.agents}
                  rules={workspace.rules}
                  skills={workspace.skills}
                  commands={workspace.commands}
                  hooks={workspace.hooks}
                  selectedAgentId={selectedAgentId}
                  onSelectAgentId={setSelectedAgentId}
                  pendingCommandId={pendingCommandId}
                  onConsumePendingCommand={() => setPendingCommandId(null)}
                  runHistory={workspace.runHistory}
                  onSaveRun={handleSaveRun}
                  onClearHistory={handleClearRunHistory}
                />
              )}
            </>
          )}
        </main>
      </div>

      {exportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-modal-title"
        >
          <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div>
                <h2
                  id="export-modal-title"
                  className="text-base font-semibold text-zinc-900 dark:text-slate-100"
                >
                  Экспорт штата команды в AGENTS.md ({activeAgentsCount} активных агентов)
                </h2>
                <p className="text-xs text-zinc-500 dark:text-slate-400 mt-0.5">
                  В файл попадают агенты, нанятые в активный штат, и общие правила ECC.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Закрыть окно экспорта"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <pre className="p-4 rounded-lg border border-zinc-200 dark:border-slate-800 bg-zinc-50 dark:bg-slate-950 font-mono text-xs leading-relaxed text-zinc-800 dark:text-slate-200 max-h-[420px] overflow-y-auto whitespace-pre-wrap">
                {exportMarkdown}
              </pre>

              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    downloadTextFile(
                      'ecc-overrides-backup.json',
                      JSON.stringify(overrides, null, 2),
                      'application/json;charset=utf-8'
                    )
                  }
                  className="px-3.5 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 text-xs font-medium text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  Скачать JSON-бэкап правок
                </button>
                <button
                  type="button"
                  onClick={handleCopyBundle}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 text-xs font-medium text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  {copiedBundle ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Скопировано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Копировать Markdown</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => downloadTextFile('AGENTS.md', exportMarkdown)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Скачать AGENTS.md</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
