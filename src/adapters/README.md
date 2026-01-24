# CLI-адаптеры для Workflow Orchestrator

Этот модуль содержит реализации CLI-адаптеров для различных AI-моделей.

## Обзор

CLI-адаптеры предоставляют унифицированный интерфейс для взаимодействия с различными консольными утилитами AI-моделей. Все адаптеры наследуются от базового класса `BaseCLIAdapter` и реализуют интерфейс `CLIAdapter`.

## Доступные адаптеры

| Адаптер | CLI-утилита | Модели | Permissions | Capabilities |
|---------|-------------|--------|-------------|--------------|
| `ClaudeCLIAdapter` | `claude` | Claude Sonnet, Opus, Haiku | ✅ Полная поддержка | ✅ Полная |
| `CodexCLIAdapter` | `codex` | GPT-4, Codex | ✅ Полная поддержка | ⚡ Частичная |
| `GeminiCLIAdapter` | `gemini` | Gemini Pro, Ultra | ✅ Полная поддержка | ⚡ Частичная |
| `OpenAICLIAdapter` | `openai` | GPT-4, GPT-3.5 | Базовая | ❌ Нет |

### ClaudeCLIAdapter

Адаптер для взаимодействия с Anthropic Claude через `claude-cli`.

**Требования:**
- Установленная утилита `claude-cli`
- Авторизация через `claude-cli` (на уровне системы) ИЛИ переменная окружения `ANTHROPIC_API_KEY`

**Пример использования:**
```typescript
import { ClaudeCLIAdapter } from './adapters/claude-cli-adapter.js';

const adapter = new ClaudeCLIAdapter();

// Базовый запрос
const response = await adapter.execute({
  prompt: 'Привет, как дела?',
  model: 'claude-sonnet-3.5'
});

// Запрос с permissions и outputFile
const response = await adapter.execute({
  prompt: 'Проанализируй код в src/',
  permissions: {
    read: ['src/**/*.ts'],
    write: ['docs/*.md']
  },
  outputFile: 'artifacts/analysis.md'
});
```

**Маппинг permissions на флаги CLI:**

| Permissions | Флаги Claude CLI |
|-------------|------------------|
| Без permissions | `--tools "Read,Grep,Glob"` (только чтение) |
| `write: [...]` | Добавляет `Write` в `--tools` и `--allowedTools` |
| `execute: true` | Добавляет `Bash` в `--tools` и `--allowedTools` |
| `fullAccess: true` | `--dangerously-skip-permissions` ⚠️ |

### CodexCLIAdapter

Адаптер для взаимодействия с OpenAI Codex через `codex-cli`.

**Требования:**
- Установленная утилита `codex-cli`
- Авторизация через `codex-cli` ИЛИ переменная окружения `OPENAI_API_KEY`

**Пример использования:**
```typescript
import { CodexCLIAdapter } from './adapters/codex-cli-adapter.js';

const adapter = new CodexCLIAdapter();

// Запрос с permissions
const response = await adapter.execute({
  prompt: 'Напиши функцию сортировки',
  permissions: {
    read: ['src/**/*'],
    write: ['src/utils/*.ts']
  },
  outputFile: 'artifacts/result.md'
});
```

**Маппинг permissions на флаги CLI:**

| Permissions | Флаги Codex CLI |
|-------------|-----------------|
| Без permissions | `--sandbox read-only` |
| `write: [...]` | `--sandbox workspace-write` |
| `execute: true` | Добавляет `--full-auto` |
| `fullAccess: true` | `--yolo` ⚠️ |

**Поддержка outputFile:**
- Флаг `--output-last-message <путь>` для записи результата в файл

### GeminiCLIAdapter

Адаптер для взаимодействия с Google Gemini через `gemini-cli`.

**Требования:**
- Установленная утилита `gemini-cli`
- Авторизация через `gemini-cli` ИЛИ переменная окружения `GOOGLE_API_KEY`

**Пример использования:**
```typescript
import { GeminiCLIAdapter } from './adapters/gemini-cli-adapter.js';

const adapter = new GeminiCLIAdapter();

const response = await adapter.execute({
  prompt: 'Объясни квантовую физику',
  permissions: {
    read: ['docs/**/*'],
    write: ['output/*.md']
  }
});
```

**Маппинг permissions на флаги CLI:**

| Permissions | Флаги Gemini CLI |
|-------------|------------------|
| Без permissions | Безопасный режим (без `--yolo`) |
| `write: [...]` | `--allowed-tools write_file --yolo` |
| `execute: true` | `--allowed-tools shell --yolo` |
| `fullAccess: true` | `--yolo` ⚠️ |

### OpenAICLIAdapter

Адаптер для взаимодействия с OpenAI GPT через `openai-cli`.

**Требования:**
- Установленная утилита `openai-cli`
- Авторизация через `openai-cli` ИЛИ переменная окружения `OPENAI_API_KEY`

**Пример использования:**
```typescript
import { OpenAICLIAdapter } from './adapters/openai-cli-adapter.js';

const adapter = new OpenAICLIAdapter();

const response = await adapter.execute({
  prompt: 'Напиши короткое стихотворение',
  model: 'gpt-4'
});
```

## Система разрешений (Permissions)

Все адаптеры поддерживают систему разрешений `StepPermissions` для контроля действий AI-моделей.

### Структура StepPermissions

```typescript
interface StepPermissions {
  read?: string[];      // Паттерны файлов для чтения (glob)
  write?: string[];     // Паттерны файлов для записи (glob)
  execute?: boolean;    // Разрешены ли shell-команды
  fullAccess?: boolean; // Полный доступ (ОПАСНО!)
}
```

### Принципы безопасности

1. **Безопасность по умолчанию**: Без permissions используется режим только чтения
2. **Минимальные привилегии**: Запрашивайте только необходимые разрешения
3. **Явное указание опасных режимов**: `fullAccess` требует явного указания
4. **Валидация паттернов**: Path traversal (`..`) запрещён в паттернах

### Пример использования

```typescript
// Только чтение (безопасно)
const response1 = await adapter.execute({
  prompt: 'Проанализируй код',
  permissions: {
    read: ['src/**/*.ts', '*.md']
  }
});

// Чтение и запись
const response2 = await adapter.execute({
  prompt: 'Создай документацию',
  permissions: {
    read: ['src/**/*.ts'],
    write: ['docs/**/*.md']
  }
});

// С выполнением команд
const response3 = await adapter.execute({
  prompt: 'Запусти тесты и исправь ошибки',
  permissions: {
    read: ['src/**/*', 'tests/**/*'],
    write: ['src/**/*.ts'],
    execute: true
  }
});
```

### ⚠️ Важные гарантии безопасности

- `--yolo` (Codex) и `--dangerously-skip-permissions` (Claude) **НИКОГДА** не используются без явного `fullAccess: true`
- `Bash` инструмент (Claude) **НЕДОСТУПЕН** без `execute: true`
- `shell` инструмент (Gemini) **НЕДОСТУПЕН** без `execute: true`

## Capabilities (Дополнительные возможности)

Capabilities расширяют базовые разрешения файловой системы дополнительными возможностями: веб-поиск, MCP-инструменты, интеграция с браузером.

### Поддержка capabilities по адаптерам

| Capability | Claude CLI | Codex CLI | Gemini CLI |
|------------|------------|-----------|------------|
| `web_search` | ✅ WebSearch | ✅ `--search` | ✅ google_web_search |
| `web_fetch` | ✅ WebFetch | ❌ | ✅ web_fetch |
| `mcp_tools` | ✅ `--tools`, `--allowedTools` | ⚡ авто через `codex mcp` | ✅ settings.json |
| `browser` | ✅ `--chrome` | ❌ | ❌ |

### Структура StepCapabilities

```typescript
interface StepCapabilities {
  web_search?: boolean;           // Поиск в интернете
  web_fetch?: boolean;            // Загрузка веб-страниц по URL
  mcp_tools?: boolean | string[]; // MCP-инструменты
  browser?: boolean;              // Интеграция с браузером
}
```

### Пример использования

```typescript
// Запрос с веб-поиском
const response = await adapter.execute({
  prompt: 'Найди последние новости о TypeScript 5.0',
  permissions: {
    capabilities: {
      web_search: true
    }
  }
});

// Запрос с веб-поиском и MCP
const response = await adapter.execute({
  prompt: 'Исследуй API и создай интеграцию',
  permissions: {
    write: ['src/**/*.ts'],
    capabilities: {
      web_search: true,
      web_fetch: true,
      mcp_tools: true  // Все настроенные MCP-инструменты
    }
  }
});

// Запрос с конкретными MCP-инструментами
const response = await adapter.execute({
  prompt: 'Используй базу данных',
  permissions: {
    capabilities: {
      mcp_tools: ['db_query', 'db_insert']  // Только указанные
    }
  }
});
```

### Примечания по MCP

MCP-серверы настраиваются **вне workflow** на уровне CLI-утилиты:

- **Claude**: через `--mcp-config` или глобальную конфигурацию
- **Codex**: через `codex mcp add` (все настроенные серверы доступны автоматически)
- **Gemini**: через `mcpServers` в `settings.json` или `gemini mcp add`

Workflow лишь **даёт разрешение** на использование уже настроенных MCP-инструментов.

## Запись результата в файл (outputFile)

Адаптеры поддерживают запись результата выполнения в файл.

### Использование

```typescript
const response = await adapter.execute({
  prompt: 'Создай отчёт',
  outputFile: 'artifacts/report.md',
  permissions: {
    write: ['artifacts/*.md']
  }
});

// Метаданные ответа
console.log(response.metadata.outputFile);    // 'artifacts/report.md'
console.log(response.metadata.resultSource);  // 'file' или 'stdout'
```

### Механизм работы

1. Адаптер добавляет инструкцию записи в промпт
2. После выполнения использует polling для чтения файла (интервал 200мс, таймаут 5с)
3. Если файл не создан, использует stdout как fallback

## Использование с реестром

```typescript
import { AdapterRegistry } from './adapters/adapter-registry.js';
import { ClaudeCLIAdapter } from './adapters/claude-cli-adapter.js';
import { CodexCLIAdapter } from './adapters/codex-cli-adapter.js';
import { GeminiCLIAdapter } from './adapters/gemini-cli-adapter.js';

const registry = new AdapterRegistry();

// Регистрация адаптеров
registry.register(new ClaudeCLIAdapter());
registry.register(new CodexCLIAdapter());
registry.register(new GeminiCLIAdapter());

// Получение адаптера по имени
const adapter = registry.get('claude-cli');
```

## Создание собственного адаптера

Для создания собственного адаптера наследуйтесь от `BaseCLIAdapter`:

```typescript
import { BaseCLIAdapter } from './base-cli-adapter.js';
import { AdapterConfig, StepPermissions, AdapterRequest } from '../core/types.js';

export class CustomCLIAdapter extends BaseCLIAdapter {
  name: string = 'custom-cli';
  version: string = '1.0.0';

  constructor(config?: Partial<AdapterConfig>) {
    const defaultConfig: AdapterConfig = {
      name: 'custom-cli',
      command: 'custom-command',
      args: ['--prompt', '${prompt}'],
      env: {
        CUSTOM_API_KEY: process.env.CUSTOM_API_KEY || ''
      },
      timeout: 300000
    };

    super({ ...defaultConfig, ...config });
  }

  /**
   * ОБЯЗАТЕЛЬНО: Реализуйте маппинг permissions на флаги вашего CLI
   */
  protected mapPermissionsToArgs(permissions?: StepPermissions): string[] {
    const args: string[] = [];

    // Валидация permissions (проверка path traversal и т.д.)
    this.validatePermissions(permissions);

    if (!permissions) {
      // Безопасный режим по умолчанию
      args.push('--safe-mode');
      return args;
    }

    if (permissions.fullAccess) {
      args.push('--full-access');
      return args;
    }

    if (permissions.write && permissions.write.length > 0) {
      args.push('--allow-write');
    }

    if (permissions.execute) {
      args.push('--allow-execute');
    }

    return args;
  }

  /**
   * Опционально: Переопределите parseResponse для специфичного парсинга
   */
  parseResponse(rawOutput: string): string {
    return rawOutput.trim();
  }

  /**
   * Опционально: Переопределите prepareArguments для добавления специфичных флагов
   */
  protected prepareArguments(request: AdapterRequest): string[] {
    const args = super.prepareArguments(request);

    // Добавить флаги permissions
    const permArgs = this.mapPermissionsToArgs(request.permissions);
    args.push(...permArgs);

    // Добавить outputFile если указан
    if (request.outputFile) {
      args.push('--output', request.outputFile);
    }

    return args;
  }
}
```

### Вспомогательные методы BaseCLIAdapter

| Метод | Описание |
|-------|----------|
| `validatePermissions(permissions)` | Проверяет permissions на path traversal и конфликты |
| `appendFileWriteInstruction(prompt, outputPath, toolName?)` | Добавляет инструкцию записи в файл к промпту |
| `readResultFromFile(outputPath, stdout, options?)` | Читает результат из файла с polling |

## Обработка ошибок

```typescript
try {
  const response = await adapter.execute({ prompt: 'test' });
} catch (error) {
  const adapterError = error as AdapterError;

  console.error(`Код ошибки: ${adapterError.code}`);
  console.error(`Сообщение: ${adapterError.message}`);
  console.error(`Можно повторить: ${adapterError.retryable}`);
}
```

**Коды ошибок:**
- `ADAPTER_TIMEOUT` - Превышен таймаут выполнения
- `ADAPTER_NOT_FOUND` - Команда не найдена
- `ADAPTER_AUTH_ERROR` - Ошибка аутентификации
- `ADAPTER_INVALID_REQUEST` - Невалидный запрос
- `ADAPTER_UNKNOWN_ERROR` - Неизвестная ошибка

## Тестирование

Для тестирования используйте `MockCLIAdapter`:

```typescript
import { MockCLIAdapter } from './adapters/mock-cli-adapter.js';

const mockAdapter = new MockCLIAdapter();

// Настройка ответа
mockAdapter.setResponse(/привет/i, 'Привет! Как я могу помочь?');

// Использование
const response = await mockAdapter.execute({ prompt: 'привет' });

// Проверка истории
const history = mockAdapter.getRequestHistory();
```

## Переменные окружения

API ключи опциональны, если CLI-утилиты уже авторизованы на уровне системы:

```bash
# Claude
export ANTHROPIC_API_KEY="your-key-here"

# OpenAI / Codex
export OPENAI_API_KEY="your-key-here"

# Gemini
export GOOGLE_API_KEY="your-key-here"
```

## Ссылки

- [SECURITY.md](../../docs/SECURITY.md) - Подробная документация по безопасности
- [CUSTOM_ADAPTERS.md](../../docs/CUSTOM_ADAPTERS.md) - Создание пользовательских адаптеров
- [DSL_SYNTAX.md](../../docs/DSL_SYNTAX.md) - Использование permissions в workflow

## Лицензия

MIT
