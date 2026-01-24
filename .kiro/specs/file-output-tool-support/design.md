# Документ дизайна: Поддержка инструмента записи файлов для адаптеров

## Обзор

Данный дизайн описывает реализацию универсального механизма поддержки записи результатов в файлы для CLI-адаптеров в системе workflow-оркестратора. Механизм позволяет моделям записывать большие тексты напрямую в файлы, избегая проблем с обрезанием вывода при чтении из stdout, а также обеспечивает безопасность через систему разрешений.

### Текущее состояние

В настоящее время:
- Gemini адаптер уже поддерживает инструмент `write_file` через флаги `--allowed-tools write_file` и `--yolo`
- Gemini адаптер извлекает путь к выходному файлу из промпта и читает результат из файла
- Codex адаптер поддерживает `--output-last-message` но не читает результат из файла
- Claude адаптер не поддерживает файловый вывод
- Отсутствует система разрешений для ограничения действий модели
- Используется небезопасный режим `--yolo` по умолчанию

### Целевое состояние

После реализации:
- Codex адаптер будет использовать `--output-last-message` для сохранения результата с безопасным sandbox режимом
- Claude адаптер будет поддерживать инструмент `Write` с ограничением набора инструментов
- Базовый адаптер будет предоставлять общую логику для работы с файловым выводом
- Система разрешений будет контролировать что модель может делать на каждом шаге
- Все адаптеры будут использовать безопасные режимы по умолчанию (read-only)
- Система будет поддерживать graceful degradation при отсутствии поддержки

## Архитектура

### Область применения

**Данный дизайн применим только к CLI-адаптерам**, которые:
- Запускают внешние процессы через `child_process`
- Читают вывод из stdout
- Могут столкнуться с проблемой обрезания больших текстов

**HTTP-адаптеры** (например, `OpenAICompatibleAdapter`) **не требуют** этих изменений.

### Компоненты системы

```
┌─────────────────────────────────────────────────────────────┐
│                    WorkflowEngine                            │
│  - Управление выполнением процесса                          │
│  - Передача конфигурации шагов в StepExecutor               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    StepExecutor                              │
│  - Выполнение шагов типа 'model'                            │
│  - Подготовка AdapterRequest с outputs и permissions        │
│  - Сохранение результата в артефакты                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  BaseCLIAdapter                              │
│  + appendFileWriteInstruction(prompt, path, toolName)       │
│  + readResultFromFile(path, stdout, options): Promise       │
│  + mapPermissionsToArgs(permissions): string[]              │
│  # prepareArguments(request): string[]                      │
│  # execute(request): Promise<AdapterResponse>               │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────┬───────────────┐
          ▼                       ▼               ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  GeminiAdapter   │    │  CodexAdapter    │    │  ClaudeAdapter   │
│  --allowed-tools │    │  --sandbox       │    │  --tools         │
│  write_file      │    │  --output-last-  │    │  --allowedTools  │
│  --yolo          │    │  message         │    │  Write           │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

### Поток данных

1. **Конфигурация шага** → WorkflowEngine → StepExecutor
   - Шаг содержит `outputs: { result: "path/to/file.md" }`
   - Шаг содержит `permissions: { read: ["**/*"], write: ["artifacts/*.md"], execute: false }`

2. **StepExecutor** → Адаптер
   - Создает `AdapterRequest` с полями `outputFile` и `permissions`
   - Адаптер автоматически добавляет инструкцию записи в промпт

3. **Адаптер** → CLI-утилита
   - Передает флаги безопасности на основе permissions
   - Передает промпт с инструкцией записи

4. **CLI-утилита** → Модель
   - Модель получает промпт с инструкцией
   - CLI ограничивает действия модели согласно флагам

5. **Модель** → Файл / stdout
   - Если инструмент записи доступен и разрешен: записывает в файл
   - Если недоступен: выводит в stdout

6. **Адаптер** → StepExecutor
   - Читает результат из файла (если файл создан)
   - Fallback на stdout (если файл не создан)
   - Возвращает `AdapterResponse` с контентом

## Интерфейсы и типы

### Расширение AdapterRequest

```typescript
export interface StepPermissions {
  /** Паттерны файлов разрешенных для чтения */
  read?: string[];
  /** Паттерны файлов разрешенных для записи */
  write?: string[];
  /** Разрешено ли выполнять shell-команды */
  execute?: boolean;
  /** Режим полного доступа (ОПАСНО) */
  fullAccess?: boolean;
}

export interface AdapterRequest {
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  env?: Record<string, string>;
  timeout?: number;

  /** Путь к выходному файлу */
  outputFile?: string;

  /** Разрешения для шага */
  permissions?: StepPermissions;
}
```

### Расширение AdapterResponse

```typescript
export interface AdapterResponse {
  content: string;
  model: string;
  tokensUsed?: number;
  executionTime: number;
  metadata?: {
    exitCode?: number;
    stderr?: string;

    /** Путь к файлу, из которого был прочитан результат */
    outputFile?: string;

    /** Источник результата */
    resultSource?: 'file' | 'stdout';

    /** Примененный режим sandbox */
    sandboxMode?: string;
  };
}
```

### Новые методы BaseCLIAdapter

```typescript
abstract class BaseCLIAdapter {
  /**
   * Добавление инструкции записи в файл в конец промпта
   * @param prompt - Исходный промпт
   * @param outputPath - Путь к выходному файлу
   * @param toolName - Имя инструмента записи (write_file, Write)
   * @returns string - Промпт с добавленной инструкцией
   */
  protected appendFileWriteInstruction(
    prompt: string,
    outputPath: string,
    toolName?: string
  ): string;

  /**
   * Чтение результата из файла с fallback на stdout
   * @param outputPath - Путь к выходному файлу
   * @param stdout - Вывод из stdout (fallback)
   * @param options - Опции чтения
   * @returns Promise<{ content: string; source: 'file' | 'stdout' }>
   */
  protected async readResultFromFile(
    outputPath: string,
    stdout: string,
    options?: {
      maxWaitTime?: number;    // Максимальное время ожидания (мс)
      pollInterval?: number;   // Интервал проверки (мс)
    }
  ): Promise<{ content: string; source: 'file' | 'stdout' }>;

  /**
   * Маппинг permissions на флаги CLI (абстрактный)
   * @param permissions - Разрешения шага
   * @returns string[] - Массив флагов для CLI
   */
  protected abstract mapPermissionsToArgs(permissions: StepPermissions): string[];
}
```

## Специфика адаптеров

### Gemini CLI

**Текущая реализация работает**, но требует рефакторинга для использования общих методов.

```bash
# Текущая команда (оставляем как есть)
gemini --allowed-tools write_file --yolo -p "..."
```

**Инструмент записи:** `write_file`

**Особенности:**
- `--allowed-tools write_file` ограничивает только этим инструментом
- `--yolo` автоподтверждает использование инструмента
- Модель создает файл напрямую

### Codex CLI

**Ключевое открытие:** `--output-last-message` работает независимо от sandbox режима! CLI сам сохраняет последнее сообщение в файл после завершения.

```bash
# Безопасный режим: только чтение, CLI сохраняет результат
codex exec --sandbox read-only --output-last-message output.md -

# С правами записи в workspace
codex exec --sandbox workspace-write --output-last-message output.md -
```

**Маппинг permissions на флаги:**

```typescript
protected mapPermissionsToArgs(permissions: StepPermissions): string[] {
  const args: string[] = [];

  if (permissions.fullAccess) {
    // ОПАСНО: Только если явно указано
    args.push('--yolo');
  } else if (permissions.write && permissions.write.length > 0) {
    // Разрешена запись - workspace-write режим
    args.push('--sandbox', 'workspace-write');
    // Добавляем директории если указаны
    for (const pattern of permissions.write) {
      const dir = this.extractDirectory(pattern);
      if (dir && dir !== '.') {
        args.push('--add-dir', dir);
      }
    }
  } else {
    // По умолчанию: только чтение
    args.push('--sandbox', 'read-only');
  }

  if (permissions.execute) {
    // Разрешены shell-команды - нужен минимум full-auto
    args.push('--full-auto');
  }

  return args;
}
```

**Режимы sandbox:**

| Режим | Модель может | Флаги |
|-------|-------------|-------|
| read-only | Только читать | `--sandbox read-only` |
| workspace-write | Читать + писать в workspace | `--sandbox workspace-write` |
| full-auto | + выполнять команды с подтверждением | `--full-auto` |
| yolo | ВСЁ без ограничений | `--yolo` ⚠️ |

### Claude CLI

**Важно:** Claude CLI не имеет `--output-last-message`. Результат получается либо из stdout, либо модель должна создать файл через инструмент `Write`.

```bash
# Только чтение (результат в stdout)
claude -p --tools "Read,Grep,Glob" "..."

# С разрешением записи файла
claude -p --tools "Read,Grep,Glob,Write" --allowedTools "Write" "..."

# С разрешением выполнения команд
claude -p --tools "Read,Grep,Glob,Bash" "..."
```

**Инструмент записи:** `Write` (не `write_file`!)

**Маппинг permissions на флаги:**

```typescript
protected mapPermissionsToArgs(permissions: StepPermissions): string[] {
  // Базовые инструменты чтения
  const tools: string[] = ['Read', 'Grep', 'Glob'];
  const allowedTools: string[] = [];

  if (permissions.write && permissions.write.length > 0) {
    tools.push('Write');
    allowedTools.push('Write'); // Без подтверждения
  }

  if (permissions.execute) {
    tools.push('Bash');
    // Bash НЕ в allowedTools - требует подтверждения
  }

  if (permissions.fullAccess) {
    // ОПАСНО: Только если явно указано
    return ['--dangerously-skip-permissions'];
  }

  const args: string[] = ['--tools', tools.join(',')];

  if (allowedTools.length > 0) {
    args.push('--allowedTools', allowedTools.join(','));
  }

  return args;
}
```

**Доступные инструменты Claude CLI:**

| Инструмент | Назначение |
|-----------|-----------|
| `Read` | Чтение файлов |
| `Grep` | Поиск в файлах |
| `Glob` | Поиск файлов по паттерну |
| `Write` | Создание/перезапись файлов |
| `Edit` | Редактирование существующих файлов |
| `Bash` | Выполнение shell-команд |

## Формат инструкции записи в файл

Инструкция должна быть адаптивной к конкретному CLI:

```typescript
protected appendFileWriteInstruction(
  prompt: string,
  outputPath: string,
  toolName?: string
): string {
  const instruction = toolName
    ? `\n\nCRITICAL: Save your complete response to file: ${outputPath}
Use the ${toolName} tool to write the file.
If the ${toolName} tool is not available, output the full response to console.
Note: The file path is relative to the current working directory.`
    : `\n\nCRITICAL: Save your complete response to file: ${outputPath}
If you cannot write to file, output the full response to console.
Note: The file path is relative to the current working directory.`;

  return prompt + instruction;
}
```

## Чтение результата с polling

Вместо фиксированной задержки используем polling с таймаутом:

```typescript
protected async readResultFromFile(
  outputPath: string,
  stdout: string,
  options: { maxWaitTime?: number; pollInterval?: number } = {}
): Promise<{ content: string; source: 'file' | 'stdout' }> {
  const maxWaitTime = options.maxWaitTime ?? 5000;
  const pollInterval = options.pollInterval ?? 200;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const stat = await fs.stat(outputPath);
      if (stat.size > 0) {
        const content = await fs.readFile(outputPath, 'utf-8');
        if (content.trim().length > 0) {
          this.logger?.debug(`Прочитано ${content.length} байт из ${outputPath}`);
          return { content: content.trim(), source: 'file' };
        }
      }
    } catch (error) {
      // Файл еще не создан, продолжаем polling
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  // Fallback на stdout
  this.logger?.warn(`Файл ${outputPath} не найден или пуст, используем stdout`);
  return { content: stdout.trim(), source: 'stdout' };
}
```

## Свойства корректности (Properties)

### Property 1: Безопасность по умолчанию

*Для любого* запроса к адаптеру без явного `permissions.fullAccess`, адаптер НЕ должен использовать режимы `--yolo` или `--dangerously-skip-permissions`.

**Validates: Requirements 1.6, 2.7, 9.1**

### Property 2: Изоляция записи

*Для любого* запроса к адаптеру с указанным `permissions.write`, модель должна иметь возможность записи ТОЛЬКО в указанные паттерны файлов.

**Validates: Requirements 4.2, 9.3**

### Property 3: Запрет execute по умолчанию

*Для любого* запроса к адаптеру без явного `permissions.execute: true`, модель НЕ должна иметь возможности выполнять shell-команды.

**Validates: Requirements 2.4, 4.3, 9.6**

### Property 4: Graceful degradation

*Для любого* выполнения адаптера, если файл не был создан, результат должен быть прочитан из stdout без ошибок.

**Validates: Requirements 6.1, 8.2**

### Property 5: Адаптивная инструкция

*Для любого* запроса к адаптеру с `outputFile`, инструкция записи должна содержать правильное имя инструмента для данного CLI.

**Validates: Requirement 3.2**

## Примеры конфигурации workflow

### Пример 1: Анализ кода (только чтение)

```yaml
steps:
  - id: analyze
    name: "Анализ архитектуры"
    type: model
    role: architect
    permissions:
      read: ["**/*.ts", "**/*.md"]
      write: []
      execute: false
    prompt_template: |
      Проанализируй архитектуру проекта и опиши её.
    outputs:
      analysis: "artifacts/analysis.md"
```

**Результат:** Codex использует `--sandbox read-only --output-last-message`, модель не может изменять файлы.

### Пример 2: Генерация документации

```yaml
steps:
  - id: generate_docs
    name: "Генерация документации"
    type: model
    role: technical_writer
    permissions:
      read: ["**/*.ts", "**/*.md"]
      write: ["docs/*.md", "artifacts/*.md"]
      execute: false
    prompt_template: |
      Создай документацию API на основе кода.
    outputs:
      docs: "docs/api.md"
```

**Результат:** Claude использует `--tools "Read,Grep,Glob,Write" --allowedTools "Write"`, может писать только в docs/ и artifacts/.

### Пример 3: Генерация кода (с записью)

```yaml
steps:
  - id: generate_code
    name: "Генерация модуля"
    type: model
    role: developer
    permissions:
      read: ["**/*"]
      write: ["src/**/*.ts"]
      execute: false
    prompt_template: |
      Создай модуль для работы с API.
    outputs:
      module: "src/api-client.ts"
```

**Результат:** Codex использует `--sandbox workspace-write`, может писать в workspace но не выполнять команды.

### Пример 4: Полная автоматизация (ОПАСНО)

```yaml
steps:
  - id: full_automation
    name: "Полная автоматизация"
    type: model
    role: automation
    permissions:
      fullAccess: true  # ОПАСНО!
    prompt_template: |
      Установи зависимости и запусти тесты.
```

**Результат:** Только если явно указано `fullAccess: true`.

## Стратегия тестирования

### Unit-тесты

1. **Тесты mapPermissionsToArgs для каждого адаптера**
   - Проверить генерацию правильных флагов для разных комбинаций permissions
   - Проверить что yolo не используется без fullAccess

2. **Тесты readResultFromFile**
   - Проверить polling механизм
   - Проверить fallback на stdout
   - Проверить обработку пустых файлов

3. **Тесты appendFileWriteInstruction**
   - Проверить правильное имя инструмента для каждого CLI
   - Проверить формат инструкции

### Property-based тесты

1. **Property 1: Безопасность по умолчанию** - 100 итераций
2. **Property 2: Изоляция записи** - 100 итераций
3. **Property 3: Запрет execute по умолчанию** - 100 итераций

### Integration-тесты

1. **Тест с реальным Codex CLI** в read-only режиме
2. **Тест с реальным Claude CLI** с ограниченными инструментами
3. **Тест graceful degradation** при отсутствии файла

## План миграции

### Фаза 1: Расширение типов
- Добавить `StepPermissions` в types.ts
- Добавить `permissions` в `AdapterRequest`

### Фаза 2: Базовый адаптер
- Реализовать `appendFileWriteInstruction` с параметром toolName
- Реализовать `readResultFromFile` с polling
- Добавить абстрактный метод `mapPermissionsToArgs`

### Фаза 3: Codex адаптер
- Реализовать `mapPermissionsToArgs` с sandbox режимами
- Читать файл из `--output-last-message` после выполнения
- Убедиться что yolo не используется по умолчанию

### Фаза 4: Claude адаптер
- Реализовать `mapPermissionsToArgs` с --tools и --allowedTools
- Добавить инструкцию записи с инструментом `Write`
- Реализовать чтение файла с fallback

### Фаза 5: Gemini адаптер
- Рефакторинг для использования общих методов
- Сохранить текущее поведение

### Фаза 6: Тестирование и документация
- Написать тесты для всех properties
- Обновить примеры workflow
- Создать миграционное руководство

## Безопасность

### Принцип минимальных привилегий

1. **По умолчанию: read-only** - модель может только читать
2. **Явное указание write** - только тогда разрешена запись
3. **Явное указание execute** - только тогда разрешены команды
4. **fullAccess только явно** - никогда автоматически

### Валидация permissions

```typescript
function validatePermissions(permissions: StepPermissions): void {
  if (permissions.fullAccess && (permissions.read || permissions.write)) {
    throw new Error('fullAccess нельзя комбинировать с read/write');
  }

  // Проверка паттернов на path traversal
  for (const pattern of [...(permissions.read || []), ...(permissions.write || [])]) {
    if (pattern.includes('..')) {
      throw new Error(`Недопустимый паттерн: ${pattern}`);
    }
  }
}
```

## Заключение

Данный дизайн обеспечивает:

1. **Безопасность по умолчанию** - read-only режим без явного указания permissions
2. **Гибкость** - разные уровни доступа через permissions
3. **Унификация** - общий подход для всех CLI-адаптеров
4. **Graceful degradation** - работа даже при отсутствии поддержки инструментов
5. **Аудит** - логирование всех действий

### Ключевые изменения от исходного дизайна Kiro

1. **Убран `--allowed-tools write_file` для Codex** - такого флага нет в Codex CLI
2. **Добавлена система permissions** - контроль действий модели
3. **Безопасный режим по умолчанию** - никогда не используем yolo автоматически
4. **Polling вместо фиксированной задержки** - надежное чтение файла
5. **Адаптивное имя инструмента** - `write_file` для Gemini, `Write` для Claude
