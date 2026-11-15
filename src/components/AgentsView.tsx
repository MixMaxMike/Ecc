import { Check, Copy, Play, Plus, Search, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  EccHook,
  EccRule,
  EccSkill,
  ThinkingLevelOption,
  WorkerAgent,
} from '../types/ecc';
import { assembleWorkerSystemPrompt } from '../utils/eccComposer';

interface AgentsViewProps {
  agents: WorkerAgent[];
  rules: EccRule[];
  skills: EccSkill[];
  hooks: EccHook[];
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
  onUpdateAgent: (updated: WorkerAgent) => void;
  onCreateAgent: (created: WorkerAgent) => void;
  onDeleteAgent: (agentId: string) => void;
  onRunAgent: (agentId: string) => void;
}

const THINKING_LEVELS: Array<{ value: ThinkingLevelOption; label: string }> = [
  { value: 'LOW', label: 'LOW · Быстро' },
  { value: 'MEDIUM', label: 'MEDIUM · Сбалансировано' },
  { value: 'HIGH', label: 'HIGH · Глубоко' },
  { value: 'XHIGH', label: 'XHIGH · Максимум' },
];

export function AgentsView({
  agents,
  rules,
  skills,
  hooks,
  selectedAgentId,
  onSelectAgent,
  onUpdateAgent,
  onCreateAgent,
  onDeleteAgent,
  onRunAgent,
}: AgentsViewProps) {
  const [search, setSearch] = useState('');
  const [rosterFilter, setRosterFilter] = useState<'all' | 'active' | 'bench' | 'custom'>('all');
  const [inspectorTab, setInspectorTab] = useState<'config' | 'preview'>('config');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const counts = useMemo(
    () => ({
      all: agents.length,
      active: agents.filter((a) => a.rosterStatus === 'active').length,
      bench: agents.filter((a) => a.rosterStatus === 'bench').length,
      custom: agents.filter((a) => a.isCustom).length,
    }),
    [agents]
  );

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agents.filter((a) => {
      const matchRoster =
        rosterFilter === 'all' ||
        (rosterFilter === 'active' && a.rosterStatus === 'active') ||
        (rosterFilter === 'bench' && a.rosterStatus === 'bench') ||
        (rosterFilter === 'custom' && Boolean(a.isCustom));
      const matchQuery =
        !q ||
        a.name.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q) ||
        a.roleSummary.toLowerCase().includes(q);
      return matchRoster && matchQuery;
    });
  }, [agents, search, rosterFilter]);

  const activeAgent =
    agents.find((a) => a.id === selectedAgentId) ?? filteredAgents[0] ?? agents[0];

  const assembledPrompt = useMemo(() => {
    if (!activeAgent) return '';
    return assembleWorkerSystemPrompt(activeAgent, rules, skills);
  }, [activeAgent, rules, skills]);

  const handleCreateNew = () => {
    const idx = agents.length + 1;
    const newAgent: WorkerAgent = {
      id: `agent-custom-${Date.now()}`,
      slug: `custom:worker-${idx}`,
      name: `Новый воркер #${idx}`,
      roleSummary: 'Специализированный воркер под задачи вашего проекта.',
      systemPrompt:
        'Ты — специализированный инженер-исполнитель.\nОпиши задачу, проверь ограничения и выдай структурированный проверяемый результат.',
      defaultThinkingLevel: 'HIGH',
      rosterStatus: 'active',
      attachedRuleIds: rules.filter((r) => r.alwaysApply).map((r) => r.id),
      attachedSkillIds: [],
      attachedHookIds: hooks.filter((h) => h.enabledByDefault).map((h) => h.id),
      isCustom: true,
      source: 'custom',
    };
    onCreateAgent(newAgent);
    onSelectAgent(newAgent.id);
    setInspectorTab('config');
  };

  const toggleRosterStatus = (agent: WorkerAgent) => {
    onUpdateAgent({
      ...agent,
      rosterStatus: agent.rosterStatus === 'active' ? 'bench' : 'active',
    });
  };

  const toggleRelation = (
    field: 'attachedRuleIds' | 'attachedSkillIds' | 'attachedHookIds',
    targetId: string
  ) => {
    if (!activeAgent) return;
    const current = activeAgent[field];
    const next = current.includes(targetId)
      ? current.filter((id) => id !== targetId)
      : [...current, targetId];
    onUpdateAgent({ ...activeAgent, [field]: next });
  };

  const handleCopyPrompt = async () => {
    if (!assembledPrompt) return;
    try {
      await navigator.clipboard.writeText(assembledPrompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 1800);
    } catch {
      // Clipboard might be restricted in some contexts
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <section className="xl:col-span-4 bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-slate-100">
              Штат и резерв ECC
            </h2>
            <button
              type="button"
              onClick={handleCreateNew}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Создать</span>
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-100 dark:bg-slate-800 rounded-lg">
            {(
              [
                ['all', `Все (${counts.all})`],
                ['active', `Штат (${counts.active})`],
                ['bench', `Резерв (${counts.bench})`],
                ['custom', `Свои (${counts.custom})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRosterFilter(id)}
                className={`px-1.5 py-1 text-[11px] font-medium rounded-md transition-colors truncate tabular-nums ${
                  rosterFilter === id
                    ? 'bg-white dark:bg-slate-900 text-zinc-900 dark:text-slate-100 shadow-xs'
                    : 'text-zinc-600 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="h-4 w-4 text-zinc-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск среди всех 71+ агентов..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 placeholder:text-zinc-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
            />
          </div>
        </div>

        <div className="divide-y divide-zinc-200 dark:divide-slate-800 max-h-[650px] overflow-y-auto">
          {filteredAgents.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <p className="text-sm text-zinc-500 dark:text-slate-400">
                Воркеры по заданным фильтрам не найдены.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setRosterFilter('all');
                }}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Сбросить фильтры
              </button>
            </div>
          ) : (
            filteredAgents.map((agent) => {
              const isSelected = activeAgent?.id === agent.id;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => onSelectAgent(agent.id)}
                  className={`w-full text-left p-3.5 transition-colors ${
                    isSelected
                      ? 'bg-blue-50/70 dark:bg-blue-950/30'
                      : 'hover:bg-zinc-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm text-zinc-900 dark:text-slate-100">
                      {agent.name}
                    </span>
                    <span
                      className={`font-mono text-[11px] shrink-0 ${
                        agent.rosterStatus === 'active'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-zinc-400 dark:text-slate-500'
                      }`}
                    >
                      {agent.rosterStatus === 'active' ? 'В штате' : 'Резерв'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-slate-400 line-clamp-2">
                    {agent.roleSummary}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 dark:text-slate-500 tabular-nums">
                    <span>{agent.slug}</span>
                    <span aria-hidden="true">·</span>
                    <span>{agent.defaultThinkingLevel}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      <section className="xl:col-span-8 bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl">
        {!activeAgent ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-zinc-500 dark:text-slate-400">
              Выберите воркера слева или создайте нового.
            </p>
            <button
              type="button"
              onClick={handleCreateNew}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              Создать первого воркера
            </button>
          </div>
        ) : (
          <div>
            <div className="p-5 border-b border-zinc-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-zinc-900 dark:text-slate-100 truncate">
                  {activeAgent.name}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-slate-400 font-mono tabular-nums">
                  <span>{activeAgent.slug}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {activeAgent.rosterStatus === 'active' ? 'В штате команды' : 'В резерве'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{activeAgent.source ?? 'affaan-m/ECC'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{assembledPrompt.length} симв.</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleRosterStatus(activeAgent)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                    activeAgent.rosterStatus === 'active'
                      ? 'border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                      : 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                  }`}
                >
                  {activeAgent.rosterStatus === 'active' ? (
                    <>
                      <UserMinus className="h-3.5 w-3.5" />
                      <span>Уволить в резерв</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Нанять в штат</span>
                    </>
                  )}
                </button>

                {activeAgent.isCustom && (
                  <button
                    type="button"
                    onClick={() => onDeleteAgent(activeAgent.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors whitespace-nowrap"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Удалить</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onRunAgent(activeAgent.id)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Соло-тест</span>
                </button>
              </div>
            </div>

            <div className="px-5 pt-3 border-b border-zinc-200 dark:border-slate-800 flex items-center gap-2">
              <div className="inline-flex items-center gap-1 p-1 bg-zinc-100 dark:bg-slate-800 rounded-lg mb-3">
                <button
                  type="button"
                  onClick={() => setInspectorTab('config')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    inspectorTab === 'config'
                      ? 'bg-white dark:bg-slate-900 text-zinc-900 dark:text-slate-100 shadow-xs'
                      : 'text-zinc-600 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-slate-100'
                  }`}
                >
                  Конфигурация и модули
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorTab('preview')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    inspectorTab === 'preview'
                      ? 'bg-white dark:bg-slate-900 text-zinc-900 dark:text-slate-100 shadow-xs'
                      : 'text-zinc-600 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-slate-100'
                  }`}
                >
                  Итоговый промпт
                </button>
              </div>
            </div>

            {inspectorTab === 'config' ? (
              <div className="p-5 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="block space-y-1.5 md:col-span-2">
                    <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                      Название воркера
                    </span>
                    <input
                      type="text"
                      value={activeAgent.name}
                      onChange={(e) =>
                        onUpdateAgent({ ...activeAgent, name: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                      Глубина рассуждений
                    </span>
                    <select
                      value={activeAgent.defaultThinkingLevel}
                      onChange={(e) =>
                        onUpdateAgent({
                          ...activeAgent,
                          defaultThinkingLevel: e.target.value as ThinkingLevelOption,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                    >
                      {THINKING_LEVELS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                    Специализация и триггер назначения
                  </span>
                  <input
                    type="text"
                    value={activeAgent.roleSummary}
                    onChange={(e) =>
                      onUpdateAgent({ ...activeAgent, roleSummary: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </label>

                {activeAgent.tools && activeAgent.tools.length > 0 && (
                  <div className="text-xs text-zinc-500 dark:text-slate-400">
                    <span className="font-medium text-zinc-700 dark:text-slate-300">
                      Инструменты в ECC:
                    </span>{' '}
                    <span className="font-mono">{activeAgent.tools.join(' · ')}</span>
                  </div>
                )}

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                    Системная инструкция роли (Markdown из ECC)
                  </span>
                  <textarea
                    rows={10}
                    value={activeAgent.systemPrompt}
                    onChange={(e) =>
                      onUpdateAgent({ ...activeAgent, systemPrompt: e.target.value })
                    }
                    className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-950 font-mono text-xs leading-relaxed text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </label>

                <div className="pt-2 border-t border-zinc-200 dark:border-slate-800 space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100 mb-2">
                      Подключённые правила (показаны активные и базовые common)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                      {rules
                        .filter(
                          (r) =>
                            r.alwaysApply ||
                            r.category === 'common' ||
                            activeAgent.attachedRuleIds.includes(r.id)
                        )
                        .map((rule) => {
                          const checked =
                            rule.alwaysApply || activeAgent.attachedRuleIds.includes(rule.id);
                          return (
                            <label
                              key={rule.id}
                              className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                                checked
                                  ? 'border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20'
                                  : 'border-zinc-200 dark:border-slate-800 hover:bg-zinc-50 dark:hover:bg-slate-800/40'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={rule.alwaysApply}
                                onChange={() => toggleRelation('attachedRuleIds', rule.id)}
                                className="mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-600"
                              />
                              <div className="min-w-0">
                                <div className="font-medium text-xs text-zinc-900 dark:text-slate-100 truncate">
                                  {rule.title}
                                </div>
                                <div className="mt-0.5 font-mono text-[11px] text-zinc-500 dark:text-slate-400 truncate">
                                  {rule.slug}
                                  {rule.alwaysApply ? ' · всегда активно' : ''}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-slate-100 mb-2">
                      Активные проверки пайплайна (ECC Hooks)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {hooks.map((hook) => {
                        const checked = activeAgent.attachedHookIds.includes(hook.id);
                        return (
                          <label
                            key={hook.id}
                            className={`flex items-start gap-2.5 p-3 rounded-lg border text-sm cursor-pointer transition-colors ${
                              checked
                                ? 'border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20'
                                : 'border-zinc-200 dark:border-slate-800 hover:bg-zinc-50 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRelation('attachedHookIds', hook.id)}
                              className="mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-600"
                            />
                            <div className="min-w-0">
                              <div className="font-medium text-xs text-zinc-900 dark:text-slate-100">
                                {hook.name}
                              </div>
                              <div className="mt-0.5 font-mono text-[11px] text-zinc-500 dark:text-slate-400">
                                {hook.phase} · {hook.severity === 'block' ? 'блокирующий' : 'предупреждение'}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500 dark:text-slate-400">
                    Итоговая системная инструкция, которая передаётся модели при запуске этого воркера.
                  </p>
                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-slate-700 text-xs font-medium text-zinc-700 dark:text-slate-200 hover:bg-zinc-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    {copiedPrompt ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Скопировано</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Копировать промпт</span>
                      </>
                    )}
                  </button>
                </div>

                <pre className="p-4 rounded-lg border border-zinc-200 dark:border-slate-800 bg-zinc-50 dark:bg-slate-950 font-mono text-xs leading-relaxed text-zinc-800 dark:text-slate-200 whitespace-pre-wrap overflow-x-auto max-h-[600px]">
                  {assembledPrompt}
                </pre>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
