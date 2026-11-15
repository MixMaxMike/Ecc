import { Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EccRule, RuleCategory } from '../types/ecc';

interface RulesViewProps {
  rules: EccRule[];
  onUpdateRule: (rule: EccRule) => void;
  onCreateRule: (rule: EccRule) => void;
  onDeleteRule: (ruleId: string) => void;
}

export function RulesView({
  rules,
  onUpdateRule,
  onCreateRule,
  onDeleteRule,
}: RulesViewProps) {
  const [category, setCategory] = useState<'all' | RuleCategory>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(rules[0]?.id ?? '');

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    rules.forEach((r) => set.add(r.category));
    return Array.from(set).sort();
  }, [rules]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter((r) => {
      const matchCat = category === 'all' || r.category === category;
      const matchQuery =
        !q ||
        r.title.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        r.content.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [rules, category, search]);

  const activeRule = rules.find((r) => r.id === selectedId) ?? filtered[0] ?? rules[0];

  const handleCreate = () => {
    const idx = rules.length + 1;
    const targetCat: RuleCategory = category === 'all' ? 'common' : category;
    const created: EccRule = {
      id: `rule-custom-${Date.now()}`,
      slug: `${targetCat}/custom-rule-${idx}`,
      category: targetCat,
      title: `Новое правило #${idx}`,
      content: 'Опишите конкретное инженерное требование или ограничение для воркеров.',
      alwaysApply: false,
      isCustom: true,
      source: 'custom',
    };
    onCreateRule(created);
    setSelectedId(created.id);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
          >
            <option value="all">Все категории ({rules.length})</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setCategory('common')}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              category === 'common'
                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-700'
                : 'border-zinc-200 dark:border-slate-700 text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800'
            }`}
          >
            common
          </button>
          <button
            type="button"
            onClick={() => setCategory('typescript')}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              category === 'typescript'
                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-700'
                : 'border-zinc-200 dark:border-slate-700 text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800'
            }`}
          >
            typescript
          </button>
          <button
            type="button"
            onClick={() => setCategory('python')}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              category === 'python'
                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-700'
                : 'border-zinc-200 dark:border-slate-700 text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800'
            }`}
          >
            python
          </button>
        </div>

        <div className="flex items-center gap-3 flex-1 sm:flex-initial">
          <div className="relative flex-1 sm:w-64">
            <Search className="h-4 w-4 text-zinc-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск среди 121 правил..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-zinc-900 dark:text-slate-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
            />
          </div>
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Добавить правило</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-5 bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl divide-y divide-zinc-200 dark:divide-slate-800 max-h-[650px] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm text-zinc-500 dark:text-slate-400">
                Нет правил, подходящих под выбранные фильтры.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCategory('all');
                  setSearch('');
                }}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Показать все правила
              </button>
            </div>
          ) : (
            filtered.map((rule) => {
              const selected = activeRule?.id === rule.id;
              return (
                <button
                  key={rule.id}
                  type="button"
                  onClick={() => setSelectedId(rule.id)}
                  className={`w-full text-left p-3.5 transition-colors ${
                    selected
                      ? 'bg-blue-50/70 dark:bg-blue-950/30'
                      : 'hover:bg-zinc-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-900 dark:text-slate-100">
                      {rule.title}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-500 dark:text-slate-400 shrink-0">
                      {rule.alwaysApply ? 'always' : 'scoped'}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-zinc-400 dark:text-slate-500">
                    {rule.slug} · {rule.category}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="xl:col-span-7 bg-white dark:bg-slate-900 border border-zinc-200 dark:border-slate-800 rounded-xl p-5">
          {!activeRule ? (
            <div className="p-8 text-center text-sm text-zinc-500 dark:text-slate-400">
              Выберите правило для просмотра или редактирования.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 pb-4 border-b border-zinc-200 dark:border-slate-800">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900 dark:text-slate-100">
                    {activeRule.title}
                  </h2>
                  <p className="text-xs font-mono text-zinc-500 dark:text-slate-400 mt-0.5">
                    {activeRule.slug}
                  </p>
                </div>
                {activeRule.isCustom && (
                  <button
                    type="button"
                    onClick={() => onDeleteRule(activeRule.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-slate-700 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Удалить</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                    Название стандарта
                  </span>
                  <input
                    type="text"
                    value={activeRule.title}
                    onChange={(e) =>
                      onUpdateRule({ ...activeRule, title: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                    Категория / язык
                  </span>
                  <input
                    type="text"
                    value={activeRule.category}
                    onChange={(e) =>
                      onUpdateRule({ ...activeRule, category: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-lg border border-zinc-200 dark:border-slate-800 bg-zinc-50 dark:bg-slate-950 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeRule.alwaysApply}
                  onChange={(e) =>
                    onUpdateRule({ ...activeRule, alwaysApply: e.target.checked })
                  }
                  className="rounded border-zinc-300 text-blue-600 focus:ring-blue-600"
                />
                <span className="text-xs font-medium text-zinc-800 dark:text-slate-200">
                  Всегда включать в системный промпт каждого воркера (alwaysApply)
                </span>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-700 dark:text-slate-300">
                  Текст правила (Markdown из ECC)
                </span>
                <textarea
                  rows={12}
                  value={activeRule.content}
                  onChange={(e) =>
                    onUpdateRule({ ...activeRule, content: e.target.value })
                  }
                  className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-slate-700 bg-zinc-50 dark:bg-slate-950 font-mono text-xs leading-relaxed text-zinc-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
