# CLI-адаптеры для Workflow Orchestrator

Этот модуль содержит реализации CLI-адаптеров для различных AI-моделей.

## Обзор

CLI-адаптеры предоставляют унифицированный интерфейс для взаимодействия с различными консольными утилитами AI-моделей. Все адаптеры наследуются от базового класса `BaseCLIAdapter` и реализуют интерфейс `CLIAdapter`.

## Доступные адаптеры

### ClaudeCLIAdapter

Адаптер для взаимодействия с Anthropic Claude через `claude-cli`.

**Требования:**
- Установленная утилита `claude-cli`
- Переменная окружения `ANTHROPIC_API_KEY`

**Пример использования:**
```typescript
import { ClaudeCLIAdapter } from './adapters/claude-cli-adapter.js';

const adapter = new ClaudeCLIAdapter();

// Проверка доступности
const available = await adapter.isAvailable();

// Выполнение запроса
const response = await adapter.execute({
  prompt: 'Привет, как дела?',
  model: 'claude-sonnet-3.5'
});

console.log(response.content);
```

**Конфигурация по умолчанию:**
```typescript
{
  name: 'claude-cli',
  command: 'claude',
  args: ['chat', '--model', '${model}', '--message', '${prompt}'],
  env: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
  parser: 'markdown',
  timeout: 300000 // 5 минут
}
```

**Парсинг ответов:**
- Удаляет префиксы: `Assistant:`, `Claude:`, `Response:`, `Output:`
- Обрабатывает Markdown форматирование
- Удаляет лишние пробелы

### OpenAICLIAdapter

Адаптер для взаимодействия с OpenAI GPT через `openai-cli`.

**Требования:**
- Установленная утилита `openai-cli`
- Переменная окружения `OPENAI_API_KEY`

**Пример использования:**
```typescript
import { OpenAICLIAdapter } from './adapters/openai-cli-adapter.js';

const adapter = new OpenAICLIAdapter();

const response = await adapter.execute({
  prompt: 'Напиши короткое стихотворение',
  model: 'gpt-4'
});

console.log(response.content);
```

**Конфигурация по умолчанию:**
```typescript
{
  name: 'openai-cli',
  command: 'openai',
  args: ['api', 'chat.completions.create', '-m', '${model}', '-g', 'user', '${prompt}'],
  env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
  parser: 'json',
  timeout: 300000 // 5 минут
}
```

**Парсинг ответов:**
- Парсит JSON структуру: `{ choices: [{ message: { content: "..." } }] }`
- Извлекает контент из первого choice
- Обрабатывает невалидный JSON как текст
- Выводит предупреждения при неожиданной структуре

### GeminiCLIAdapter

Адаптер для взаимодействия с Google Gemini через `gemini-cli`.

**Требования:**
- Установленная утилита `gemini-cli`
- Переменная окружения `GOOGLE_API_KEY`

**Пример использования:**
```typescript
import { GeminiCLIAdapter } from './adapters/gemini-cli-adapter.js';

const adapter = new GeminiCLIAdapter();

const response = await adapter.execute({
  prompt: 'Объясни квантовую физику простыми словами',
  model: 'gemini-pro'
});

console.log(response.content);
```

**Конфигурация по умолчанию:**
```typescript
{
  name: 'gemini-cli',
  command: 'gemini',
  args: ['generate', '--model=${model}', '--prompt=${prompt}'],
  env: { GOOGLE_API_KEY: process.env.GOOGLE_API_KEY },
  parser: 'text',
  timeout: 300000 // 5 минут
}
```

**Парсинг ответов:**
- Обрабатывает текстовый формат
- Парсит JSON с полями: `text`, `content`
- Обрабатывает массивы кандидатов
- Удаляет префиксы: `Response:`, `Output:`, `Generated:`, `Gemini:`

## Использование с реестром

Все адаптеры можно регистрировать в `AdapterRegistry` для централизованного управления:

```typescript
import { AdapterRegistry } from './adapters/adapter-registry.js';
import { ClaudeCLIAdapter } from './adapters/claude-cli-adapter.js';
import { OpenAICLIAdapter } from './adapters/openai-cli-adapter.js';
import { GeminiCLIAdapter } from './adapters/gemini-cli-adapter.js';

const registry = new AdapterRegistry();

// Регистрация адаптеров
registry.register(new ClaudeCLIAdapter());
registry.register(new OpenAICLIAdapter());
registry.register(new GeminiCLIAdapter());

// Получение адаптера по имени
const claudeAdapter = registry.get('claude-cli');

// Проверка наличия
if (registry.has('openai-cli')) {
  const openaiAdapter = registry.get('openai-cli');
  // ...
}

// Получение всех адаптеров
const allAdapters = registry.getAll();
console.log(`Зарегистрировано адаптеров: ${allAdapters.length}`);
```

## Пользовательская конфигурация

Все адаптеры поддерживают переопределение конфигурации:

```typescript
const customAdapter = new ClaudeCLIAdapter({
  command: 'custom-claude-path',
  timeout: 60000, // 1 минута
  env: {
    ANTHROPIC_API_KEY: 'custom-key',
    CUSTOM_VAR: 'value'
  },
  args: ['custom', 'args']
});
```

## Создание собственного адаптера

Для создания собственного адаптера наследуйтесь от `BaseCLIAdapter`:

```typescript
import { BaseCLIAdapter } from './base-cli-adapter.js';
import { AdapterConfig } from '../core/types.js';

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

  // Переопределите parseResponse для специфичного парсинга
  parseResponse(rawOutput: string): string {
    // Ваша логика парсинга
    return rawOutput.trim();
  }

  // Опционально: переопределите isAvailable для дополнительных проверок
  async isAvailable(): Promise<boolean> {
    // Проверка API ключа
    if (!this.config.env?.CUSTOM_API_KEY) {
      return false;
    }
    
    // Проверка доступности команды
    return await super.isAvailable();
  }
}
```

## Обработка ошибок

Все адаптеры используют единую систему обработки ошибок:

```typescript
try {
  const response = await adapter.execute({ prompt: 'test' });
} catch (error) {
  const adapterError = error as AdapterError;
  
  console.error(`Код ошибки: ${adapterError.code}`);
  console.error(`Сообщение: ${adapterError.message}`);
  console.error(`Можно повторить: ${adapterError.retryable}`);
  
  if (adapterError.retryable) {
    // Повторить запрос
  }
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
mockAdapter.setResponse(
  /привет/i,
  'Привет! Как я могу помочь?'
);

// Настройка ответа с задержкой
mockAdapter.setResponse(
  'сложный вопрос',
  'Сложный ответ',
  { delay: 1000 }
);

// Симуляция ошибки
mockAdapter.setResponse(
  'ошибка',
  '',
  { shouldError: true, errorMessage: 'Тестовая ошибка' }
);

// Использование
const response = await mockAdapter.execute({
  prompt: 'привет'
});

// Проверка истории
const history = mockAdapter.getRequestHistory();
console.log(`Выполнено запросов: ${history.length}`);
```

## Требования к системе

- Node.js >= 18.0.0
- TypeScript >= 5.0.0
- Установленные CLI-утилиты для соответствующих моделей
- API ключи в переменных окружения

## Переменные окружения

```bash
# Для Claude
export ANTHROPIC_API_KEY="your-key-here"

# Для OpenAI
export OPENAI_API_KEY="your-key-here"

# Для Gemini
export GOOGLE_API_KEY="your-key-here"
```

## Лицензия

MIT
