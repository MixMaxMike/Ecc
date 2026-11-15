import { Play, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  EccCommand,
  EccHook,
  HookPhase,
  HookSeverity,
  WorkerAgent,
} from '../types/ecc';

interface CommandsHooksViewProps {
  commands: EccCommand[];
  hooks: EccHook[];
  agents: WorkerAgent[];
  onUpdateCommand: (cmd: EccCommand) => void;
  onCreateCommand: (cmd: EccCommand) => void;
  onDeleteCommand: (cmdId: string) => void;
  onUpdateHook: (hook: EccHook) => void;
  onCreateHook: (hook: EccHook) => void;
  onDeleteHook: (hookId: string) => void;
  onLaunchCommand: (commandId: string) => void;
}

export function CommandsHooksView({
  commands,
  hooks,
  agents,
  onUpdateCommand,
  onCreateCommand,
  onDeleteCommand,
  onUpdateHook,
  onCreateHook,
  onDeleteHook,
  onLaunchCommand,
}: CommandsHooksViewProps) {
  const [subTab, setSubTab] = useState<'commands' | 'hooks'>('commands');
  const [cmdSearch, setCmdSearch] = useState('');
  const [selectedCommandId, setSelectedCommandId] = useState(commands[0]?.id ?? '');
  const [selectedHookId, setSelectedHookId] = useState(hooks[0]?.id ?? '');

  const filteredCommands = useMemo(() => {
    const q = cmdSearch.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.command.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  }, [commands, cmdSearch]);

  const activeCommand =
    commands.find((c) => c.id === selectedCommandId) ??
    filteredCommands[0] ??
    commands[0];
  const activeHook = hooks.find((h) => h.id === selectedHookId) ?? hooks[0];

  const handleCreateCommand = () => {
    const idx = commands.length + 1;
    const created: EccCommand = {
      id: `cmd-custom-${Date.now()}`,
      command: `/custom-${idx}`,
      targetAgentId: agents[0]?.id ?? 'ecc-agent-planner',
      recommendedThinkingLevel: 'HIGH',
      description: 'Пользовательский пресет слэш-команды для быстрого запуска.',
      promptTemplate: 'Задача: [Опишите цель]\nВходные данные: [Вставьте код или спецификацию]',
      isCustom: true,
    };
    onCreateCommand(created);
    setSelectedCommandId(created.id);
  };

  const handleCreateHook = () => {
    const idx = hooks.length + 1;
    const created: EccHook = {
      id: `hook-custom-${Date.now()}`,
      slug: `hooks/custom-check-${idx}`,
      phase: 'post-run',
      name: `Пользовательская проверка #${idx}`,
      description: 'Автоматический аудит результата воркера по заданному критерию.',
      checkInstruction:
        'Проверь ответ воркера на соблюдение проектных ограничений и отсутствие недосказанностей.',
      severity: 'warn',
      enabledByDefault: true,
      isCustom: true,
    };
    onCreateHook(created);
    setSelectedHookId(created.id);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-zinc-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('commands')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'commands'
                ? 'bg-white dark:bg-slate-900 text-zinc-900 dark:text-slate-100 shadow-xs'
                : 'text-zinc-600 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-slate-100'
            }`}
          >
            Слэш-команды ({commands.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('hooks')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              subTab === 'hooks'
                ? 'bg-white dark:bg-slate-900 text-zinc-900 dark:text-slate-100 shadow-xs'
                : 'text-zinc-600 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-slate-100'
            }`}
          >
            Хуки пайплайна ({hooks.length})
          </button>
        </div>

        <button
          type="button"
          onClick={subTab === 'commands' ? handleCreateCommand : handleCreateHook}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{subTab === 'commands' ? 'Новая команда' : 'Новый хук'}</span>
        </button>
      </div>

      {subTab === 'commands' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="p-3 border-b border-zinc-200 dark:border-slate-800">
              <div className="relative">
                <Search className="h-4 w-4 text-zinc-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={cmdSearch}
                  onChange={(e) => setCmdSearch(e.target.value)}
                  placeholder="Поиск среди 98 команд ECC..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                />
              </div>
            </div>

            <div className="divide-y divide-zinc-200 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
              {filteredCommands.map((cmd) => {
                const target = agents.find((a) => a.id === cmd.targetAgentId);
                const selected = activeCommand?.id === cmd.id;
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    onClick={() => setSelectedCommandId(cmd.id)}
                    className={`w-full text-left p-3.5 transition-colors ${
                      selected
                        ? 'bg-blue-50/70 dark:bg-blue-950/30'
                        : 'hover:bg-zinc-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold text-blue-700 dark:text-blue-400">
                        {cmd.command}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500 dark:text-slate-400 truncate">
                        → {target?.slug ?? cmd.targetAgentId}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-slate-400 line-clamp-2">
                      {cmd.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl p-5">
            {activeCommand && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-slate-800">
                  <div>
                    <h2 className="font-mono text-lg font-semibold text-zinc-900 dark:text-slate-100">
                      {activeCommand.command}
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-slate-400 mt-0.5">
                      Пресет команды ECC для соло-песочницы
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {activeCommand.isCustom && (
                      <button
                        type="button"
                        onClick={() => onDeleteCommand(activeCommand.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Удалить</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onLaunchCommand(activeCommand.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>Запустить с командой</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                      Команда
                    </span>
                    <input
                      type="text"
                      value={activeCommand.command}
                      onChange={(e) =>
                        onUpdateCommand({ ...activeCommand, command: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                      Целевой воркер
                    </span>
                    <select
                      value={activeCommand.targetAgentId}
                      onChange={(e) =>
                        onUpdateCommand({
                          ...activeCommand,
                          targetAgentId: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                    >
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.slug})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                    Описание
                  </span>
                  <input
                    type="text"
                    value={activeCommand.description}
                    onChange={(e) =>
                      onUpdateCommand({ ...activeCommand, description: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                    Шаблон задачи
                  </span>
                  <textarea
                    rows={8}
                    value={activeCommand.promptTemplate}
                    onChange={(e) =>
                      onUpdateCommand({
                        ...activeCommand,
                        promptTemplate: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-950 font-mono text-xs leading-relaxed text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl divide-y divide-zinc-200 dark:divide-slate-800 overflow-hidden">
            {hooks.map((hook) => {
              const selected = activeHook?.id === hook.id;
              return (
                <button
                  key={hook.id}
                  type="button"
                  onClick={() => setSelectedHookId(hook.id)}
                  className={`w-full text-left p-4 transition-colors ${
                    selected
                      ? 'bg-blue-50/70 dark:bg-blue-950/30'
                      : 'hover:bg-zinc-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-slate-100">
                      {hook.name}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-500 dark:text-slate-400 shrink-0">
                      {hook.phase}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-slate-400 line-clamp-2">
                    {hook.description}
                  </p>
                  <div className="mt-2 font-mono text-[11px] text-zinc-400 dark:text-slate-500">
                    {hook.slug} · {hook.severity === 'block' ? 'блокирующий' : 'предупреждение'}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl p-5">
            {activeHook && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-slate-800">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">
                      {activeHook.name}
                    </h2>
                    <p className="font-mono text-xs text-zinc-500 dark:text-slate-400 mt-0.5">
                      {activeHook.slug}
                    </p>
                  </div>
                  {activeHook.isCustom && (
                    <button
                      type="button"
                      onClick={() => onDeleteHook(activeHook.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-slate-700 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Удалить</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                      Этап срабатывания
                    </span>
                    <select
                      value={activeHook.phase}
                      onChange={(e) =>
                        onUpdateHook({
                          ...activeHook,
                          phase: e.target.value as HookPhase,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                    >
                      <option value="pre-run">pre-run (До запуска воркера)</option>
                      <option value="post-run">post-run (Аудит ответа воркера)</option>
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                      Уровень реакции
                    </span>
                    <select
                      value={activeHook.severity}
                      onChange={(e) =>
                        onUpdateHook({
                          ...activeHook,
                          severity: e.target.value as HookSeverity,
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                    >
                      <option value="block">block (Блокировать выполнение)</option>
                      <option value="warn">warn (Вывести предупреждение)</option>
                    </select>
                  </label>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                    Описание проверки
                  </span>
                  <input
                    type="text"
                    value={activeHook.description}
                    onChange={(e) =>
                      onUpdateHook({ ...activeHook, description: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                    Инструкция инспектора проверки
                  </span>
                  <textarea
                    rows={5}
                    value={activeHook.checkInstruction}
                    onChange={(e) =>
                      onUpdateHook({
                        ...activeHook,
                        checkInstruction: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-950 font-mono text-xs leading-relaxed text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
