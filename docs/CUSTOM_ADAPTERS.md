# Создание пользовательских адаптеров

Этот документ описывает, как создавать пользовательские адаптеры для интеграции новых AI-моделей и CLI-утилит с Workflow Orchestrator.

## Обзор

Система плагинов позволяет расширять функциональность оркестратора без изменения основного кода. Вы можете создать адаптер для любой CLI-утилиты, которая взаимодействует с AI-моделями.

## Встроенные адаптеры

Workflow Orchestrator включает несколько встроенных адаптеров:

### CLI-адаптеры (наследуются от BaseCLIAdapter)
- **claude-cli-adapter** - для Claude через `claude-cli`
- **codex-cli-adapter** - для OpenAI через официальную утилиту `codex` (Codex CLI, апрель 2025)
- **openai-cli-adapter** - для OpenAI через старую Python-based утилиту `openai`
- **gemini-cli-adapter** - для Gemini через `gemini-cli`

### HTTP API адаптеры (реализуют CLIAdapter напрямую)
- **openai-compatible-adapter** - для OpenAI-совместимых HTTP API
  - Поддерживает: LM Studio, LocalAI, Ollama, Text Generation WebUI, OpenAI API
  - Работает напрямую с HTTP API без внешних CLI-утилит
  - См. подробную документацию: [docs/OPENAI_COMPATIBLE_ADAPTER.md](OPENAI_COMPATIBLE_ADAPTER.md)

## Выбор подхода

При создании нового адаптера выберите один из подходов:

### 1. Наследование от BaseCLIAdapter (рекомендуется для CLI-утилит)

**Используйте когда:**
- Вы интегрируете внешнюю CLI-утилиту
- Утилита запускается через `child_process`
- Нужна базовая функциональность (выполнение команд, обработка ошибок)

**Пример:** claude-cli-adapter, openai-cli-adapter

### 2. Прямая реализация CLIAdapter (для HTTP API)

**Используйте когда:**
- Вы работаете напрямую с HTTP API
- Не нужно запускать внешние процессы
- Требуется полный контроль над HTTP запросами

**Пример:** openai-compatible-adapter

## Структура плагина

Плагин адаптера состоит из:

1. **Метаданные** - информация о плагине (имя, версия, совместимость)
2. **Фабрика адаптера** - функция для создания экземпляра адаптера
3. **Опциональные хуки** - initialize, cleanup, validateConfig

### Минимальный пример

```javascript
import { BaseCLIAdapter } from '../src/adapters/base-cli-adapter.js';

class MyAdapter extends BaseCLIAdapter {
  name = 'my-adapter';
  version = '1.0.0';
}

export default {
  metadata: {
    name: 'my-adapter',
    version: '1.0.0',
    minOrchestratorVersion: '1.0.0'
  },
  createAdapter: (config) => new MyAdapter(config)
};
```

## Метаданные плагина

### Обязательные поля

- `name` (string) - Уникальное имя плагина
- `version` (string) - Версия плагина в формате semver
- `minOrchestratorVersion` (string) - Минимальная версия оркестратора

### Опциональные поля

- `description` (string) - Описание плагина
- `author` (string) - Автор плагина
- `maxOrchestratorVersion` (string) - Максимальная версия оркестратора
- `dependencies` (object) - Зависимости от других плагинов
- `tags` (string[]) - Теги для категоризации

### Пример полных метаданных

```javascript
metadata: {
  name: 'my-custom-adapter',
  version: '2.1.0',
  description: 'Адаптер для интеграции с MyAI CLI',
  author: 'John Doe <john@example.com>',
  minOrchestratorVersion: '1.0.0',
  maxOrchestratorVersion: '2.0.0',
  dependencies: {
    'another-plugin': '^1.0.0'
  },
  tags: ['ai', 'custom', 'myai']
}
```

## Создание адаптера

### Наследование от BaseCLIAdapter

Рекомендуется наследоваться от `BaseCLIAdapter`, который предоставляет базовую функциональность:

```javascript
import { BaseCLIAdapter } from '../src/adapters/base-cli-adapter.js';

class MyAdapter extends BaseCLIAdapter {
  name = 'my-adapter';
  version = '1.0.0';
  
  // Переопределите методы по необходимости
  parseResponse(rawOutput) {
    // Ваша логика парсинга
    return rawOutput.trim();
  }
}
```

### Методы для переопределения

#### parseResponse(rawOutput: string): string

Парсинг ответа от CLI-утилиты.

```javascript
parseResponse(rawOutput) {
  try {
    const json = JSON.parse(rawOutput);
    return json.content || json.response;
  } catch {
    return rawOutput.trim();
  }
}
```

#### prepareArguments(request: AdapterRequest): string[]

Подготовка аргументов команды.

```javascript
prepareArguments(request) {
  const args = super.prepareArguments(request);
  
  // Добавляем специфичные аргументы
  if (request.temperature) {
    args.push('--temp', request.temperature.toString());
  }
  
  return args;
}
```

#### isRetryableError(error: Error): boolean

Определение, можно ли повторить операцию после ошибки.

```javascript
isRetryableError(error) {
  const message = error.message.toLowerCase();
  return message.includes('rate limit') ||
         message.includes('timeout') ||
         super.isRetryableError(error);
}
```

### Методы для работы с permissions и файловым выводом

BaseCLIAdapter предоставляет защищённые методы для поддержки системы разрешений и записи результатов в файлы.

#### mapPermissionsToArgs(permissions?: StepPermissions): string[]

Маппинг разрешений шага на флаги CLI. Каждый адаптер должен реализовать свой маппинг.

```javascript
protected mapPermissionsToArgs(permissions) {
  const args = [];

  if (!permissions) {
    // Безопасный режим по умолчанию
    args.push('--safe-mode');
    return args;
  }

  // Валидация permissions
  this.validatePermissions(permissions);

  if (permissions.fullAccess) {
    args.push('--full-access');
    return args;
  }

  if (permissions.write?.length) {
    args.push('--allow-write');
  }

  if (permissions.execute) {
    args.push('--allow-execute');
  }

  return args;
}
```

#### appendFileWriteInstruction(prompt, outputPath, toolName?): string

Добавляет инструкцию записи в файл в конец промпта.

```javascript
// Используйте для добавления инструкции записи результата в файл
const enhancedPrompt = this.appendFileWriteInstruction(
  request.prompt,
  request.outputFile,
  'write_file'  // Имя инструмента для вашей CLI-утилиты
);
```

#### readResultFromFile(outputPath, stdout, options?): Promise<{content, source}>

Чтение результата из файла с polling и fallback на stdout.

```javascript
// После выполнения команды пытаемся прочитать результат из файла
const result = await this.readResultFromFile(
  request.outputFile,
  commandResult.stdout,
  {
    maxWaitTime: 5000,   // Максимальное время ожидания (мс)
    pollInterval: 200    // Интервал проверки (мс)
  }
);

// result.content - содержимое
// result.source - 'file' или 'stdout'
```

#### validatePermissions(permissions: StepPermissions): void

Валидация разрешений. Выбрасывает ошибку при некорректной конфигурации.

```javascript
// Проверяет:
// - fullAccess нельзя комбинировать с read/write
// - Паттерны не содержат path traversal (..)
this.validatePermissions(permissions);
```

## Хуки жизненного цикла

### initialize()

Вызывается при загрузке плагина. Используйте для инициализации ресурсов.

```javascript
initialize: async () => {
  console.log('Инициализация плагина...');
  
  // Проверка доступности CLI-утилиты
  const { exec } = require('child_process');
  await new Promise((resolve, reject) => {
    exec('myai-cli --version', (error) => {
      if (error) {
        reject(new Error('CLI-утилита myai-cli не найдена'));
      } else {
        resolve();
      }
    });
  });
}
```

### cleanup()

Вызывается при выгрузке плагина. Используйте для освобождения ресурсов.

```javascript
cleanup: async () => {
  console.log('Очистка ресурсов...');
  // Закрытие соединений, удаление временных файлов и т.д.
}
```

### validateConfig(config: AdapterConfig)

Валидация конфигурации адаптера.

```javascript
validateConfig: (config) => {
  const errors = [];
  const warnings = [];
  
  if (!config.command) {
    errors.push({
      message: 'Поле command обязательно',
      code: 'MISSING_COMMAND'
    });
  }
  
  if (!config.env?.API_KEY) {
    warnings.push({
      message: 'Рекомендуется указать API_KEY в переменных окружения'
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
```

## Использование плагина

### Загрузка плагина

```javascript
import { PluginManager } from './src/adapters/plugin-manager.js';
import { AdapterRegistry } from './src/adapters/adapter-registry.js';

const registry = new AdapterRegistry();
const pluginManager = new PluginManager(registry);

// Загрузка одного плагина
const plugin = await pluginManager.loadPlugin('./plugins/my-adapter.js');

// Загрузка всех плагинов из директории
const plugins = await pluginManager.loadPluginsFromDirectory('./plugins');
```

### Опции загрузки

```javascript
const options = {
  autoRegister: true,           // Автоматически регистрировать адаптер
  skipCompatibilityCheck: false, // Пропустить проверку совместимости
  overwrite: false,              // Перезаписать существующий плагин
  validateConfig: true           // Валидировать конфигурацию
};

await pluginManager.loadPlugin('./plugins/my-adapter.js', options);
```

### Создание адаптера из плагина

```javascript
const config = {
  name: 'my-adapter',
  command: 'myai-cli',
  args: ['chat', '--model', '${model}', '--prompt', '${prompt}'],
  env: {
    API_KEY: process.env.MY_API_KEY
  }
};

const adapter = pluginManager.createAdapter('my-adapter', config);
```

### Использование в конфигурации рабочего процесса

```yaml
workflow:
  name: "my-workflow"
  
  adapters:
    - name: "my-adapter"
      command: "myai-cli"
      args:
        - "chat"
        - "--model"
        - "${model}"
        - "--prompt"
        - "${prompt}"
      env:
        API_KEY: "${MY_API_KEY}"
  
  steps:
    - id: "step1"
      type: "model"
      adapter: "my-adapter"
      model: "my-model-v1"
      prompt_template: "prompts/step1.txt"
```

## Проверка совместимости

Система автоматически проверяет совместимость плагина с текущей версией оркестратора:

```javascript
const compatibility = pluginManager.checkCompatibility(plugin.metadata);

if (!compatibility.compatible) {
  console.error('Плагин несовместим:', compatibility.reason);
} else if (compatibility.warnings.length > 0) {
  console.warn('Предупреждения:', compatibility.warnings);
}
```

## Лучшие практики

### 1. Используйте semver для версионирования

```javascript
metadata: {
  version: '1.2.3',  // MAJOR.MINOR.PATCH
  minOrchestratorVersion: '1.0.0'
}
```

### 2. Валидируйте конфигурацию

Всегда реализуйте `validateConfig` для проверки обязательных полей.

### 3. Обрабатывайте ошибки

Переопределите `handleError` для специфичной обработки ошибок вашей CLI-утилиты.

### 4. Документируйте зависимости

Указывайте все внешние зависимости в метаданных.

### 5. Тестируйте совместимость

Проверяйте работу плагина с разными версиями оркестратора.

## Примеры

### Адаптер для JSON API (CLI-подход)

```javascript
class JSONAPIAdapter extends BaseCLIAdapter {
  name = 'json-api-adapter';
  version = '1.0.0';
  
  parseResponse(rawOutput) {
    const json = JSON.parse(rawOutput);
    return json.choices[0].message.content;
  }
  
  prepareArguments(request) {
    return [
      'api',
      'chat.completions.create',
      '-m', request.model || 'default',
      '-g', 'user',
      request.prompt
    ];
  }
}

export default {
  metadata: {
    name: 'json-api-adapter',
    version: '1.0.0',
    minOrchestratorVersion: '1.0.0'
  },
  createAdapter: (config) => new JSONAPIAdapter(config)
};
```

### Адаптер для HTTP API (прямая реализация)

```javascript
import { CLIAdapter } from '../core/types.js';

class CustomHTTPAdapter {
  name = 'custom-http-adapter';
  version = '1.0.0';
  
  constructor(config) {
    this.baseUrl = config.baseUrl || 'http://localhost:8000';
    this.apiKey = config.apiKey;
  }
  
  async isAvailable() {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
  
  async execute(request) {
    const response = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        prompt: request.prompt,
        model: request.model,
        temperature: request.temperature
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return {
      content: data.text,
      model: data.model,
      tokensUsed: data.tokens,
      executionTime: data.time
    };
  }
  
  parseResponse(rawOutput) {
    return rawOutput.trim();
  }
  
  handleError(error) {
    return {
      code: 'ADAPTER_ERROR',
      message: error.message,
      retryable: error.message.includes('timeout'),
      originalError: error
    };
  }
}

export default {
  metadata: {
    name: 'custom-http-adapter',
    version: '1.0.0',
    minOrchestratorVersion: '1.0.0',
    description: 'HTTP API адаптер для пользовательского сервиса'
  },
  createAdapter: (config) => new CustomHTTPAdapter(config)
};
```

**Примечание:** Для полного примера HTTP API адаптера см. встроенный `openai-compatible-adapter` в [src/adapters/openai-compatible-adapter.ts](../src/adapters/openai-compatible-adapter.ts)

### Адаптер с аутентификацией

```javascript
class AuthAdapter extends BaseCLIAdapter {
  name = 'auth-adapter';
  version = '1.0.0';
  
  prepareEnvironment(request) {
    const env = super.prepareEnvironment(request);
    
    // Добавляем токен аутентификации
    if (!env.AUTH_TOKEN) {
      throw new Error('AUTH_TOKEN не указан в переменных окружения');
    }
    
    return env;
  }
}

export default {
  metadata: {
    name: 'auth-adapter',
    version: '1.0.0',
    minOrchestratorVersion: '1.0.0'
  },
  createAdapter: (config) => new AuthAdapter(config),
  validateConfig: (config) => {
    const errors = [];
    
    if (!config.env?.AUTH_TOKEN) {
      errors.push({
        message: 'AUTH_TOKEN обязателен',
        code: 'MISSING_AUTH_TOKEN'
      });
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  }
};
```

## Отладка

### Логирование

Используйте console.log для отладки:

```javascript
parseResponse(rawOutput) {
  console.log('Raw output:', rawOutput);
  const parsed = this.parseJSON(rawOutput);
  console.log('Parsed:', parsed);
  return parsed;
}
```

### Проверка загрузки

```javascript
const pluginInfo = pluginManager.getPluginInfo('my-adapter');
console.log('Плагин загружен:', pluginInfo);
console.log('Совместимость:', pluginInfo.compatibility);
```

## Распространение плагинов

### Структура пакета

```
my-adapter-plugin/
├── package.json
├── README.md
├── index.js          # Основной файл плагина
├── examples/
│   └── config.yaml   # Пример конфигурации
└── tests/
    └── adapter.test.js
```

### package.json

```json
{
  "name": "workflow-orchestrator-my-adapter",
  "version": "1.0.0",
  "description": "Custom adapter for MyAI CLI",
  "main": "index.js",
  "type": "module",
  "keywords": ["workflow-orchestrator", "adapter", "plugin"],
  "peerDependencies": {
    "workflow-orchestrator": "^1.0.0"
  }
}
```

## Поддержка

Если у вас возникли вопросы или проблемы:

1. Проверьте примеры в директории `examples/`
2. Изучите встроенные адаптеры в `src/adapters/`
3. Создайте issue в репозитории проекта
