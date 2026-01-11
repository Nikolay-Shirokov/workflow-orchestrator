# Быстрый старт: OpenAI-совместимый адаптер

Это руководство поможет вам быстро начать работу с OpenAI-совместимым адаптером.

## Что это?

OpenAI-совместимый адаптер позволяет использовать любые сервисы с OpenAI API без установки дополнительных CLI-утилит. Работает с локальными (LM Studio, LocalAI, Ollama) и облачными (OpenAI API) сервисами.

## Вариант 1: Локальный LM Studio (самый простой)

### Шаг 1: Запустите LM Studio

1. Скачайте и установите [LM Studio](https://lmstudio.ai/)
2. Загрузите любую модель (например, Llama 2)
3. Запустите локальный сервер (обычно на порту 1234)

### Шаг 2: Создайте конфигурацию

Создайте файл `my-workflow.yaml`:

```yaml
workflow:
  name: "lm-studio-test"
  version: "1.0"
  
  settings:
    artifacts_dir: "artifacts"
  
  adapters:
    - name: "lm-studio"
      type: "openai-compatible"
      baseUrl: "http://localhost:1234/v1"
      defaultModel: "local-model"
  
  roles:
    assistant:
      adapter: "lm-studio"
  
  steps:
    - id: "greeting"
      type: "model"
      role: "assistant"
      prompt_template: "Напишите короткое приветствие для пользователя"
      outputs:
        result: "${artifacts_dir}/greeting.md"
```

### Шаг 3: Запустите

```bash
workflow-orchestrator run my-workflow.yaml
```

### Шаг 4: Проверьте результат

```bash
cat artifacts/greeting.md
```

## Вариант 2: OpenAI API (облачный)

### Шаг 1: Получите API ключ

1. Зарегистрируйтесь на [platform.openai.com](https://platform.openai.com/)
2. Создайте API ключ в разделе API Keys
3. Установите переменную окружения:

```bash
export OPENAI_API_KEY="sk-your-api-key-here"
```

### Шаг 2: Создайте конфигурацию

Создайте файл `openai-workflow.yaml`:

```yaml
workflow:
  name: "openai-test"
  version: "1.0"
  
  settings:
    artifacts_dir: "artifacts"
  
  adapters:
    - name: "openai"
      type: "openai-compatible"
      baseUrl: "https://api.openai.com/v1"
      apiKey: "${OPENAI_API_KEY}"
      defaultModel: "gpt-3.5-turbo"
  
  roles:
    assistant:
      adapter: "openai"
      model: "gpt-3.5-turbo"
  
  steps:
    - id: "analysis"
      type: "model"
      role: "assistant"
      prompt_template: "Проанализируйте преимущества использования AI в разработке"
      outputs:
        result: "${artifacts_dir}/analysis.md"
```

### Шаг 3: Запустите

```bash
workflow-orchestrator run openai-workflow.yaml
```

## Вариант 3: Ollama (локальный)

### Шаг 1: Установите Ollama

```bash
# Linux/macOS
curl -fsSL https://ollama.com/install.sh | sh

# Windows
# Скачайте установщик с ollama.com
```

### Шаг 2: Запустите Ollama в OpenAI-совместимом режиме

```bash
# Загрузите модель
ollama pull llama2

# Запустите сервер с OpenAI API
ollama serve --openai-compat
```

### Шаг 3: Создайте конфигурацию

Создайте файл `ollama-workflow.yaml`:

```yaml
workflow:
  name: "ollama-test"
  version: "1.0"
  
  settings:
    artifacts_dir: "artifacts"
  
  adapters:
    - name: "ollama"
      type: "openai-compatible"
      baseUrl: "http://localhost:11434/v1"
      defaultModel: "llama2"
  
  roles:
    assistant:
      adapter: "ollama"
  
  steps:
    - id: "story"
      type: "model"
      role: "assistant"
      prompt_template: "Напишите короткую историю о роботе"
      outputs:
        result: "${artifacts_dir}/story.md"
```

### Шаг 4: Запустите

```bash
workflow-orchestrator run ollama-workflow.yaml
```

## Комбинирование адаптеров

Вы можете использовать несколько адаптеров в одном workflow:

```yaml
workflow:
  name: "multi-adapter"
  version: "1.0"
  
  settings:
    artifacts_dir: "artifacts"
  
  adapters:
    # Локальный адаптер для черновиков
    - name: "local"
      type: "openai-compatible"
      baseUrl: "http://localhost:1234/v1"
      defaultModel: "local-model"
    
    # Облачный адаптер для финальной обработки
    - name: "cloud"
      type: "openai-compatible"
      baseUrl: "https://api.openai.com/v1"
      apiKey: "${OPENAI_API_KEY}"
      defaultModel: "gpt-4"
  
  roles:
    drafter:
      adapter: "local"
      role_definition: "Вы создаете черновики"
    
    editor:
      adapter: "cloud"
      model: "gpt-4"
      role_definition: "Вы улучшаете и редактируете текст"
  
  steps:
    - id: "draft"
      type: "model"
      role: "drafter"
      prompt_template: "Напишите черновик статьи о ${topic}"
      outputs:
        draft: "${artifacts_dir}/draft.md"
    
    - id: "edit"
      type: "model"
      role: "editor"
      depends_on: ["draft"]
      prompt_template: |
        Улучшите следующий черновик:
        
        ${artifact:${draft}}
      outputs:
        final: "${artifacts_dir}/final.md"
```

## Настройка параметров

### Таймауты

Увеличьте таймаут для медленных моделей:

```yaml
adapters:
  - name: "slow-model"
    type: "openai-compatible"
    baseUrl: "http://localhost:1234/v1"
    timeout: 300000  # 5 минут
```

### Параметры генерации

Настройте температуру и длину ответа:

```yaml
roles:
  creative:
    adapter: "lm-studio"
    temperature: 0.9      # Более креативные ответы
    max_tokens: 2000      # Длинные ответы
  
  precise:
    adapter: "lm-studio"
    temperature: 0.1      # Более точные ответы
    max_tokens: 500       # Короткие ответы
```

### Дополнительные заголовки

Добавьте пользовательские заголовки:

```yaml
adapters:
  - name: "custom"
    type: "openai-compatible"
    baseUrl: "http://localhost:8000/v1"
    headers:
      X-Custom-Header: "my-value"
      X-Request-ID: "${request_id}"
```

## Проверка доступности

Проверьте, что сервис доступен:

```bash
# Для LM Studio
curl http://localhost:1234/v1/models

# Для Ollama
curl http://localhost:11434/v1/models

# Для OpenAI
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

## Устранение проблем

### "API недоступен"

1. Убедитесь, что сервис запущен
2. Проверьте правильность порта в `baseUrl`
3. Проверьте доступность: `curl http://localhost:1234/v1/models`

### "Ошибка аутентификации"

1. Проверьте API ключ: `echo $OPENAI_API_KEY`
2. Убедитесь, что ключ правильный (начинается с `sk-` для OpenAI)
3. Проверьте, что переменная окружения установлена

### "Таймаут запроса"

1. Увеличьте `timeout` в конфигурации
2. Используйте меньшую модель
3. Проверьте производительность системы

### "Модель не найдена"

1. Проверьте список моделей: `curl http://localhost:1234/v1/models`
2. Убедитесь, что модель загружена в LM Studio/Ollama
3. Проверьте правильность имени модели

## Следующие шаги

- 📖 Полная документация: [docs/OPENAI_COMPATIBLE_ADAPTER.md](../docs/OPENAI_COMPATIBLE_ADAPTER.md)
- 🔧 Примеры конфигураций: [openai-compatible-config.yaml](openai-compatible-config.yaml)
- 🚀 Руководство по началу работы: [docs/GETTING_STARTED.md](../docs/GETTING_STARTED.md)

## Полезные ссылки

- [LM Studio](https://lmstudio.ai/) - локальный сервер для LLM
- [Ollama](https://ollama.com/) - запуск локальных моделей
- [LocalAI](https://localai.io/) - самостоятельно размещаемая альтернатива OpenAI
- [OpenAI API](https://platform.openai.com/) - облачный API OpenAI
