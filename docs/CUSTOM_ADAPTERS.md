# Создание пользовательских адаптеров

Этот документ описывает, как создавать пользовательские адаптеры для интеграции новых AI-моделей и CLI-утилит с Workflow Orchestrator.

## Обзор

Система плагинов позволяет расширять функциональность оркестратора без изменения основного кода. Вы можете создать адаптер для любой CLI-утилиты, которая взаимодействует с AI-моделями.

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

### Адаптер для JSON API

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
