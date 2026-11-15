import {
  EccCommand,
  EccHook,
  EccRule,
  EccSkill,
  EccWorkspaceState,
  WorkerAgent,
} from '../types/ecc';

export function assembleWorkerSystemPrompt(
  agent: WorkerAgent,
  rules: EccRule[],
  skills: EccSkill[]
): string {
  const activeRules = rules.filter(
    (rule) => rule.alwaysApply || agent.attachedRuleIds.includes(rule.id)
  );
  const activeSkills = skills.filter((skill) =>
    agent.attachedSkillIds.includes(skill.id)
  );

  const sections: string[] = [];

  sections.push(`# Роль воркера: ${agent.name} (${agent.slug})`);
  sections.push(agent.systemPrompt.trim());

  if (activeRules.length > 0) {
    sections.push('## Обязательные правила (ECC Rules)');
    activeRules.forEach((rule) => {
      const scopeTag = rule.alwaysApply ? 'Всегда активно' : `Подключено (${rule.category})`;
      sections.push(`### ${rule.title} [${rule.slug} · ${scopeTag}]\n${rule.content.trim()}`);
    });
  }

  if (activeSkills.length > 0) {
    sections.push('## Подключённые скиллы и воркфлоу (ECC Skills)');
    activeSkills.forEach((skill) => {
      sections.push(`### ${skill.name} [${skill.slug}]\n${skill.markdownBody.trim()}`);
    });
  }

  return sections.join('\n\n');
}

export function generateAgentsMarkdownBundle(state: EccWorkspaceState): string {
  const lines: string[] = [];
  lines.push('# AGENTS.md — Инструкции для AI-воркеров (адаптация affaan-m/ECC)');
  lines.push('');
  lines.push(
    'Этот документ собран в **ECC Worker Studio** и содержит роли воркеров, общие правила, скиллы, команды и политики проверок.'
  );
  lines.push('');

  const globalRules = state.rules.filter((r) => r.alwaysApply);
  if (globalRules.length > 0) {
    lines.push('## 1. Глобальные правила проекта (Always Apply)');
    lines.push('');
    for (const rule of globalRules) {
      lines.push(`### ${rule.title} (\`${rule.slug}\`)`);
      lines.push(rule.content.trim());
      lines.push('');
    }
  }

  const scopedRules = state.rules.filter((r) => !r.alwaysApply);
  if (scopedRules.length > 0) {
    lines.push('## 2. Селективные стандарты (Scoped Rules)');
    lines.push('');
    for (const rule of scopedRules) {
      lines.push(`### ${rule.title} (\`${rule.slug}\`)`);
      lines.push(rule.content.trim());
      lines.push('');
    }
  }

  lines.push('## 3. Профили воркеров (Agents)');
  lines.push('');
  for (const agent of state.agents) {
    lines.push(`### ${agent.name} (\`${agent.slug}\`)`);
    lines.push(`> ${agent.roleSummary}`);
    lines.push('');
    lines.push(agent.systemPrompt.trim());
    lines.push('');
    const agentRules = state.rules.filter((r) => agent.attachedRuleIds.includes(r.id));
    const agentSkills = state.skills.filter((s) => agent.attachedSkillIds.includes(s.id));
    const agentHooks = state.hooks.filter((h) => agent.attachedHookIds.includes(h.id));

    if (agentRules.length > 0) {
      lines.push(`- **Подключённые правила:** ${agentRules.map((r) => r.slug).join(', ')}`);
    }
    if (agentSkills.length > 0) {
      lines.push(`- **Скиллы:** ${agentSkills.map((s) => s.slug).join(', ')}`);
    }
    if (agentHooks.length > 0) {
      lines.push(`- **Проверки (Hooks):** ${agentHooks.map((h) => h.slug).join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## 4. Скиллы и воркфлоу (Skills)');
  lines.push('');
  for (const skill of state.skills) {
    lines.push(`### ${skill.name} (\`${skill.slug}\`)`);
    lines.push(`*Триггер:* ${skill.triggerHint}`);
    lines.push('');
    lines.push(skill.markdownBody.trim());
    lines.push('');
  }

  lines.push('## 5. Слэш-команды и хуки (Commands & Hooks)');
  lines.push('');
  for (const cmd of state.commands) {
    const target = state.agents.find((a) => a.id === cmd.targetAgentId);
    lines.push(
      `- **\`${cmd.command}\`** → \`${target?.slug ?? cmd.targetAgentId}\`: ${cmd.description}`
    );
  }
  lines.push('');
  for (const hook of state.hooks) {
    lines.push(
      `- **\`${hook.slug}\`** (${hook.phase}, ${hook.severity}): ${hook.description}`
    );
  }

  return lines.join('\n');
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/markdown;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) {
    return `${ms} мс`;
  }
  return `${(ms / 1000).toFixed(1)} с`;
}

export function findCommandTarget(
  commands: EccCommand[],
  hooks: EccHook[],
  commandId: string
): { command?: EccCommand; defaultHooksCount: number } {
  const command = commands.find((c) => c.id === commandId);
  const defaultHooksCount = hooks.filter((h) => h.enabledByDefault).length;
  return { command, defaultHooksCount };
}
