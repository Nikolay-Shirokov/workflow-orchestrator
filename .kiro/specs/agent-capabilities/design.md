# Документ дизайна: Система capabilities для CLI-адаптеров

## Обзор

Данный дизайн описывает расширение системы разрешений для поддержки дополнительных возможностей (capabilities) CLI-адаптеров: веб-поиск, MCP-инструменты, интеграция с браузером.

### Текущее состояние

1. **StepPermissions** контролирует только `read`, `write`, `execute`, `fullAccess`
2. **MCPManager** - заглушка, которая:
   - Проверяет наличие CLI через `which`
   - Добавляет текст о "доступных инструментах" в промпт
   - НЕ интегрируется с реальными MCP-серверами
3. **Capabilities** не поддерживаются на уровне конфигурации

### Целевое состояние

1. **StepPermissions** расширен полем `capabilities`
2. **MCPManager** удалён или переработан в `CapabilityChecker`
3. **Capabilities** маппятся на флаги CLI для каждого адаптера
4. MCP-серверы настраиваются вне workflow, workflow даёт разрешение на использование

## Архитектура

### Компоненты системы

```
┌─────────────────────────────────────────────────────────────┐
│                    WorkflowEngine                            │
│  - Загрузка конфигурации с capabilities                     │
│  - Передача permissions + capabilities в StepExecutor       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    StepExecutor                              │
│  - Merge capabilities: step > role > defaults               │
│  - Создание AdapterRequest с полными permissions            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  BaseCLIAdapter                              │
│  + getSupportedCapabilities(): string[]                     │
│  + mapCapabilitiesToArgs(caps): string[]                    │
│  # prepareArguments(request): string[]                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────┬───────────────┐
          ▼                       ▼               ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  ClaudeAdapter   │    │  CodexAdapter    │    │  GeminiAdapter   │
│                  │    │                  │    │                  │
│  capabilities:   │    │  capabilities:   │    │  capabilities:   │
│  - mcp_tools ✓   │    │  - web_search ✓  │    │  - web_search ✓  │
│  - browser ✓     │    │  - mcp_tools ✗   │    │  - mcp_tools ✗   │
│  - web_search ✗  │    │  - browser ✗     │    │  - browser ✗     │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

### Поток данных

1. **Конфигурация workflow** → загрузка роли с `default_capabilities`
2. **Конфигурация шага** → merge capabilities шага с default_capabilities роли
3. **StepExecutor** → создаёт `AdapterRequest` с полями `permissions` и `capabilities`
4. **Adapter** → маппит capabilities на флаги CLI + логирует использование
5. **CLI** → выполняет с включёнными возможностями
6. **Response** → содержит информацию о использованных capabilities

## Интерфейсы и типы

### StepCapabilities

```typescript
/**
 * Дополнительные возможности модели на шаге
 */
export interface StepCapabilities {
  /**
   * Разрешить веб-поиск
   * - Codex: --search
   * - Gemini: --allowed-tools google_web_search
   * - Claude: не поддерживается
   */
  web_search?: boolean;

  /**
   * Разрешить MCP-инструменты
   * - true: все настроенные MCP-инструменты
   * - string[]: только указанные инструменты
   * - Claude: влияет на --tools и --allowedTools
   * - Codex/Gemini: игнорируется (MCP настраивается отдельно)
   */
  mcp_tools?: boolean | string[];

  /**
   * Разрешить интеграцию с браузером
   * - Claude: --chrome
   * - Codex/Gemini: не поддерживается
   */
  browser?: boolean;
}
```

### Расширенный StepPermissions

```typescript
/**
 * Разрешения для шага workflow
 */
export interface StepPermissions {
  /** Паттерны файлов разрешенных для чтения (glob) */
  read?: string[];

  /** Паттерны файлов разрешенных для записи (glob) */
  write?: string[];

  /** Разрешено ли выполнять shell-команды */
  execute?: boolean;

  /** Режим полного доступа без ограничений (ОПАСНО!) */
  fullAccess?: boolean;

  /** Дополнительные возможности модели */
  capabilities?: StepCapabilities;
}
```

### Расширенный RoleConfig

```typescript
/**
 * Конфигурация роли
 */
export interface RoleConfig {
  adapter: string;
  model?: string;
  role_definition?: string;
  custom_instructions?: string;
  temperature?: number;
  max_tokens?: number;

  /** Разрешения по умолчанию для роли */
  default_permissions?: StepPermissions;

  /** Capabilities по умолчанию для роли */
  default_capabilities?: StepCapabilities;
}
```

### CapabilitySupport в адаптере

```typescript
/**
 * Информация о поддержке capability адаптером
 */
export interface CapabilitySupport {
  /** Capability поддерживается */
  supported: boolean;

  /** Флаги CLI для включения capability */
  flags?: string[];

  /** Примечание о поддержке */
  note?: string;
}

/**
 * Интерфейс для адаптеров с поддержкой capabilities
 */
export interface CapabilityAwareAdapter {
  /**
   * Получить информацию о поддержке capabilities
   */
  getCapabilitySupport(): Record<keyof StepCapabilities, CapabilitySupport>;

  /**
   * Маппинг capabilities на флаги CLI
   */
  mapCapabilitiesToArgs(capabilities: StepCapabilities): string[];
}
```

## Специфика адаптеров

### Claude CLI

**Поддерживаемые capabilities:**
- `mcp_tools` ✓
- `browser` ✓
- `web_search` ✗

```typescript
class ClaudeCLIAdapter {
  getCapabilitySupport(): Record<keyof StepCapabilities, CapabilitySupport> {
    return {
      web_search: {
        supported: false,
        note: 'Claude CLI не поддерживает встроенный веб-поиск'
      },
      mcp_tools: {
        supported: true,
        note: 'MCP-серверы настраиваются через --mcp-config или CLAUDE.json'
      },
      browser: {
        supported: true,
        flags: ['--chrome']
      }
    };
  }

  mapCapabilitiesToArgs(capabilities: StepCapabilities): string[] {
    const args: string[] = [];

    if (capabilities.browser) {
      args.push('--chrome');
    }

    if (capabilities.mcp_tools) {
      if (Array.isArray(capabilities.mcp_tools)) {
        // Конкретные инструменты добавляем в allowedTools
        // (они автоматически разрешаются без подтверждения)
        args.push('--allowedTools', capabilities.mcp_tools.join(','));
      }
      // true = не ограничиваем MCP-инструменты через --tools
    }

    return args;
  }
}
```

**Флаги CLI:**
- `--chrome` - включить браузер
- `--mcp-config <path>` - загрузить MCP-серверы из файла
- `--tools <list>` - ограничить доступные инструменты
- `--allowedTools <list>` - инструменты без подтверждения

### Codex CLI

**Поддерживаемые capabilities:**
- `web_search` ✓
- `mcp_tools` ✗ (настраивается через `codex mcp`)
- `browser` ✗

```typescript
class CodexCLIAdapter {
  getCapabilitySupport(): Record<keyof StepCapabilities, CapabilitySupport> {
    return {
      web_search: {
        supported: true,
        flags: ['--search']
      },
      mcp_tools: {
        supported: false,
        note: 'MCP-серверы настраиваются через "codex mcp add/remove"'
      },
      browser: {
        supported: false,
        note: 'Codex CLI не поддерживает интеграцию с браузером'
      }
    };
  }

  mapCapabilitiesToArgs(capabilities: StepCapabilities): string[] {
    const args: string[] = [];

    if (capabilities.web_search) {
      args.push('--search');
    }

    if (capabilities.mcp_tools) {
      console.warn('[CodexAdapter] mcp_tools capability игнорируется. ' +
        'Настройте MCP через "codex mcp add <server>"');
    }

    if (capabilities.browser) {
      console.warn('[CodexAdapter] browser capability не поддерживается');
    }

    return args;
  }
}
```

**Флаги CLI:**
- `--search` - включить веб-поиск
- `codex mcp list/add/remove` - управление MCP-серверами (отдельно от exec)

### Gemini CLI

**Поддерживаемые capabilities:**
- `web_search` ✓
- `mcp_tools` ✗
- `browser` ✗

```typescript
class GeminiCLIAdapter {
  getCapabilitySupport(): Record<keyof StepCapabilities, CapabilitySupport> {
    return {
      web_search: {
        supported: true,
        flags: ['--allowed-tools', 'google_web_search'],
        note: 'Требует --yolo для автоподтверждения'
      },
      mcp_tools: {
        supported: false,
        note: 'Gemini CLI не поддерживает MCP'
      },
      browser: {
        supported: false,
        note: 'Gemini CLI не поддерживает интеграцию с браузером'
      }
    };
  }

  mapCapabilitiesToArgs(capabilities: StepCapabilities): string[] {
    const args: string[] = [];

    if (capabilities.web_search) {
      // Добавляем google_web_search к списку разрешенных инструментов
      // Интеграция с существующим mapPermissionsToArgs
      args.push('--allowed-tools', 'google_web_search');
      // Примечание: --yolo добавляется в mapPermissionsToArgs если есть write/execute
    }

    return args;
  }
}
```

**Инструменты Gemini CLI:**
- `google_web_search` - веб-поиск
- `write_file` - запись файлов
- `shell` - выполнение команд

## Интеграция с mapPermissionsToArgs

Capabilities должны интегрироваться с существующим методом:

```typescript
protected prepareArguments(request: AdapterRequest): string[] {
  const args: string[] = [];

  // Базовые аргументы (модель и т.д.)
  if (request.model) {
    args.push('--model', request.model);
  }

  // Флаги permissions (read/write/execute)
  const permissionArgs = this.mapPermissionsToArgs(request.permissions);
  args.push(...permissionArgs);

  // Флаги capabilities
  if (request.permissions?.capabilities) {
    const capabilityArgs = this.mapCapabilitiesToArgs(request.permissions.capabilities);
    args.push(...capabilityArgs);
  }

  return args;
}
```

### Специальные случаи для Gemini

Gemini требует `--yolo` когда используются инструменты. Нужно объединять:

```typescript
// GeminiCLIAdapter
protected prepareArguments(request: AdapterRequest): string[] {
  const args: string[] = [];

  // ... базовые аргументы ...

  // Собираем все --allowed-tools
  const allowedTools: string[] = [];

  // Из permissions
  if (request.permissions?.write?.length) {
    allowedTools.push('write_file');
  }
  if (request.permissions?.execute) {
    allowedTools.push('shell');
  }

  // Из capabilities
  if (request.permissions?.capabilities?.web_search) {
    allowedTools.push('google_web_search');
  }

  // Добавляем флаги
  if (allowedTools.length > 0) {
    args.push('--allowed-tools', allowedTools.join(','));
    args.push('--yolo'); // Только если есть инструменты
  }

  return args;
}
```

## Merge capabilities

### Приоритет

1. Capabilities шага (наивысший приоритет)
2. default_capabilities роли
3. Адаптер по умолчанию (все выключено)

### Алгоритм merge

```typescript
function mergeCapabilities(
  stepCapabilities?: StepCapabilities,
  roleCapabilities?: StepCapabilities
): StepCapabilities {
  // Если шаг не указывает capabilities, используем роль
  if (!stepCapabilities) {
    return roleCapabilities || {};
  }

  // Если роль не указывает, используем шаг
  if (!roleCapabilities) {
    return stepCapabilities;
  }

  // Merge: шаг переопределяет роль
  return {
    web_search: stepCapabilities.web_search ?? roleCapabilities.web_search,
    browser: stepCapabilities.browser ?? roleCapabilities.browser,
    mcp_tools: stepCapabilities.mcp_tools ?? roleCapabilities.mcp_tools
  };
}
```

## Удаление MCPManager

Текущий `MCPManager` — заглушка, которая только проверяет наличие CLI через `which` и добавляет текст в промпт. Его нужно удалить.

### CapabilityChecker (опционально)

```typescript
// src/core/capability-checker.ts
export class CapabilityChecker {
  /**
   * Проверить доступность capability для адаптера
   */
  async checkCapability(
    adapter: CLIAdapter,
    capability: keyof StepCapabilities
  ): Promise<CapabilitySupport> {
    if ('getCapabilitySupport' in adapter) {
      const support = (adapter as CapabilityAwareAdapter).getCapabilitySupport();
      return support[capability];
    }
    return { supported: false, note: 'Adapter does not implement CapabilityAwareAdapter' };
  }

  /**
   * Проверить все capabilities для шага
   */
  async validateStepCapabilities(
    adapter: CLIAdapter,
    capabilities: StepCapabilities
  ): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    if (capabilities.web_search) {
      const support = await this.checkCapability(adapter, 'web_search');
      if (!support.supported) {
        warnings.push(`web_search: ${support.note || 'не поддерживается'}`);
      }
    }

    // ... аналогично для других capabilities ...

    return { valid: true, warnings };
  }
}
```

## Примеры конфигурации

### Пример 1: Роль с веб-поиском

```yaml
roles:
  researcher:
    adapter: "codex-cli"
    model: "gpt-4"
    role_definition: "Вы - исследователь"
    default_permissions:
      read: ["**/*"]
    default_capabilities:
      web_search: true
```

### Пример 2: Шаг с MCP-инструментами

```yaml
steps:
  - id: "analyze_with_tools"
    name: "Анализ с MCP"
    type: model
    role: architect
    permissions:
      read: ["src/**/*.ts"]
      capabilities:
        mcp_tools: ["database-query", "api-client"]
```

### Пример 3: Шаг с браузером

```yaml
steps:
  - id: "web_automation"
    name: "Автоматизация браузера"
    type: model
    role: automation
    permissions:
      read: ["**/*"]
      write: ["screenshots/*.png"]
      capabilities:
        browser: true
```

### Пример 4: Полный пример workflow

```yaml
workflow:
  name: "research-workflow"
  version: "1.0"

  settings:
    artifacts_dir: "artifacts"

  roles:
    researcher:
      adapter: "codex-cli"
      model: "gpt-4"
      default_permissions:
        read: ["**/*"]
      default_capabilities:
        web_search: true

    analyst:
      adapter: "claude-cli"
      model: "claude-sonnet-3.5"
      default_permissions:
        read: ["**/*"]
        write: ["artifacts/**/*.md"]
      default_capabilities:
        mcp_tools: true  # Использовать все настроенные MCP

  steps:
    - id: "research"
      name: "Исследование темы"
      type: model
      role: researcher
      prompt_template: |
        Исследуй тему: ${topic}
        Используй веб-поиск для актуальной информации.
      outputs:
        research: "artifacts/research.md"

    - id: "analysis"
      name: "Анализ с MCP-инструментами"
      type: model
      role: analyst
      depends_on: ["research"]
      permissions:
        capabilities:
          mcp_tools: ["database-query"]  # Переопределяем - только database-query
      prompt_template: |
        Проанализируй исследование:
        ${artifact:${research}}
      outputs:
        analysis: "artifacts/analysis.md"
```

## План реализации

### Фаза 1: Типы и интерфейсы
- Добавить `StepCapabilities` в types.ts
- Расширить `StepPermissions` полем `capabilities`
- Расширить `RoleConfig` полем `default_capabilities`

### Фаза 2: Базовый адаптер
- Добавить интерфейс `CapabilityAwareAdapter`
- Добавить метод `mapCapabilitiesToArgs` в BaseCLIAdapter
- Интегрировать с `prepareArguments`

### Фаза 3: Claude CLI адаптер
- Реализовать `getCapabilitySupport()`
- Реализовать `mapCapabilitiesToArgs()` для browser и mcp_tools

### Фаза 4: Codex CLI адаптер
- Реализовать `getCapabilitySupport()`
- Реализовать `mapCapabilitiesToArgs()` для web_search

### Фаза 5: Gemini CLI адаптер
- Реализовать `getCapabilitySupport()`
- Объединение allowed-tools из permissions и capabilities

### Фаза 6: StepExecutor
- Добавить merge capabilities (step + role)
- Добавить validation/warnings для неподдерживаемых capabilities

### Фаза 7: Удаление MCPManager
- Удалить src/core/mcp-manager.ts
- Удалить mcp_tools из WorkflowSettings
- Обновить тесты

### Фаза 8: Документация и тесты
- Property-based тесты для маппинга capabilities
- Обновить README адаптеров, FAQ, SECURITY docs
- Обновить примеры workflow

## Свойства корректности (Properties)

### Property 1: Безопасность по умолчанию
*Для любого* запроса без явных capabilities, адаптер НЕ должен включать дополнительные возможности.

### Property 2: Неподдерживаемые capabilities не вызывают ошибок
*Для любого* запроса с неподдерживаемой capability, адаптер должен логировать предупреждение и продолжить работу.

### Property 3: Маппинг capabilities корректен
*Для любой* поддерживаемой capability, адаптер должен генерировать корректные флаги CLI.

### Property 4: Merge capabilities предсказуем
*Для любой* комбинации step + role capabilities, результат merge должен быть детерминированным.
