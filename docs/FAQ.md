# Часто задаваемые вопросы (FAQ)

## Общие вопросы

### Что такое Workflow Orchestrator?

Workflow Orchestrator - это инструмент для автоматизации многошаговых рабочих процессов с использованием различных AI-моделей через CLI-адаптеры. Он позволяет создавать сложные процессы декларативно, управлять состоянием выполнения и использовать разные модели для разных задач.

### В чем отличие от других инструментов оркестрации?

- **Фокус на AI-моделях**: специализирован для работы с AI через CLI
- **Декларативный подход**: процессы описываются в YAML/JSON или DSL
- **Управление состоянием**: автоматическое сохранение и возобновление
- **Роли и специализация**: разные модели для разных задач
- **Полная прозрачность**: все промежуточные результаты сохраняются

### Какие AI-модели поддерживаются?

- Claude (Anthropic) через claude-cli
- GPT (OpenAI) через openai-cli
- Gemini (Google) через gemini-cli
- Локальные модели через Ollama
- Azure OpenAI через Azure CLI
- Любые другие через пользовательские адаптеры

## Установка и настройка

### Как установить Workflow Orchestrator?

```bash
git clone https://github.com/your-org/workflow-orchestrator.git
cd workflow-orchestrator
npm install
npm run build
npm link  # для глобальной установки
```

Подробнее см. [INSTALLATION.md](INSTALLATION.md)

### Нужно ли устанавливать все CLI-адаптеры?

Нет, достаточно установить только те адаптеры, которые вы планируете использовать. Для начала рекомендуем установить хотя бы один (например, claude-cli или openai-cli).

### Как настроить API ключи?

Установите переменные окружения:

```bash
export ANTHROPIC_API_KEY="your-key"
export OPENAI_API_KEY="your-key"
export GOOGLE_API_KEY="your-key"
```

Или создайте файл `.env` в корне проекта.

### Можно ли использовать локальные модели?

Да, через Ollama:

```bash
ollama pull llama2
```

Затем используйте адаптер `ollama` в конфигурации.

## Использование

### Как создать первый процесс?

См. [GETTING_STARTED.md](GETTING_STARTED.md) для пошагового руководства.

Минимальный пример:

```yaml
workflow:
  name: "my-workflow"
  version: "1.0"
  
  settings:
    artifacts_dir: "artifacts"
  
  roles:
    assistant:
      adapter: "claude-cli"
      model: "claude-sonnet-3.5"
  
  steps:
    - id: "step1"
      type: "model"
      role: "assistant"
      prompt_template: "Ваш промпт здесь"
      outputs:
        result: "${artifacts_dir}/result.md"
```

### Как передать переменные в процесс?

Через командную строку:

```bash
workflow-orchestrator run config.yaml --var key=value
```

Или в конфигурации:

```yaml
steps:
  - id: "step1"
    inputs:
      my_var: "${my_var}"
```

### Как использовать результаты предыдущих шагов?

Через переменные артефактов:

```yaml
steps:
  - id: "step1"
    outputs:
      result: "${artifacts_dir}/step1.md"
  
  - id: "step2"
    depends_on: ["step1"]
    prompt_template: |
      Используйте результат предыдущего шага:
      ${artifact:${result}}
    inputs:
      result: "${result}"
```

### Как остановить и возобновить процесс?

Остановите процесс (Ctrl+C), затем возобновите:

```bash
workflow-orchestrator resume <session-id> config.yaml
```

Session ID отображается при запуске процесса.

### Как проверить статус процесса?

```bash
workflow-orchestrator status <session-id>
```

### Как запустить шаги параллельно?

```yaml
steps:
  - id: "parallel_steps"
    type: "parallel"
    steps:
      - id: "step1"
        # конфигурация шага 1
      - id: "step2"
        # конфигурация шага 2
```

## Конфигурация

### Что такое роли?

Роли - это именованные конфигурации для AI-моделей с определенным поведением:

```yaml
roles:
  architect:
    adapter: "claude-cli"
    model: "claude-sonnet-3.5"
    role_definition: "Вы - архитектор..."
    default_permissions:
      read: ["*.md", "src/**/*"]
      write: ["artifacts/**/*.md"]
```

Роли позволяют использовать разные модели для разных задач.

### Как использовать условное выполнение?

```yaml
steps:
  - id: "optional_step"
    condition: "mcp_tools.web_search_available"
    # остальная конфигурация
```

Шаг выполнится только если условие истинно.

### Как настроить таймауты и повторы?

```yaml
steps:
  - id: "step1"
    timeout: 600  # секунды
    retries: 3
    continue_on_error: false
```

### Что такое шаблоны промптов?

Шаблоны промптов - это текстовые файлы с переменными:

```
Проанализируйте следующий запрос:
${user_request}

Используйте результаты исследования:
${artifact:${research_file}}
```

Переменные подставляются при выполнении.

## DSL

### Что такое DSL?

DSL (Domain Specific Language) - упрощенный язык для описания процессов:

```
workflow my-workflow v1.0 {
  role assistant {
    adapter claude-cli
    model claude-sonnet-3.5
  }
  
  step analysis {
    type model
    role assistant
    prompt "Ваш промпт"
    output result = "artifacts/result.md"
  }
}
```

Подробнее см. [DSL_SYNTAX.md](DSL_SYNTAX.md)

### Когда использовать DSL вместо YAML?

DSL более компактен и читаем для простых процессов. YAML лучше для сложных конфигураций с множеством параметров.

### Как конвертировать YAML в DSL?

```bash
workflow-orchestrator convert config.yaml --to-dsl --output config.dsl
```

## Экспорт и импорт

### Зачем нужен экспорт?

Экспорт позволяет:
- Делиться процессами с командой
- Версионировать конфигурации
- Создавать библиотеки процессов
- Мигрировать между окружениями

### Как экспортировать процесс?

```bash
workflow-orchestrator export \
  config.yaml \
  export.yaml \
  --include-files \
  --author "Ваше Имя"
```

### Что делает флаг --include-files?

Встраивает содержимое внешних файлов (шаблонов промптов) в экспорт, делая его самодостаточным.

### Как импортировать процесс?

```bash
workflow-orchestrator import \
  export.yaml \
  my-config.yaml \
  --base-dir ./my-workflows
```

## Артефакты

### Что такое артефакты?

Артефакты - это файлы с результатами выполнения шагов. Они сохраняются в директории `artifacts/` и содержат все промежуточные результаты.

### Где хранятся артефакты?

По умолчанию в `artifacts/session_<timestamp>/`. Путь настраивается:

```yaml
settings:
  artifacts_dir: "my-artifacts/session_${timestamp}"
```

### Как использовать артефакты в промптах?

```yaml
prompt_template: |
  Используйте результат:
  ${artifact:${previous_result}}
```

### Можно ли удалять старые артефакты?

Да, артефакты можно безопасно удалять после завершения процесса. Для возобновления процесса они должны быть доступны.

## Ошибки и отладка

### Процесс завершается с ошибкой "API key not found"

Проверьте переменные окружения:

```bash
echo $ANTHROPIC_API_KEY
```

Если пусто, установите:

```bash
export ANTHROPIC_API_KEY="your-key"
```

### Ошибка "Adapter not available"

Проверьте установку CLI-утилиты:

```bash
which claude
which openai
```

Если не найдено, установите адаптер.

### Как включить детальное логирование?

```bash
export WORKFLOW_LOG_LEVEL=debug
```

Или в конфигурации:

```yaml
settings:
  log_level: "debug"
```

### Процесс зависает на шаге

Проверьте:
1. Таймаут шага (может быть слишком коротким)
2. Логи выполнения
3. Доступность API модели

Увеличьте таймаут:

```yaml
steps:
  - id: "slow_step"
    timeout: 1200  # 20 минут
```

### Как отладить шаблоны промптов?

Используйте dry-run для проверки подстановки переменных:

```bash
workflow-orchestrator dry-run config.yaml --var key=value
```

## Производительность

### Как ускорить выполнение?

1. Используйте параллельное выполнение для независимых шагов
2. Выбирайте быстрые модели для простых задач (claude-haiku, gpt-3.5-turbo)
3. Используйте локальные модели через Ollama
4. Оптимизируйте промпты (короче = быстрее)

### Сколько стоит запуск процесса?

Зависит от:
- Выбранных моделей (GPT-4 дороже GPT-3.5)
- Длины промптов и ответов
- Количества шагов

Используйте dry-run для оценки без затрат.

### Можно ли кэшировать результаты?

Да, артефакты сохраняются автоматически. Вы можете переиспользовать их:

```yaml
steps:
  - id: "cached_step"
    condition: "!file_exists('${artifacts_dir}/cached.md')"
    # выполнится только если файл не существует
```

## Безопасность

### Безопасно ли хранить API ключи в .env?

Для разработки - да. Для продакшена используйте:
- Переменные окружения системы
- Секреты CI/CD
- Менеджеры секретов (AWS Secrets Manager, HashiCorp Vault)

Добавьте `.env` в `.gitignore`!

### Как ограничить доступ к файлам?

Используйте разрешения в ролях:

```yaml
roles:
  restricted:
    default_permissions:
      read: ["*.md"]           # только чтение markdown файлов
      write: ["docs/*.md"]     # запись только в docs/
      # execute: true          # shell-команды (по умолчанию отключено)
      # fullAccess: true       # полный доступ (ОПАСНО!)
```

Подробнее см. [SECURITY.md](SECURITY.md#6-разрешения-на-уровне-шага-steppermissions)

### Что такое capabilities?

Capabilities - дополнительные возможности модели, выходящие за рамки файловых операций:

- `web_search` - поиск информации в интернете
- `web_fetch` - загрузка содержимого веб-страниц по URL
- `mcp_tools` - использование MCP-инструментов
- `browser` - интеграция с браузером

Пример использования:

```yaml
steps:
  - id: "research"
    type: "model"
    role: "researcher"
    prompt_template: "Найди информацию о ${topic}"
    permissions:
      read: ["docs/**/*"]
      capabilities:
        web_search: true
        web_fetch: true
```

### Как использовать MCP-инструменты?

MCP-серверы настраиваются **вне workflow** на уровне CLI:

```bash
# Claude
claude mcp add my-server

# Codex
codex mcp add my-server

# Gemini
gemini mcp add my-server
```

Workflow лишь даёт разрешение на использование настроенных инструментов:

```yaml
permissions:
  capabilities:
    mcp_tools: true                    # все настроенные MCP-инструменты
    # или
    mcp_tools: ["db_query", "db_insert"]  # только указанные
```

### Какие адаптеры поддерживают какие capabilities?

| Capability | Claude | Codex | Gemini |
|------------|--------|-------|--------|
| `web_search` | ✅ | ✅ | ✅ |
| `web_fetch` | ✅ | ❌ | ✅ |
| `mcp_tools` | ✅ | ⚡ авто | ✅ |
| `browser` | ✅ | ❌ | ❌ |

### Можно ли запускать процессы в изолированной среде?

Да, используйте Docker:

```bash
docker run -e ANTHROPIC_API_KEY=key workflow-orchestrator run config.yaml
```

## Интеграция

### Как интегрировать в CI/CD?

Пример для GitHub Actions:

```yaml
- name: Run workflow
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: |
    workflow-orchestrator run config.yaml
```

### Можно ли вызывать из другого кода?

Да, используйте программный API:

```typescript
import { WorkflowEngine } from 'workflow-orchestrator';

const engine = new WorkflowEngine();
await engine.run('config.yaml');
```

### Как интегрировать с веб-приложением?

Запустите как сервис и вызывайте через API или очередь задач.

## Расширение

### Как создать пользовательский адаптер?

Реализуйте интерфейс `CLIAdapter`:

```typescript
class MyAdapter implements CLIAdapter {
  async execute(request: AdapterRequest): Promise<AdapterResponse> {
    // ваша реализация
  }
}
```

Зарегистрируйте в `AdapterRegistry`.

### Можно ли добавить новые типы шагов?

Да, расширьте `StepExecutor` и добавьте обработку нового типа.

### Как создать плагин?

Создайте npm пакет с вашим адаптером/функциональностью и опубликуйте. Пользователи смогут установить через npm.

## Сообщество

### Где получить помощь?

- GitHub Issues для багов и вопросов
- Документация в `docs/`
- Примеры в `examples/`

### Как внести вклад?

1. Fork репозитория
2. Создайте ветку для изменений
3. Добавьте тесты
4. Создайте Pull Request

См. CONTRIBUTING.md

### Где обсудить идеи?

GitHub Discussions для обсуждения новых функций и идей.

## Дополнительные ресурсы

- [Руководство по началу работы](GETTING_STARTED.md)
- [Руководство по установке](INSTALLATION.md)
- [Документация по DSL](DSL_SYNTAX.md)
- [Примеры процессов](../examples/)
- [API документация](API.md)

---

Не нашли ответ на свой вопрос? Создайте issue на GitHub!
