import {
  BookOpen,
  Bot,
  Menu,
  Moon,
  Network,
  Play,
  RotateCcw,
  ShieldCheck,
  Sun,
  Terminal,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavSection } from '../types/ecc';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  counts: {
    activeAgents: number;
    totalAgents: number;
    rules: number;
    skills: number;
    commandsAndHooks: number;
    runs: number;
  };
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onResetDefaults: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeSection,
  onSelectSection,
  counts,
  theme,
  onToggleTheme,
  onResetDefaults,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [confirmReset, setConfirmReset] = useState(false);

  const navItems: Array<{
    id: NavSection;
    label: string;
    badge: string;
    icon: typeof Bot;
  }> = [
    {
      id: 'orchestrator',
      label: 'Оркестратор (Team)',
      badge: `${counts.activeAgents}/${counts.totalAgents}`,
      icon: Network,
    },
    {
      id: 'agents',
      label: 'Штат воркеров',
      badge: `${counts.totalAgents}`,
      icon: Bot,
    },
    {
      id: 'rules',
      label: 'Правила (Rules)',
      badge: `${counts.rules}`,
      icon: ShieldCheck,
    },
    {
      id: 'skills',
      label: 'Скиллы (Skills)',
      badge: `${counts.skills}`,
      icon: BookOpen,
    },
    {
      id: 'commands',
      label: 'Команды и хуки',
      badge: `${counts.commandsAndHooks}`,
      icon: Terminal,
    },
    {
      id: 'runner',
      label: 'Соло-песочница',
      badge: `${counts.runs}`,
      icon: Play,
    },
  ];

  const handleSelect = (id: NavSection) => {
    onSelectSection(id);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white dark:bg-slate-900 border-r border-zinc-200 dark:border-slate-800">
      <div className="flex h-14 items-center justify-between px-5 border-b border-zinc-200 dark:border-slate-800">
        <span className="font-display text-base font-bold tracking-tight text-zinc-900 dark:text-slate-100 whitespace-nowrap shrink-0">
          ECC Worker Studio
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-900 dark:text-slate-400 dark:hover:text-slate-100"
          aria-label="Закрыть меню"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-3 overflow-y-auto" aria-label="Основная навигация">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              <span
                className={`font-mono text-xs tabular-nums shrink-0 ${
                  isActive
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-zinc-400 dark:text-slate-500'
                }`}
              >
                {item.badge}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-zinc-200 dark:border-slate-800 space-y-2">
        <button
          type="button"
          onClick={onToggleTheme}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
        >
          <span className="flex items-center gap-2 whitespace-nowrap">
            {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            <span>{theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}</span>
          </span>
          <span className="font-mono text-[11px] text-zinc-400 dark:text-slate-500">
            {theme === 'light' ? 'Light' : 'Dark'}
          </span>
        </button>

        {!confirmReset ? (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-nowrap">Сбросить правки ECC</span>
          </button>
        ) : (
          <div className="p-2.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 space-y-2">
            <p className="text-xs text-amber-900 dark:text-amber-200 leading-snug">
              Вернуть исходный штат из 71 агента ECC и очистить локальные правки?
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onResetDefaults();
                  setConfirmReset(false);
                }}
                className="flex-1 px-2.5 py-1.5 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors whitespace-nowrap"
              >
                Сбросить
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="flex-1 px-2.5 py-1.5 rounded-md border border-zinc-300 dark:border-slate-700 text-zinc-700 dark:text-slate-300 text-xs font-medium hover:bg-white dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 dark:border-slate-800 text-zinc-700 dark:text-slate-300 hover:bg-zinc-100 dark:hover:bg-slate-800"
      aria-label="Открыть навигацию"
    >
      <Menu className="h-4 w-4" />
    </button>
  );
}
