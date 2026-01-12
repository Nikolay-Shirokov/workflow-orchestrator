# OpenAI-совместимый HTTP API адаптер

Руководство по использованию встроенного адаптера для работы с OpenAI-совместимыми HTTP API.

## Обзор

OpenAI-совместимый адаптер (`openai-compatible`) предоставляет прямую интеграцию с любыми сервисами, реализующими OpenAI API спецификацию. В отличие от CLI-адаптеров, которые запускают внешние утилиты командной строки, этот адаптер работает напрямую с HTTP API через встроенный HTTP клиент Node.js.

## Поддерживаемые сервисы

Адаптер работает с любыми OpenAI-совместимыми API, включая:

### Локальные сервисы

- **LM Studio** - локальное приложение для запуска LLM моделей
- **LocalAI** - самостоятельно размещаемая альтернатива OpenAI
- **Ollama** - в OpenAI-совместимом режиме
- **Text Generation WebUI** (oobabooga) - с OpenAI API расширением
- **vLLM** - высокопроизводительный inference сервер
- **FastChat** - платформа для обучения и развертывания LLM

### Облачные сервисы

- **OpenAI API** - официальный API OpenAI (GPT-4, GPT-3.5-turbo и др.)
- **Azure OpenAI** - OpenAI модели через Azure
- **Другие облачные провайдеры** - любые сервисы с OpenAI-совместимым API

## Быстрый старт

### 1. Настройка локального LM Studio

```yaml
workflow:
  name: "lm-studio-example"
  
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
      prompt_template: "Поприветствуйте пользователя!"
```

**Запуск:**
1. Запустите LM Studio и загрузите модель
2. Включите локальный сервер в LM Studio (обычно на порту 1234)
3. Запустите workflow: `workflow-orchestrator run config.yaml`

### 2. Настройка OpenAI API

```yaml
workflow:
  name: "openai-example"
  
  adapters:
    - name: "openai"
      type: "openai-compatible"
      baseUrl: "https://api.openai.com/v1"
      apiKey: "${OPENAI_API_KEY}"
      defaultModel: "gpt-4"
  
  roles:
    assistant:
      adapter: "openai"
      model: "gpt-4"
```

**Запуск:**
1. Установите переменную окружения: `export OPENAI_API_KEY="your-api-key"`
2. Запустите workflow: `workflow-orchestrator run config.yaml`

## Параметры конфигурации

### Обязательные параметры

- `name` (string) - Уникальное имя адаптера
- `type` (string) - Должен быть `"openai-compatible"`
- `baseUrl` (string) - Базовый URL API (например, `http://localhost:1234/v1`)

### Опциональные параметры

- `apiKey` (string) - API ключ для аутентификации
  - Поддерживает переменные окружения: `"${OPENAI_API_KEY}"`
  - Не требуется для локальных сервисов без аутентификации
  
- `defaultModel` (string) - Модель по умолчанию
  - Используется если модель не указана в роли или шаге
  
- `timeout` (number) - Таймаут запросов в миллисекундах
  - По умолчанию: 300000 (5 минут)
  - Рекомендуется: 60000-120000 для локальных моделей
  
- `headers` (object) - Дополнительные HTTP заголовки
  - Полезно для пользовательской аутентификации или трейсинга

## Примеры конфигураций

### LM Studio (локальный сервер)

```yaml
adapters:
  - name: "lm-studio"
    type: "openai-compatible"
    baseUrl: "http://localhost:1234/v1"
    defaultModel: "local-model"
    timeout: 60000
```

### LocalAI

```yaml
adapters:
  - name: "localai"
    type: "openai-compatible"
    baseUrl: "http://localhost:8080/v1"
    apiKey: "${LOCALAI_API_KEY}"
    defaultModel: "gpt-3.5-turbo"
    timeout: 60000
```

### Ollama (OpenAI-совместимый режим)

```yaml
adapters:
  - name: "ollama"
    type: "openai-compatible"
    baseUrl: "http://localhost:11434/v1"
    defaultModel: "llama2"
    timeout: 120000
```

**Примечание:** Для Ollama требуется запуск с флагом `--openai-compat`:
```bash
ollama serve --openai-compat
```

### Text Generation WebUI (oobabooga)

```yaml
adapters:
  - name: "text-gen-webui"
    type: "openai-compatible"
    baseUrl: "http://localhost:5000/v1"
    defaultModel: "default"
    timeout: 90000
```

**Примечание:** Включите OpenAI API расширение в настройках Text Generation WebUI.

### OpenAI API (облачный)

```yaml
adapters:
  - name: "openai"
    type: "openai-compatible"
    baseUrl: "https://api.openai.com/v1"
    apiKey: "${OPENAI_API_KEY}"
    defaultModel: "gpt-4"
    timeout: 120000
```

### Пользовательский API с дополнительными заголовками

```yaml
adapters:
  - name: "custom-api"
    type: "openai-compatible"
    baseUrl: "http://localhost:8000/v1"
    apiKey: "${CUSTOM_API_KEY}"
    defaultModel: "custom-model"
    timeout: 60000
    headers:
      X-Custom-Header: "custom-value"
      X-Request-ID: "${request_id}"
```

## Использование в workflow

### Определение ролей

```yaml
roles:
  # Локальный ассистент через LM Studio
  local_assistant:
    adapter: "lm-studio"
    model: "local-model"
    role_definition: "Вы - локальный AI-ассистент"
    temperature: 0.7
    max_tokens: 2000
  
  # Облачный ассистент через OpenAI
  cloud_assistant:
    adapter: "openai"
    model: "gpt-4"
    role_definition: "Вы - облачный AI-ассистент"
    temperature: 0.7
    max_tokens: 4000
  
  # Специализированный ассистент для кода
  code_assistant:
    adapter: "ollama"
    model: "codellama"
    role_definition: "Вы - специалист по программированию"
    temperature: 0.3
    max_tokens: 3000
```

### Использование в шагах

```yaml
steps:
  # Использование роли
  - id: "step1"
    type: "model"
    role: "local_assistant"
    prompt_template: "Напишите описание проекта"
  
  # Переопределение адаптера для конкретного шага
  - id: "step2"
    type: "model"
    adapter: "openai"
    model: "gpt-4"
    prompt_template: "Улучшите описание"
  
  # Использование параметров генерации
  - id: "step3"
    type: "model"
    role: "code_assistant"
    temperature: 0.2
    max_tokens: 5000
    prompt_template: "Создайте структуру проекта"
```

## Переменные окружения

Адаптер поддерживает подстановку переменных окружения в формате `${VAR_NAME}`:

```yaml
adapters:
  - name: "openai"
    type: "openai-compatible"
    baseUrl: "https://api.openai.com/v1"
    apiKey: "${OPENAI_API_KEY}"  # Подставится из process.env.OPENAI_API_KEY
```

**Установка переменных окружения:**

Linux/macOS:
```bash
export OPENAI_API_KEY="your-api-key"
export LOCALAI_API_KEY="your-localai-key"
```

Windows (PowerShell):
```powershell
$env:OPENAI_API_KEY="your-api-key"
$env:LOCALAI_API_KEY="your-localai-key"
```

Windows (CMD):
```cmd
set OPENAI_API_KEY=your-api-key
set LOCALAI_API_KEY=your-localai-key
```

## Обработка ошибок

Адаптер автоматически обрабатывает различные типы ошибок:

### Сетевые ошибки (retryable)
- Невозможно подключиться к серверу
- Таймаут соединения
- DNS ошибки

### Ошибки аутентификации (не retryable)
- HTTP 401: Неверный API ключ
- HTTP 403: Отсутствие прав доступа

### Ошибки лимитов (retryable)
- HTTP 429: Превышен rate limit
- Квота исчерпана

### Серверные ошибки (retryable)
- HTTP 500: Внутренняя ошибка сервера
- HTTP 503: Сервис недоступен

### Ошибки валидации (не retryable)
- HTTP 400: Неверный формат запроса
- HTTP 404: Эндпоинт или модель не найдены

**Примечание:** Адаптер устойчив к неподдерживаемым параметрам - если сервис не поддерживает какой-то параметр (например, `temperature`), он просто игнорирует его без ошибки.

## Проверка доступности

Адаптер автоматически проверяет доступность API перед использованием:

```javascript
const adapter = new OpenAICompatibleAdapter({
  name: 'lm-studio',
  baseUrl: 'http://localhost:1234/v1'
});

const isAvailable = await adapter.isAvailable();
if (!isAvailable) {
  console.error('API недоступен');
}
```

Проверка выполняется через GET запрос к эндпоинту `/models` с таймаутом 5 секунд.

## Рекомендации по таймаутам

Выбор правильного таймаута зависит от типа сервиса и размера модели:

| Тип сервиса | Рекомендуемый таймаут | Примечание |
|-------------|----------------------|------------|
| Локальные модели (CPU) | 120000-300000 мс (2-5 мин) | Зависит от мощности CPU |
| Локальные модели (GPU) | 60000-120000 мс (1-2 мин) | Быстрее с GPU |
| Облачные API | 120000-180000 мс (2-3 мин) | Зависит от загрузки сервиса |
| Большие модели | 300000+ мс (5+ мин) | Для моделей 70B+ параметров |

## Программное использование

### Создание адаптера

```javascript
import { OpenAICompatibleAdapter } from 'workflow-orchestrator';

// Создание адаптера для LM Studio
const lmStudio = new OpenAICompatibleAdapter({
  name: 'lm-studio',
  baseUrl: 'http://localhost:1234/v1',
  defaultModel: 'local-model',
  timeout: 60000
});

// Создание адаптера для OpenAI
const openai = new OpenAICompatibleAdapter({
  name: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: process.env.OPENAI_API_KEY,
  defaultModel: 'gpt-4',
  timeout: 120000
});
```

### Выполнение запроса

```javascript
const response = await lmStudio.execute({
  prompt: 'Привет! Как дела?',
  model: 'local-model',
  temperature: 0.7,
  maxTokens: 100,
  systemPrompt: 'Вы - дружелюбный ассистент'
});

console.log('Ответ:', response.content);
console.log('Модель:', response.model);
console.log('Токены:', response.tokensUsed);
console.log('Время выполнения:', response.executionTime, 'мс');
```

### Регистрация в AdapterRegistry

```javascript
import { AdapterRegistry } from 'workflow-orchestrator';

const registry = new AdapterRegistry();
registry.register(lmStudio);

// Получение адаптера по имени
const adapter = registry.get('lm-studio');
```

## Отладка

### Включение логирования

Адаптер логирует предупреждения и ошибки в консоль:

```javascript
// Проверка доступности с логированием
const isAvailable = await adapter.isAvailable();
// Вывод: [lm-studio] API недоступен. Статус: 404
// или: [lm-studio] Ошибка проверки доступности: Connection refused
```

### Проверка конфигурации

```javascript
console.log('Конфигурация адаптера:');
console.log('- Имя:', adapter.name);
console.log('- Версия:', adapter.version);
console.log('- Base URL:', adapter.baseUrl);
console.log('- Модель по умолчанию:', adapter.defaultModel);
console.log('- Таймаут:', adapter.timeout);
```

### Тестирование подключения

```bash
# Проверка доступности эндпоинта /models
curl http://localhost:1234/v1/models

# Тестовый запрос к chat/completions
curl http://localhost:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local-model",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Устранение неполадок

### Проблема: "API недоступен"

**Решение:**
1. Убедитесь, что сервис запущен
2. Проверьте правильность `baseUrl`
3. Проверьте доступность порта: `curl http://localhost:1234/v1/models`

### Проблема: "Ошибка аутентификации"

**Решение:**
1. Проверьте правильность API ключа
2. Убедитесь, что переменная окружения установлена: `echo $OPENAI_API_KEY`
3. Проверьте формат ключа (должен начинаться с `sk-` для OpenAI)

### Проблема: "Таймаут запроса"

**Решение:**
1. Увеличьте значение `timeout` в конфигурации
2. Проверьте производительность системы (CPU/GPU)
3. Попробуйте использовать меньшую модель

### Проблема: "Модель не найдена"

**Решение:**
1. Проверьте список доступных моделей: `curl http://localhost:1234/v1/models`
2. Убедитесь, что модель загружена в LM Studio/LocalAI
3. Проверьте правильность имени модели в конфигурации

### Проблема: "Неподдерживаемый параметр"

**Решение:**
- Адаптер устойчив к неподдерживаемым параметрам - они просто игнорируются
- Проверьте логи для предупреждений о неподдерживаемых параметрах
- Удалите неподдерживаемые параметры из конфигурации если они вызывают проблемы

## Примеры использования

Полные рабочие примеры см. в:
- [examples/openai-compatible-config.yaml](../examples/openai-compatible-config.yaml) - различные конфигурации
- [tests/adapters/openai-compatible-adapter.integration.test.ts](../tests/adapters/openai-compatible-adapter.integration.test.ts) - интеграционные тесты

## Поддержка

Если у вас возникли вопросы или проблемы:

1. Проверьте примеры в [examples/openai-compatible-config.yaml](../examples/openai-compatible-config.yaml)
2. Изучите документацию вашего OpenAI-совместимого сервиса
3. Создайте issue в репозитории проекта с описанием проблемы

## См. также

- [Создание пользовательских адаптеров](CUSTOM_ADAPTERS.md)
- [Руководство по началу работы](GETTING_STARTED.md)
- [Примеры конфигураций CLI-адаптеров](../examples/cli-adapters-config.yaml)
