# Workflow Orchestrator

Настраиваемая система оркестрации многошаговых рабочих процессов с использованием AI-моделей через CLI-адаптеры.

## Описание

Workflow Orchestrator - это инструмент для автоматизации сложных рабочих процессов с использованием различных AI-моделей. Система заменяет AI-оркестратор на скриптовый подход, обеспечивая стабильное и предсказуемое выполнение даже с менее продвинутыми моделями.

## Ключевые особенности

- **Декларативное описание процессов** через YAML/JSON или упрощенный DSL
- **CLI-адаптеры** для различных AI-утилит (claude-cli, codex-cli, gemini-cli и др.)
- **Управление состоянием** с возможностью остановки и возобновления
- **Шаблоны промптов** с динамической подстановкой переменных
- **Артефакты** для полной прозрачности процесса
- **Роли и специализация** моделей для разных задач
- **Параллельное выполнение** независимых шагов
- **Интеграция с MCP** для расширенных возможностей
- **Экспорт и импорт** конфигураций для совместной работы и версионирования

## Установка

```bash
npm install
```

## Сборка

```bash
npm run build
```

## Тестирование

```bash
# Запуск всех тестов
npm test

# Запуск тестов с покрытием
npm run test:coverage

# Запуск тестов в режиме наблюдения
npm run test:watch
```

## Использование

### Основные команды

```bash
# Запуск рабочего процесса
workflow-orchestrator run config.yaml

# Возобновление процесса
workflow-orchestrator resume <session-id> config.yaml

# Проверка статуса
workflow-orchestrator status <session-id>

# Валидация конфигурации (dry-run)
workflow-orchestrator dry-run config.yaml

# Экспорт конфигурации
workflow-orchestrator export config.yaml export.yaml --include-files

# Импорт конфигурации
workflow-orchestrator import export.yaml imported-config.yaml
```

### Экспорт и импорт конфигураций

Система поддерживает экспорт и импорт конфигураций для совместной работы и версионирования:

```bash
# Экспорт с включением внешних файлов
workflow-orchestrator export \
  my-workflow.yaml \
  exports/my-workflow-v1.0.yaml \
  --include-files \
  --author "Your Name" \
  --description "Production workflow" \
  --tags "production,v1.0"

# Импорт конфигурации
workflow-orchestrator import \
  exports/my-workflow-v1.0.yaml \
  imported/workflow.yaml \
  --base-dir ./imported \
  --conflict overwrite \
  --overwrite-files
```

Подробнее см. [examples/export-import-example.md](examples/export-import-example.md)

## Структура проекта

```
workflow-orchestrator/
├── src/
│   ├── core/           # Основные модули (типы, логирование)
│   ├── adapters/       # CLI-адаптеры для AI-моделей
│   ├── cli/            # Командный интерфейс
│   └── index.ts        # Главная точка входа
├── tests/              # Тесты
├── dist/               # Скомпилированный код
└── package.json
```

## Разработка

Проект находится в активной разработке. Функциональность будет добавляться постепенно согласно плану реализации.

## Лицензия

MIT
