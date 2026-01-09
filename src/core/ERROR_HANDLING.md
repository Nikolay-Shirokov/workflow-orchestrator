# Система обработки ошибок

## Обзор

Централизованная система обработки ошибок для Workflow Orchestrator, предоставляющая:
- Категоризацию ошибок по типам
- Детальные сообщения с контекстом
- Предложения по исправлению
- Опции восстановления после ошибок
- Структурированное логирование

## Категории ошибок

### CONFIG (Ошибки конфигурации)
Ошибки в файлах конфигурации рабочих процессов:
- `CONFIG_INVALID_YAML` - Невалидный YAML синтаксис
- `CONFIG_INVALID_JSON` - Невалидный JSON синтаксис
- `CONFIG_MISSING_FIELD` - Отсутствует обязательное поле
- `CONFIG_CIRCULAR_DEPENDENCY` - Циклические зависимости между шагами
- `CONFIG_INVALID_ADAPTER` - Невалидная конфигурация адаптера

**Восстановление:** Не восстанавливаются, требуют исправления конфигурации.

### EXECUTION (Ошибки выполнения)
Ошибки во время выполнения рабочего процесса:
- `EXEC_ADAPTER_NOT_FOUND` - Адаптер не найден
- `EXEC_ADAPTER_UNAVAILABLE` - Адаптер недоступен
- `EXEC_COMMAND_FAILED` - Команда завершилась с ошибкой
- `EXEC_TIMEOUT` - Превышен таймаут выполнения
- `EXEC_STEP_FAILED` - Шаг завершился с ошибкой

**Восстановление:** Большинство поддерживают повтор или пропуск.

### STATE (Ошибки состояния)
Ошибки при работе с файлами состояния:
- `STATE_FILE_NOT_FOUND` - Файл состояния не найден
- `STATE_INVALID_FORMAT` - Невалидный формат файла
- `STATE_CORRUPTED` - Поврежденное состояние
- `STATE_MISSING_ARTIFACTS` - Отсутствуют артефакты
- `STATE_VALIDATION_FAILED` - Валидация состояния не прошла

**Восстановление:** Поддерживают откат к предыдущему шагу.

### USER_INPUT (Ошибки пользовательского ввода)
Ошибки при обработке ввода пользователя:
- `INPUT_VALIDATION_FAILED` - Валидация не прошла
- `INPUT_PARSE_ERROR` - Ошибка парсинга
- `INPUT_REQUIRED_FIELD` - Отсутствует обязательное поле

**Восстановление:** Всегда поддерживают повтор.

## Использование

### Создание обработчика ошибок

```typescript
import { createErrorHandler, getLogger } from './core';

const logger = getLogger();
const errorHandler = createErrorHandler(logger);
```

### Создание ошибок

```typescript
// Ошибка конфигурации
const configError = errorHandler.createConfigError(
  ErrorCodes.CONFIG_INVALID_YAML,
  'Failed to parse YAML configuration',
  { file: 'workflow.yaml', line: 42 }
);

// Ошибка выполнения
const execError = errorHandler.createExecutionError(
  ErrorCodes.EXEC_TIMEOUT,
  'Command execution timed out',
  { command: 'claude-cli', timeout: 300 },
  true // recoverable
);

// Ошибка состояния
const stateError = errorHandler.createStateError(
  ErrorCodes.STATE_MISSING_ARTIFACTS,
  'Required artifacts not found',
  { sessionId: 'session_123', missingFiles: ['step1.md'] }
);
```

### Логирование ошибок

```typescript
// Логирование с контекстом состояния
errorHandler.logError(error, workflowState);

// Вывод:
// ERROR: {
//   code: 'EXEC_TIMEOUT',
//   category: 'execution',
//   message: 'Command execution timed out',
//   ...
// }
// Suggestions for recovery:
//   1. Увеличьте значение timeout в конфигурации
//   2. Проверьте сетевое соединение
```

### Получение опций восстановления

```typescript
const recoveryOptions = errorHandler.getRecoveryOptions(error);

if (recoveryOptions.canRetry) {
  // Повторить операцию
}

if (recoveryOptions.canSkip) {
  // Пропустить шаг
}

if (recoveryOptions.canRollback) {
  // Откатиться к предыдущему шагу
}

console.log(`Recommended: ${recoveryOptions.recommendedAction}`);
```

### Форматирование сообщений

```typescript
const formatted = errorHandler.formatErrorMessage(error);
console.log(formatted);

// Вывод:
// ❌ ERROR: Command execution timed out
//
// Code: EXEC_TIMEOUT
// Category: execution
//
// Context:
//   command: "claude-cli"
//   timeout: 300
//
// 💡 Suggestions:
//   1. Увеличьте значение timeout в конфигурации
//   2. Проверьте сетевое соединение
//   3. Попробуйте выполнить операцию позже
//
// Recovery options:
//   - Retry the operation
//   - Skip this step
//   Recommended: retry
```

### Валидация состояния

```typescript
const validationErrors: ValidationError[] = [
  {
    message: 'Missing required field: sessionId',
    code: 'MISSING_FIELD',
    line: 1
  },
  {
    message: 'Invalid timestamp format',
    code: 'INVALID_FORMAT',
    line: 5
  }
];

const error = errorHandler.createStateValidationError(
  validationErrors,
  partialState
);

// Ошибка содержит детальную информацию о всех проблемах валидации
```

## Серьезность ошибок

- **FATAL** - Критическая ошибка, выполнение должно быть прервано
- **ERROR** - Ошибка, но возможно восстановление
- **WARNING** - Предупреждение, не блокирует выполнение

## Опции восстановления

Каждая ошибка имеет набор опций восстановления:

```typescript
interface RecoveryOptions {
  canRetry: boolean;        // Можно повторить операцию
  canSkip: boolean;         // Можно пропустить шаг
  canRollback: boolean;     // Можно откатиться назад
  recommendedAction: string; // Рекомендуемое действие
}
```

## Предложения по исправлению

Система автоматически генерирует контекстные предложения для каждого типа ошибки:

- Проверки конфигурации
- Установка зависимостей
- Настройка окружения
- Исправление данных
- Альтернативные подходы

## Тестирование

Система полностью покрыта property-based тестами:

- **Property 5**: Логирование ошибок и варианты восстановления (Требование 1.5)
- **Property 30**: Сообщения об ошибках валидации состояния (Требование 6.5)

Запуск тестов:
```bash
npm test -- error-handler.property.test.ts
```

## Интеграция

Система обработки ошибок интегрируется со всеми компонентами:

- **WorkflowEngine** - обработка ошибок выполнения
- **StateManager** - валидация и восстановление состояния
- **ConfigParser** - валидация конфигурации
- **StepExecutor** - обработка ошибок шагов
- **CLI** - отображение ошибок пользователю
