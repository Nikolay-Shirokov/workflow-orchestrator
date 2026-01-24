# Примеры Workflow

Эта директория содержит примеры конфигураций workflow для различных сценариев использования.

## ⚡ Быстрый старт

**Хотите начать прямо сейчас?** → [QUICKSTART.md](QUICKSTART.md)

## 🎯 Рекомендуемые для начала

### 1. Создание бизнес-требований (НОВОЕ!)

Интерактивный процесс создания детальных бизнес-требований с файловым вводом.

```bash
# Полная версия с двумя AI-моделями
workflow-orchestrator run examples/business-requirements-workflow.yaml

# Упрощенная версия для быстрого результата
workflow-orchestrator run examples/business-requirements-simple.yaml
```

📖 **Подробное руководство**: [BUSINESS_REQUIREMENTS_GUIDE.md](BUSINESS_REQUIREMENTS_GUIDE.md)

### 2. Файловый ввод - Быстрый старт

Простой пример использования файлового ввода.

```bash
workflow-orchestrator run examples/file-input-quickstart.yaml
```

### 3. Dual-Design процесс

Совместная разработка требований с двумя AI-моделями.

```bash
workflow-orchestrator run examples/dual-design-workflow.yaml
```

## 📚 Все примеры

### Основные workflow

| Файл | Описание | Сложность |
|------|----------|-----------|
| `business-requirements-workflow.yaml` | Создание бизнес-требований (полная версия) | ⭐⭐⭐ |
| `business-requirements-simple.yaml` | Создание бизнес-требований (упрощенная) | ⭐ |
| `file-input-quickstart.yaml` | Быстрый старт с файловым вводом | ⭐ |
| `file-input-workflow.yaml` | Примеры файлового ввода | ⭐⭐ |
| `file-input-error-handling.yaml` | Обработка ошибок при файловом вводе | ⭐⭐⭐ |
| `dual-design-workflow.yaml` | Dual-design процесс | ⭐⭐⭐ |
| `mcp-workflow-example.yaml` | Использование MCP-инструментов | ⭐⭐ |

### Конфигурации

| Файл | Описание |
|------|----------|
| `cli-adapters-config.yaml` | Примеры настройки CLI-адаптеров |
| `openai-compatible-config.yaml` | Настройка OpenAI-совместимых API |
| `lm-studio-remote-config.yaml` | Настройка LM Studio |

### Документация

| Файл | Описание |
|------|----------|
| `BUSINESS_REQUIREMENTS_GUIDE.md` | Руководство по созданию бизнес-требований |
| `export-import-example.md` | Примеры экспорта/импорта |
| `openai-compatible-quickstart.md` | Быстрый старт с OpenAI-совместимыми API |

### Дополнительные файлы

| Директория/Файл | Описание |
|-----------------|----------|
| `prompts/` | Шаблоны промптов для различных сценариев |
| `custom-adapter-plugin.js` | Пример пользовательского адаптера |

## 🚀 Быстрый старт

### 1. Установите Workflow Orchestrator

> **Примечание:** Пакет пока не опубликован на npm. Используйте установку из исходников.

```bash
git clone https://github.com/anthropics/workflow-orchestrator.git
cd workflow-orchestrator
npm install
npm run build
npm link  # Опционально: для глобальной команды workflow-orchestrator
```

Без `npm link` можно запускать напрямую:
```bash
node dist/cli/cli.js run examples/file-input-quickstart.yaml
```

### 2. Настройте API ключи

```bash
# Для Claude
export ANTHROPIC_API_KEY="your-key"

# Для OpenAI
export OPENAI_API_KEY="your-key"

# Для Gemini
export GOOGLE_API_KEY="your-key"
```

### 3. Запустите пример

```bash
# Из корня проекта
workflow-orchestrator run examples/file-input-quickstart.yaml

# Или из директории examples
cd examples
workflow-orchestrator run file-input-quickstart.yaml
```

## 📖 Детальное описание примеров

### Бизнес-требования

**business-requirements-workflow.yaml** - Полный процесс создания требований:
- 12 шагов с участием двух AI-моделей
- Многоэтапный анализ и уточнение
- Фокус на MVP
- Критическое ревью
- Финальная версия с учетом всех замечаний

**business-requirements-simple.yaml** - Упрощенная версия:
- 4 шага с одной AI-моделью
- Быстрое получение результата
- Подходит для простых проектов

### Файловый ввод

**file-input-quickstart.yaml** - Минимальный пример:
- Сбор информации через файл
- Создание плана на основе ответов
- Идеально для первого знакомства

**file-input-workflow.yaml** - Комплексный пример:
- 5 различных сценариев использования
- Все поддерживаемые форматы (Markdown, YAML, JSON, Text)
- Различные типы вопросов
- Интеграция с обработкой данных

**file-input-error-handling.yaml** - Обработка ошибок:
- 7 сценариев ошибок
- Стратегии восстановления
- Переключение на альтернативные режимы

### Dual-Design

**dual-design-workflow.yaml** - Совместная разработка:
- Архитектор и второй пилот
- Параллельное выполнение
- Взаимный анализ
- Итеративное улучшение

### MCP

**mcp-workflow-example.yaml** - Использование MCP-инструментов:
- Веб-исследование
- Анализ файлов
- Интеграция с внешними сервисами

## 🔧 Настройка примеров

### Изменение модели

Отредактируйте секцию `roles` в YAML файле:

```yaml
roles:
  assistant:
    adapter: "openai-cli"  # Вместо claude-cli
    model: "gpt-4"         # Вместо claude-sonnet-3.5
```

### Изменение редактора

Отредактируйте секцию `settings`:

```yaml
settings:
  default_editor:
    command: "vim"  # Вместо code
    wait: true
```

### Изменение формата файлов

Отредактируйте параметры шага:

```yaml
steps:
  - id: "input"
    file_format: "yaml"  # Вместо markdown
```

## 💡 Советы

### Для начинающих

1. Начните с `file-input-quickstart.yaml`
2. Попробуйте `business-requirements-simple.yaml`
3. Изучите `file-input-workflow.yaml`
4. Переходите к более сложным примерам

### Для опытных пользователей

1. Изучите `business-requirements-workflow.yaml` для понимания сложных процессов
2. Используйте `file-input-error-handling.yaml` как референс для обработки ошибок
3. Адаптируйте примеры под свои нужды
4. Создавайте собственные workflow на основе примеров

### Отладка

```bash
# Запуск с подробным логированием
workflow-orchestrator run example.yaml --log-level debug

# Проверка конфигурации без выполнения
workflow-orchestrator dry-run example.yaml

# Проверка статуса выполнения
workflow-orchestrator status <session-id>
```

## 🆘 Получение помощи

- 📖 **Документация**: [../docs/](../docs/)
- 💬 **Issues**: [GitHub Issues](https://github.com/Nikolay-Shirokov/workflow-orchestrator/issues)
- 💡 **Обсуждения**: [GitHub Discussions](https://github.com/Nikolay-Shirokov/workflow-orchestrator/discussions)

## 📝 Создание своих примеров

Хотите поделиться своим workflow? Отлично!

1. Создайте YAML файл с понятным именем
2. Добавьте комментарии для объяснения
3. Протестируйте его
4. Создайте Pull Request

Мы будем рады добавить ваш пример в коллекцию!

## 📄 Лицензия

Все примеры распространяются под лицензией MIT.
