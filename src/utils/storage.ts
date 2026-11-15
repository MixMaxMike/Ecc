import { createInitialWorkspaceState } from '../data/eccCatalog';
import { EccWorkspaceState } from '../types/ecc';

const OVERRIDES_KEY = 'ecc_worker_studio_overrides_v2';
const THEME_KEY = 'ecc_worker_studio_theme_v1';

export interface WorkspaceOverrides {
  rosterStatusById: Record<string, 'active' | 'bench'>;
  customAgents: EccWorkspaceState['agents'];
  editedAgents: Record<string, Partial<EccWorkspaceState['agents'][number]>>;
  customRules: EccWorkspaceState['rules'];
  editedRules: Record<string, Partial<EccWorkspaceState['rules'][number]>>;
  customSkills: EccWorkspaceState['skills'];
  editedSkills: Record<string, Partial<EccWorkspaceState['skills'][number]>>;
  customCommands: EccWorkspaceState['commands'];
  editedCommands: Record<string, Partial<EccWorkspaceState['commands'][number]>>;
  hooks: EccWorkspaceState['hooks'];
  runHistory: EccWorkspaceState['runHistory'];
  orchestratorHistory: EccWorkspaceState['orchestratorHistory'];
}

export function createEmptyOverrides(): WorkspaceOverrides {
  const fallback = createInitialWorkspaceState();
  return {
    rosterStatusById: {},
    customAgents: [],
    editedAgents: {},
    customRules: [],
    editedRules: {},
    customSkills: [],
    editedSkills: {},
    customCommands: [],
    editedCommands: {},
    hooks: fallback.hooks,
    runHistory: [],
    orchestratorHistory: [],
  };
}

export function loadOverrides(): WorkspaceOverrides {
  const empty = createEmptyOverrides();
  try {
    const raw = window.localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<WorkspaceOverrides>;
    return {
      rosterStatusById: parsed.rosterStatusById ?? {},
      customAgents: Array.isArray(parsed.customAgents) ? parsed.customAgents : [],
      editedAgents: parsed.editedAgents ?? {},
      customRules: Array.isArray(parsed.customRules) ? parsed.customRules : [],
      editedRules: parsed.editedRules ?? {},
      customSkills: Array.isArray(parsed.customSkills) ? parsed.customSkills : [],
      editedSkills: parsed.editedSkills ?? {},
      customCommands: Array.isArray(parsed.customCommands) ? parsed.customCommands : [],
      editedCommands: parsed.editedCommands ?? {},
      hooks: Array.isArray(parsed.hooks) && parsed.hooks.length > 0 ? parsed.hooks : empty.hooks,
      runHistory: Array.isArray(parsed.runHistory) ? parsed.runHistory.slice(0, 25) : [],
      orchestratorHistory: Array.isArray(parsed.orchestratorHistory)
        ? parsed.orchestratorHistory.slice(0, 15)
        : [],
    };
  } catch {
    return empty;
  }
}

export function saveOverrides(overrides: WorkspaceOverrides): void {
  try {
    window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearOverrides(): WorkspaceOverrides {
  const empty = createEmptyOverrides();
  saveOverrides(empty);
  return empty;
}

export function mergeRepositoryWithOverrides(
  repo: {
    agents: EccWorkspaceState['agents'];
    rules: EccWorkspaceState['rules'];
    commands: EccWorkspaceState['commands'];
    skills: EccWorkspaceState['skills'];
  },
  overrides: WorkspaceOverrides
): EccWorkspaceState {
  const baseAgents = repo.agents.map((a) => {
    const edit = overrides.editedAgents[a.id];
    const status = overrides.rosterStatusById[a.id] ?? a.rosterStatus;
    return { ...a, ...edit, rosterStatus: status };
  });

  const customAgents = overrides.customAgents.map((a) => ({
    ...a,
    rosterStatus: overrides.rosterStatusById[a.id] ?? a.rosterStatus,
  }));

  const baseRules = repo.rules.map((r) => ({
    ...r,
    ...overrides.editedRules[r.id],
  }));

  const baseSkills = repo.skills.map((s) => ({
    ...s,
    ...overrides.editedSkills[s.id],
  }));

  const baseCommands = repo.commands.map((c) => ({
    ...c,
    ...overrides.editedCommands[c.id],
  }));

  return {
    agents: [...customAgents, ...baseAgents],
    rules: [...overrides.customRules, ...baseRules],
    skills: [...overrides.customSkills, ...baseSkills],
    commands: [...overrides.customCommands, ...baseCommands],
    hooks: overrides.hooks,
    runHistory: overrides.runHistory,
    orchestratorHistory: overrides.orchestratorHistory,
  };
}

export function loadThemePreference(): 'light' | 'dark' {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
  } catch {
    // Ignore storage read errors
  }
  return 'light';
}

export function saveThemePreference(theme: 'light' | 'dark'): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore storage write errors
  }
}
