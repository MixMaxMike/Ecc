import {
  EccCommand,
  EccHook,
  EccRule,
  EccSkill,
  EccWorkspaceState,
  WorkerAgent,
} from '../types/ecc';

export const DEFAULT_RULES: EccRule[] = [
  {
    id: 'rule-immutability',
    slug: 'common/immutability',
    category: 'common',
    title: 'Неизменяемость данных и чистые трансформации',
    alwaysApply: true,
    content:
      'Предпочитай неизменяемые структуры данных: создавай новые объекты и массивы вместо мутации существующих параметров или состояния на месте. Явно отделяй чистую бизнес-логику от побочных эффектов ввода-вывода.',
  },
  {
    id: 'rule-research-first',
    slug: 'common/research-first',
    category: 'common',
    title: 'Сначала исследование контекста, потом правки',
    alwaysApply: true,
    content:
      'Никогда не предлагай изменения вслепую. Сначала перечисли допущения, проверь границы модулей, зависимости и контракты API, и только затем формулируй план или код.',
  },
  {
    id: 'rule-ts-strict',
    slug: 'typescript/strict-types',
    category: 'typescript',
    title: 'Строгая типизация без any',
    alwaysApply: false,
    content:
      'Запрещено использовать неявный или явный any, отключение проверок @ts-ignore без обоснования и невалидированные приведения типов на границах API. Используй дискриминированные объединения и явные интерфейсы.',
  },
  {
    id: 'rule-security-secrets',
    slug: 'security/secrets-and-boundaries',
    category: 'security',
    title: 'Изоляция секретов и валидация границ',
    alwaysApply: true,
    content:
      'API-ключи, токены и секреты окружения не должны попадать в клиентский код, логи или ответы API. Любой пользовательский ввод и внешние payload должны валидироваться на границе сервера до выполнения логики.',
  },
  {
    id: 'rule-tdd-coverage',
    slug: 'testing/tdd-red-green-refactor',
    category: 'testing',
    title: 'Проверка граничных случаев и цикл Red-Green-Refactor',
    alwaysApply: false,
    content:
      'Для каждой новой функции или исправления бага сначала формулируй проверяемый критерий или падающий тест (Red), затем минимальную реализацию (Green) и финальный рефакторинг (Refactor) с проверкой граничных случаев.',
  },
];

export const DEFAULT_SKILLS: EccSkill[] = [
  {
    id: 'skill-planning-workflow',
    slug: 'skills/structured-planning',
    name: 'Декомпозиция и пошаговое планирование',
    triggerHint: 'Новые фичи, многофайловый рефакторинг, миграции',
    workflowSteps: [
      'Зафиксировать цель, ограничения и критерии приёмки.',
      'Разбить работу на независимые проверяемые этапы.',
      'Определить риски, откаты и точки проверки после каждого шага.',
    ],
    markdownBody: `## Воркфлоу планирования (ECC Skill)
1. **Контекст и ограничения**: выяви входные данные, зависимости и потенциальные точки отказа.
2. **Поэтапный план**: разбей задачу на атомарные шаги с ожидаемым результатом каждого шага.
3. **Матрица проверки**: укажи, как проверить корректность (юнит-тесты, интеграционная проверка, ручной сценарий).`,
  },
  {
    id: 'skill-tdd-workflow',
    slug: 'skills/tdd-workflow',
    name: 'TDD-цикл разработки через тестирование',
    triggerHint: 'Реализация бизнес-логики, исправление дефектов',
    workflowSteps: [
      'Описать спецификацию входа/выхода и граничные кейсы.',
      'Спроектировать набор падающих тестов (happy path + edge cases).',
      'Реализовать минимальный код для прохождения тестов и очистить дублирование.',
    ],
    markdownBody: `## Воркфлоу TDD (ECC Skill)
- **Шаг 1 (Red)**: сначала сформулируй конкретные тест-кейсы, включая null/empty, невалидные типы и ошибки сети.
- **Шаг 2 (Green)**: напиши минимально достаточную реализацию без преждевременной оптимизации.
- **Шаг 3 (Refactor)**: выдели чистые функции, проверь читаемость и отсутствие мутаций.`,
  },
  {
    id: 'skill-security-audit',
    slug: 'skills/security-checklist',
    name: 'Аудит уязвимостей и утечек секретов',
    triggerHint: 'Аутентификация, API-эндпоинты, работа с БД и пользовательским вводом',
    workflowSteps: [
      'Проверить инъекции (SQL, XSS, Command Injection) и обход авторизации.',
      'Проверить обработку секретов, CORS, rate limiting и утечки в стектрейсах.',
      'Ранжировать находки по критичности (Critical / High / Medium) с патчем.',
    ],
    markdownBody: `## Протокол Security Review (ECC Skill)
- Проверяй наличие хардкодных токенов, ключей и небезопасных шаблонов.
- Оценивай доверенные границы: клиентские данные всегда считаются недоверенными.
- Для каждой найденной проблемы укажи: **Риск**, **Вектор атаки** и **Конкретное исправление**.`,
  },
  {
    id: 'skill-code-review',
    slug: 'skills/code-health-review',
    name: 'Глубокое ревью качества и поддерживаемости кода',
    triggerHint: 'Проверка Pull Request, ревью сгенерированных модулей',
    workflowSteps: [
      'Проверить корректность логики и обработку ошибок.',
      'Выявить скрытые состояния гонки, утечки памяти и лишнюю сложность.',
      'Сформировать список замечаний с приоритетами (Blocker / Suggestion / Nit).',
    ],
    markdownBody: `## Протокол Code Review (ECC Skill)
- Сначала оцени архитектуру и корректность алгоритма, затем детали стиля.
- Проверь обработку пустых состояний, таймаутов и отмену асинхронных операций.
- Избегай общих фраз — предлагай конкретный улучшенный фрагмент кода.`,
  },
  {
    id: 'skill-build-repair',
    slug: 'skills/build-error-resolution',
    name: 'Быстрое устранение ошибок сборки и типизации',
    triggerHint: 'Ошибки TypeScript, падения Vite/Webpack, сломанные импорты',
    workflowSteps: [
      'Определить первопричину ошибки (а не маскировать симптомы).',
      'Предложить минимальное точечное исправление без ломки контрактов.',
      'Убедиться, что сопутствующие модули не затронуты регрессией.',
    ],
    markdownBody: `## Протокол Build Error Resolver (ECC Skill)
- Анализируй первый сбой в цепочке компиляции — последующие ошибки часто являются каскадными.
- Не заменяй сломанные типы на \`any\` и не отключай строгий режим ради зелёной сборки.`,
  },
];

export const DEFAULT_HOOKS: EccHook[] = [
  {
    id: 'hook-pre-secret-guard',
    slug: 'hooks/pre-secret-guard',
    phase: 'pre-run',
    name: 'Защита от передачи секретов во входном промпте',
    description:
      'Проверяет текст задачи до отправки модели на наличие API-ключей, приватных токенов, паролей и JWT.',
    checkInstruction:
      'Проверь, не содержит ли ввод пользователя незамаскированные ключи API (sk-..., AIza..., ghp_...), приватные ключи PEM, пароли в URL или Bearer-токены.',
    severity: 'block',
    enabledByDefault: true,
  },
  {
    id: 'hook-pre-context-clarity',
    slug: 'hooks/pre-context-clarity',
    phase: 'pre-run',
    name: 'Проверка полноты постановки задачи',
    description:
      'Предупреждает, если запрос слишком короткий или не содержит целевого контекста (стек, формат результата).',
    checkInstruction:
      'Оцени, достаточно ли в запросе контекста для точной инженерной работы. Если не хватает языка, цели или ограничений — выведи краткое предупреждение.',
    severity: 'warn',
    enabledByDefault: true,
  },
  {
    id: 'hook-post-security-scan',
    slug: 'hooks/post-security-scan',
    phase: 'post-run',
    name: 'Пост-проверка ответа на безопасность (AgentShield)',
    description:
      'Аудирует сгенерированный воркером план или код на отсутствие небезопасных паттернов (eval, SQL-конкатенация, утечка ключей).',
    checkInstruction:
      'Проанализируй ответ воркера как аудитор безопасности. Проверь, нет ли в предложенном коде или инструкции уязвимостей XSS, SQLi, eval, хардкода секретов или отключения валидации. Верни вердикт PASS или WARN/FAIL с коротким списком.',
    severity: 'warn',
    enabledByDefault: true,
  },
  {
    id: 'hook-post-actionability',
    slug: 'hooks/post-actionability',
    phase: 'post-run',
    name: 'Контроль конкретности и отсутствия заглушек',
    description:
      'Проверяет, что воркер дал законченное решение без TODO-заглушек и расплывчатых обещаний.',
    checkInstruction:
      'Проверь ответ воркера: содержит ли он конкретные шаги, проверочные критерии или рабочий код без пустых TODO-заглушек. Дай краткую оценку готовности.',
    severity: 'warn',
    enabledByDefault: false,
  },
];

export const DEFAULT_AGENTS: WorkerAgent[] = [
  {
    id: 'agent-planner',
    slug: 'ecc:planner',
    name: 'Планировщик (Planner)',
    roleSummary: 'Проектирует пошаговый план реализации до написания первой строчки кода.',
    defaultThinkingLevel: 'HIGH',
    rosterStatus: 'active',
    attachedRuleIds: ['rule-research-first', 'rule-immutability'],
    attachedSkillIds: ['skill-planning-workflow'],
    attachedHookIds: ['hook-pre-secret-guard', 'hook-post-actionability'],
    systemPrompt: `Ты — старший инженер-планировщик (ecc:planner).
Твоя задача — превратить запрос пользователя в чёткий, проверяемый план реализации без преждевременного написания лишнего кода.

Правила работы:
1. Сначала сформулируй цель задачи, ключевые ограничения и неясные допущения.
2. Разбей реализацию на последовательные фазы с конкретными результатами каждой фазы.
3. Для каждого этапа укажи потенциальные риски, пограничные сценарии и способ верификации.
4. Отвечай структурированно на русском языке, сохраняя точные технические термины.`,
  },
  {
    id: 'agent-architect',
    slug: 'ecc:architect',
    name: 'Архитектор систем (Architect)',
    roleSummary: 'Проектирует границы модулей, контракты данных, масштабирование и компромиссы.',
    defaultThinkingLevel: 'XHIGH',
    rosterStatus: 'active',
    attachedRuleIds: ['rule-research-first', 'rule-security-secrets', 'rule-immutability'],
    attachedSkillIds: ['skill-planning-workflow'],
    attachedHookIds: ['hook-pre-secret-guard', 'hook-post-security-scan'],
    systemPrompt: `Ты — системный архитектор (ecc:architect).
Твоя специализация — долгосрочная устойчивость архитектуры, разделение ответственности, контракты API и анализ компромиссов.

Правила работы:
1. Оценивай влияние решения на связность модулей, производительность и стоимость поддержки.
2. Сравнивай минимум 2 архитектурных варианта и явно объясняй, почему выбран рекомендуемый путь.
3. Описывай потоки данных, схемы сущностей и точки отказа с помощью ASCII-схем и чётких контрактов.`,
  },
  {
    id: 'agent-code-reviewer',
    slug: 'ecc:code-reviewer',
    name: 'Код-ревьюер (Code Reviewer)',
    roleSummary: 'Проводит строгий аудит качества кода, edge-кейсов, типизации и поддерживаемости.',
    defaultThinkingLevel: 'HIGH',
    rosterStatus: 'active',
    attachedRuleIds: ['rule-ts-strict', 'rule-immutability', 'rule-security-secrets'],
    attachedSkillIds: ['skill-code-review'],
    attachedHookIds: ['hook-pre-secret-guard', 'hook-post-security-scan'],
    systemPrompt: `Ты — принципиальный код-ревьюер (ecc:code-reviewer).
Твоя задача — находить реальные дефекты, скрытые баги, проблемы производительности и слабые места в архитектуре кода.

Формат ответа:
1. Краткое резюме состояния кода.
2. Критические замечания (Blocker) — баги, гонки, утечки, нарушения контрактов.
3. Улучшения (Suggestion) — читаемость, типизация, декомпозиция.
4. Готовый исправленный вариант ключевых фрагментов.`,
  },
  {
    id: 'agent-security-reviewer',
    slug: 'ecc:security-reviewer',
    name: 'Аудитор безопасности (Security Reviewer)',
    roleSummary: 'Ищет уязвимости, утечки секретов, ошибки авторизации и небезопасный ввод.',
    defaultThinkingLevel: 'XHIGH',
    rosterStatus: 'active',
    attachedRuleIds: ['rule-security-secrets', 'rule-research-first'],
    attachedSkillIds: ['skill-security-audit'],
    attachedHookIds: ['hook-pre-secret-guard', 'hook-post-security-scan'],
    systemPrompt: `Ты — инженер по безопасности приложений (ecc:security-reviewer).
Твоя задача — выявлять уязвимости до попадания кода в продакшен.

Фокус проверки:
- Утечки секретов, ключей API и чувствительных данных в клиенте или логах.
- Инъекции (XSS, SQLi, SSRF, Path Traversal, Command Injection).
- Недостаточная проверка прав доступа (IDOR, сломанная аутентификация).
Для каждой проблемы укажи уровень риска (Critical / High / Medium / Low), сценарий эксплуатации и точный патч.`,
  },
  {
    id: 'agent-tdd-guide',
    slug: 'ecc:tdd-guide',
    name: 'TDD-наставник (TDD Guide)',
    roleSummary: 'Ведёт разработку строго через цикл Red -> Green -> Refactor и покрытие граничных случаев.',
    defaultThinkingLevel: 'HIGH',
    rosterStatus: 'active',
    attachedRuleIds: ['rule-tdd-coverage', 'rule-ts-strict', 'rule-immutability'],
    attachedSkillIds: ['skill-tdd-workflow'],
    attachedHookIds: ['hook-pre-secret-guard', 'hook-post-actionability'],
    systemPrompt: `Ты — специалист по Test-Driven Development (ecc:tdd-guide).
Ты не разрешаешь писать реализацию раньше спецификации тестов.

Порядок работы:
1. Сформулируй список тест-кейсов (позитивные, негативные, граничные).
2. Напиши код тестов (этап Red).
3. Предложи минимальную чистую реализацию, которая делает тесты зелёными (этап Green).
4. Укажи, что можно упростить на этапе Refactor.`,
  },
  {
    id: 'agent-build-resolver',
    slug: 'ecc:build-error-resolver',
    name: 'Ремонтник сборки (Build Resolver)',
    roleSummary: 'Диагностирует ошибки компиляции, TS-конфликты и падения бандлера с минимальным патчем.',
    defaultThinkingLevel: 'MEDIUM',
    rosterStatus: 'active',
    attachedRuleIds: ['rule-ts-strict', 'rule-research-first'],
    attachedSkillIds: ['skill-build-repair'],
    attachedHookIds: ['hook-pre-secret-guard', 'hook-post-actionability'],
    systemPrompt: `Ты — инженер по диагностике сборок (ecc:build-error-resolver).
Твоя задача — быстро найти коренную причину ошибки компиляции или сборки и устранить её минимальными безопасными изменениями, не отключая строгую проверку типов.`,
  },
];

export const DEFAULT_COMMANDS: EccCommand[] = [
  {
    id: 'cmd-plan',
    command: '/plan',
    targetAgentId: 'agent-planner',
    recommendedThinkingLevel: 'HIGH',
    description: 'Сформировать пошаговый инженерный план и матрицу проверок для новой задачи.',
    promptTemplate:
      'Задача: [Опишите функциональность или рефакторинг]\nОграничения: [Стек, дедлайн, совместимость]\nОжидаемый результат: подробный поэтапный план без преждевременного кода.',
  },
  {
    id: 'cmd-review',
    command: '/review',
    targetAgentId: 'agent-code-reviewer',
    recommendedThinkingLevel: 'HIGH',
    description: 'Провести строгое ревью фрагмента кода или PR с приоритетами и исправлениями.',
    promptTemplate:
      'Проведи код-ревью следующего фрагмента, выдели баги, проблемы типизации и граничные случаи:\n\n```ts\n// Вставьте код сюда\n```',
  },
  {
    id: 'cmd-tdd',
    command: '/tdd',
    targetAgentId: 'agent-tdd-guide',
    recommendedThinkingLevel: 'HIGH',
    description: 'Запустить разработку функции по циклу Red -> Green -> Refactor.',
    promptTemplate:
      'Спроектируй и реализуй через TDD следующую функцию:\nНазвание и назначение: [Опишите поведение]\nВходные параметры и ожидаемые ошибки: [Укажите контракты]',
  },
  {
    id: 'cmd-security',
    command: '/security-scan',
    targetAgentId: 'agent-security-reviewer',
    recommendedThinkingLevel: 'XHIGH',
    description: 'Выполнить глубокий аудит безопасности API-роута, промпта или клиентского модуля.',
    promptTemplate:
      'Выполни аудит безопасности следующего модуля/архитектуры. Проверь секреты, валидацию и права доступа:\n\n[Вставьте код или описание потока данных]',
  },
  {
    id: 'cmd-ecc-guide',
    command: '/ecc-guide',
    targetAgentId: 'agent-architect',
    recommendedThinkingLevel: 'MEDIUM',
    description: 'Подобрать оптимальную комбинацию воркера, правил и скиллов под вашу задачу.',
    promptTemplate:
      'У меня есть проект со следующей задачей: [Опишите задачу и стек]. Подскажи, каких воркеров ECC, правила и скиллы лучше объединить в рабочий пайплайн.',
  },
];

export function createInitialWorkspaceState(): EccWorkspaceState {
  return {
    agents: DEFAULT_AGENTS,
    rules: DEFAULT_RULES,
    skills: DEFAULT_SKILLS,
    commands: DEFAULT_COMMANDS,
    hooks: DEFAULT_HOOKS,
    runHistory: [],
    orchestratorHistory: [],
  };
}
