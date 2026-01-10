# Заметки об отладке (2026-01-10)

## Исправленные проблемы

### 1. Парсинг permissions в YAML
**Проблема**: YAML парсер преобразует `edit: "*.md"` в объект `{edit: "*.md"}`, а не в строку.

**Решение**: Обновлен `RoleManager.parsePermissions()` для поддержки обоих форматов:
- Строковый: `"edit:*.md"`
- Объектный: `{edit: "*.md"}`

**Файлы**: `src/core/role-manager.ts`, `src/core/types.ts`

### 2. Конвертация glob-паттернов в regex
**Проблема**: Паттерн `*.md` не является валидным regex.

**Решение**: Добавлена функция `globToRegex()` для конвертации glob-паттернов (`*.md`, `**/*.ts`) в regex.

**Файлы**: `src/core/role-manager.ts`

### 3. Топологическая сортировка шагов
**Проблема**: Алгоритм топологической сортировки был реализован неправильно - шаги выполнялись в обратном порядке зависимостей.

**Решение**: Исправлен алгоритм в `WorkflowConfigParser.topologicalSort()`:
- Входящая степень теперь считается как количество зависимостей шага
- Правильная обработка графа зависимостей

**Файлы**: `src/core/workflow-config-parser.ts`

### 4. Подстановка ${timestamp} в artifacts_dir
**Проблема**: Переменная `${timestamp}` в конфигурации `artifacts_dir: "artifacts/session_${timestamp}"` не подставлялась.

**Решение**: Добавлена подстановка timestamp из sessionId при создании состояния в `WorkflowEngine.execute()`.

**Файлы**: `src/core/workflow-engine.ts`

### 5. Пути к файлам промптов
**Проблема**: В примере `examples/dual-design-workflow.yaml` пути к промптам указывали на `prompts/`, а файлы находились в `examples/prompts/`.

**Решение**: Обновлены пути в конфигурации на `examples/prompts/dual-design/`.

**Файлы**: `examples/dual-design-workflow.yaml`

### 6. Скрипт инициализации для Windows
**Проблема**: Скрипт в шаге инициализации использовал bash-команды (`mkdir -p`, `echo >`), которые не работают в Windows CMD.

**Решение**: Изменен скрипт на PowerShell-совместимый:
```yaml
shell: "powershell"
script: |
  New-Item -ItemType Directory -Force -Path "${artifacts_dir}" | Out-Null
  Set-Content -Path "${artifacts_dir}/step1_user_request.md" -Value "${user_request}"
```

**Файлы**: `examples/dual-design-workflow.yaml`

## Обновления .gitignore

Добавлены правила для игнорирования:
- `state/` - директория с файлами состояния workflow
- `test-*.js`, `test-*.txt`, `test-*.json` - временные тестовые файлы

## Известные особенности

### Структура директорий артефактов
Artifact-manager создает вложенную структуру директорий:
```
artifacts/
  session_<sessionId>/
    <путь_из_outputs>/
```

Это приводит к избыточным путям, но не влияет на функциональность. Для упрощения можно использовать `artifacts_dir: "artifacts/${timestamp}"` вместо `artifacts/session_${timestamp}`.

### Разделение state и artifacts
- **state/** - служебные файлы состояния для возобновления workflow
- **artifacts/** - результаты работы (документы, ответы моделей)

Это разделение позволяет управлять данными независимо.

## Тестирование

Для проверки исправлений:

```bash
# Сборка проекта
npm run build

# Валидация конфигурации
node dist/cli/cli.js dry-run examples/dual-design-workflow.yaml --show-steps --check-resources

# Запуск с mock-адаптером (требует создания тестового скрипта)
# См. примеры в документации
```

## Статус

✅ Все основные проблемы исправлены
✅ Порядок выполнения шагов корректный
✅ Система готова к использованию
