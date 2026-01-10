# Примеры экспорта и импорта конфигураций

Этот документ демонстрирует использование функций экспорта и импорта конфигураций рабочих процессов.

## Экспорт конфигурации

### Базовый экспорт

Экспорт конфигурации в YAML формат:

```bash
workflow-orchestrator export \
  examples/mcp-workflow-example.yaml \
  exports/my-workflow-export.yaml \
  --format yaml \
  --author "Ваше Имя" \
  --description "Экспорт рабочего процесса для команды"
```

### Экспорт с включением внешних файлов

Экспорт с встраиванием содержимого шаблонов промптов:

```bash
workflow-orchestrator export \
  examples/mcp-workflow-example.yaml \
  exports/my-workflow-complete.yaml \
  --include-files \
  --base-dir ./examples \
  --format yaml \
  --author "Ваше Имя" \
  --description "Полный экспорт с шаблонами" \
  --tags "production,dual-design,v1.0"
```

### Экспорт в JSON

Экспорт в JSON формат для программной обработки:

```bash
workflow-orchestrator export \
  examples/mcp-workflow-example.yaml \
  exports/my-workflow-export.json \
  --format json \
  --include-files \
  --min-version "1.0.0"
```

## Импорт конфигурации

### Базовый импорт

Импорт конфигурации из экспорта:

```bash
workflow-orchestrator import \
  exports/my-workflow-export.yaml \
  imported/workflow-config.yaml \
  --base-dir ./imported
```

### Импорт с перезаписью файлов

Импорт с перезаписью существующих файлов:

```bash
workflow-orchestrator import \
  exports/my-workflow-complete.yaml \
  imported/workflow-config.yaml \
  --base-dir ./imported \
  --overwrite-files \
  --conflict overwrite
```

### Импорт с разрешением конфликтов

Различные стратегии разрешения конфликтов:

```bash
# Завершиться с ошибкой при конфликте (по умолчанию)
workflow-orchestrator import \
  exports/my-workflow-export.yaml \
  imported/workflow-config.yaml \
  --conflict fail

# Пропустить конфликтующие файлы
workflow-orchestrator import \
  exports/my-workflow-export.yaml \
  imported/workflow-config.yaml \
  --conflict skip

# Перезаписать существующие файлы
workflow-orchestrator import \
  exports/my-workflow-export.yaml \
  imported/workflow-config.yaml \
  --conflict overwrite \
  --overwrite-files

# Переименовать импортируемые файлы
workflow-orchestrator import \
  exports/my-workflow-export.yaml \
  imported/workflow-config.yaml \
  --conflict rename
```

### Импорт без валидации совместимости

Пропустить проверку совместимости версий:

```bash
workflow-orchestrator import \
  exports/my-workflow-export.yaml \
  imported/workflow-config.yaml \
  --no-validate
```

### Импорт с выводом в JSON

Получить детальную информацию об импорте в JSON формате:

```bash
workflow-orchestrator import \
  exports/my-workflow-export.yaml \
  imported/workflow-config.yaml \
  --json > import-result.json
```

## Программное использование

### TypeScript/JavaScript

```typescript
import { WorkflowExportImportManager } from './src/core/workflow-export-import.js';
import { WorkflowConfigParser } from './src/core/workflow-config-parser.js';

// Создание менеджера
const manager = new WorkflowExportImportManager('1.0.0');

// Загрузка конфигурации
const parser = new WorkflowConfigParser();
const config = await parser.loadFromFile('examples/mcp-workflow-example.yaml');

// Экспорт
const exportResult = await manager.export(config, {
  includeExternalFiles: true,
  baseDir: './examples',
  format: 'yaml',
  metadata: {
    exportedBy: 'automation-script',
    description: 'Автоматический экспорт',
    tags: ['automated', 'production']
  }
});

// Сохранение экспорта
await manager.saveExport(exportResult, 'exports/automated-export.yaml');

// Импорт
const importResult = await manager.import('exports/automated-export.yaml', {
  baseDir: './imported',
  validateCompatibility: true,
  conflictResolution: 'overwrite',
  overwriteFiles: true
});

console.log('Импортирован процесс:', importResult.config.name);
console.log('Извлечено файлов:', Object.keys(importResult.extractedFiles || {}).length);
console.log('Предупреждения:', importResult.compatibilityWarnings);
```

## Формат экспорта

Экспортированный файл содержит три основных секции:

### 1. Метаданные

```yaml
metadata:
  exportVersion: "1.0"
  exportedAt: "2026-01-10T10:00:00Z"
  exportedBy: "Ваше Имя"
  description: "Описание экспорта"
  tags:
    - production
    - dual-design
  orchestratorVersion: "1.0.0"
  minOrchestratorVersion: "1.0.0"
```

### 2. Конфигурация процесса

```yaml
workflow:
  name: "my-workflow"
  version: "1.0.0"
  description: "Описание процесса"
  settings:
    artifacts_dir: "artifacts"
  steps:
    - id: "step1"
      name: "Первый шаг"
      type: "model"
```

### 3. Встроенные файлы (опционально)

```yaml
embeddedFiles:
  prompts/architect.txt: |
    Содержимое файла шаблона промпта...
  prompts/copilot.txt: |
    Содержимое другого шаблона...
```

## Сценарии использования

### 1. Совместная работа в команде

Экспортируйте процесс с включением всех файлов и поделитесь с командой:

```bash
# Экспорт
workflow-orchestrator export \
  my-workflow.yaml \
  team-export.yaml \
  --include-files \
  --author "Team Lead" \
  --description "Процесс для команды разработки"

# Члены команды импортируют
workflow-orchestrator import \
  team-export.yaml \
  my-local-workflow.yaml \
  --base-dir ./my-workflows
```

### 2. Версионирование процессов

Создавайте версионированные экспорты для отслеживания изменений:

```bash
workflow-orchestrator export \
  my-workflow.yaml \
  exports/my-workflow-v1.0.0.yaml \
  --include-files \
  --tags "v1.0.0,stable"
```

### 3. Миграция между окружениями

Экспортируйте из разработки и импортируйте в продакшн:

```bash
# В разработке
workflow-orchestrator export \
  dev-workflow.yaml \
  exports/prod-ready.yaml \
  --include-files \
  --tags "production-ready"

# В продакшне
workflow-orchestrator import \
  exports/prod-ready.yaml \
  prod-workflow.yaml \
  --base-dir /opt/workflows \
  --conflict overwrite \
  --overwrite-files
```

### 4. Создание библиотеки процессов

Создайте коллекцию переиспользуемых процессов:

```bash
# Экспорт различных процессов
workflow-orchestrator export dual-design.yaml library/dual-design.yaml --include-files
workflow-orchestrator export api-design.yaml library/api-design.yaml --include-files
workflow-orchestrator export code-review.yaml library/code-review.yaml --include-files

# Импорт нужного процесса
workflow-orchestrator import library/dual-design.yaml my-project/workflow.yaml
```

## Проверка совместимости

При импорте система проверяет:

1. **Версию формата экспорта** - должна быть совместима с текущей версией
2. **Минимальную версию оркестратора** - текущая версия должна быть >= минимальной
3. **Структуру конфигурации** - должна быть валидной

Предупреждения о совместимости выводятся, но не блокируют импорт (если не используется `--no-validate`).

## Разрешение конфликтов

При обнаружении конфликтов (например, файл уже существует):

- **fail** (по умолчанию) - завершиться с ошибкой
- **skip** - пропустить конфликтующие файлы
- **overwrite** - перезаписать существующие файлы (требует `--overwrite-files`)
- **rename** - переименовать импортируемые файлы (добавить суффикс)

## Лучшие практики

1. **Всегда включайте метаданные** - указывайте автора, описание и теги
2. **Используйте версионирование** - добавляйте версию в имя файла экспорта
3. **Включайте файлы для полноты** - используйте `--include-files` для самодостаточных экспортов
4. **Проверяйте совместимость** - не отключайте валидацию без необходимости
5. **Документируйте изменения** - используйте поле description для описания изменений
6. **Используйте теги** - для категоризации и поиска экспортов

## Устранение проблем

### Ошибка: "Файл уже существует"

Используйте стратегию разрешения конфликтов:

```bash
workflow-orchestrator import export.yaml config.yaml --conflict overwrite --overwrite-files
```

### Предупреждение: "Несовместимая версия"

Проверьте требуемую минимальную версию в метаданных экспорта. Обновите оркестратор или используйте `--no-validate` (не рекомендуется).

### Ошибка: "Невалидная конфигурация"

Экспортированная конфигурация не прошла валидацию. Проверьте исходную конфигурацию перед экспортом.

### Файлы не извлекаются

Убедитесь, что экспорт был создан с опцией `--include-files` и что при импорте указана правильная `--base-dir`.
