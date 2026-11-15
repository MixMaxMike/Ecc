import { Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EccSkill } from '../types/ecc';

interface SkillsViewProps {
  skills: EccSkill[];
  onUpdateSkill: (skill: EccSkill) => void;
  onCreateSkill: (skill: EccSkill) => void;
  onDeleteSkill: (skillId: string) => void;
}

export function SkillsView({
  skills,
  onUpdateSkill,
  onCreateSkill,
  onDeleteSkill,
}: SkillsViewProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(skills[0]?.id ?? '');
  const [loadingBody, setLoadingBody] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        s.triggerHint.toLowerCase().includes(q)
    );
  }, [skills, search]);

  const activeSkill =
    skills.find((s) => s.id === selectedId) ?? filtered[0] ?? skills[0];

  useEffect(() => {
    if (!activeSkill || activeSkill.markdownBody || activeSkill.isCustom) return;
    let cancelled = false;
    setLoadingBody(true);
    fetch(`/api/ecc/skills/${encodeURIComponent(activeSkill.id)}`)
      .then((r) => r.json())
      .then((data: { markdownBody?: string }) => {
        if (!cancelled && data.markdownBody) {
          onUpdateSkill({ ...activeSkill, markdownBody: data.markdownBody });
        }
      })
      .catch(() => {
        // Ignore fetch errors
      })
      .finally(() => {
        if (!cancelled) setLoadingBody(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSkill?.id]);

  const handleCreate = () => {
    const idx = skills.length + 1;
    const created: EccSkill = {
      id: `skill-custom-${Date.now()}`,
      slug: `skills/custom-skill-${idx}`,
      name: `Новый скилл #${idx}`,
      triggerHint: 'Укажите сценарий, при котором воркер должен применять этот воркфлоу',
      workflowSteps: [
        'Шаг 1: Проверить входные данные и контекст.',
        'Шаг 2: Выполнить основную процедуру.',
      ],
      markdownBody:
        '## Инструкция скилла\n1. Собери контекст.\n2. Примени стандарт проекта.\n3. Проверь итоговый результат.',
      isCustom: true,
      source: 'custom',
    };
    onCreateSkill(created);
    setSelectedId(created.id);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <section className="xl:col-span-4 bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-slate-100">
              Скиллы ECC ({skills.length})
            </h2>
            <button
              type="button"
              onClick={handleCreate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Создать</span>
            </button>
          </div>

          <div className="relative">
            <Search className="h-4 w-4 text-zinc-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск среди 314 скиллов..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
            />
          </div>
        </div>

        <div className="divide-y divide-zinc-200 dark:divide-slate-800 max-h-[650px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <p className="text-sm text-zinc-500 dark:text-slate-400">
                Скиллы не найдены.
              </p>
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Сбросить поиск
              </button>
            </div>
          ) : (
            filtered.map((skill) => {
              const selected = activeSkill?.id === skill.id;
              return (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => setSelectedId(skill.id)}
                  className={`w-full text-left p-3.5 transition-colors ${
                    selected
                      ? 'bg-blue-50/70 dark:bg-blue-950/30'
                      : 'hover:bg-zinc-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="text-sm font-medium text-zinc-900 dark:text-slate-100">
                    {skill.name}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-slate-400 line-clamp-2">
                    {skill.triggerHint}
                  </div>
                  <div className="mt-1.5 font-mono text-[11px] text-zinc-400 dark:text-slate-500 tabular-nums">
                    {skill.slug} · {skill.workflowSteps.length} шага
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      <section className="xl:col-span-8 bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl p-5">
        {!activeSkill ? (
          <div className="p-8 text-center text-sm text-zinc-500 dark:text-slate-400">
            Выберите скилл для редактирования.
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">
                  {activeSkill.name}
                </h2>
                <p className="font-mono text-xs text-zinc-500 dark:text-slate-400 mt-0.5">
                  {activeSkill.slug}
                </p>
              </div>
              {activeSkill.isCustom && (
                <button
                  type="button"
                  onClick={() => onDeleteSkill(activeSkill.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-slate-700 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Удалить</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                  Название скилла
                </span>
                <input
                  type="text"
                  value={activeSkill.name}
                  onChange={(e) =>
                    onUpdateSkill({ ...activeSkill, name: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                  Условие срабатывания (Trigger Hint)
                </span>
                <input
                  type="text"
                  value={activeSkill.triggerHint}
                  onChange={(e) =>
                    onUpdateSkill({ ...activeSkill, triggerHint: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                Ключевые этапы (по одному на строке)
              </span>
              <textarea
                rows={4}
                value={activeSkill.workflowSteps.join('\n')}
                onChange={(e) =>
                  onUpdateSkill({
                    ...activeSkill,
                    workflowSteps: e.target.value
                      .split('\n')
                      .filter((l) => l.trim().length > 0),
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                Содержимое SKILL.md {loadingBody ? '(загрузка из каталога...)' : ''}
              </span>
              <textarea
                rows={12}
                value={activeSkill.markdownBody}
                onChange={(e) =>
                  onUpdateSkill({ ...activeSkill, markdownBody: e.target.value })
                }
                placeholder={loadingBody ? 'Загрузка SKILL.md...' : ''}
                className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-950 font-mono text-xs leading-relaxed text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
              />
            </label>
          </div>
        )}
      </section>
    </div>
  );
}
