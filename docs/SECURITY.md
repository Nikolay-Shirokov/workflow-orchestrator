# Безопасность Workflow Orchestrator

Данный документ описывает функции безопасности, реализованные в Workflow Orchestrator.

## Обзор

Модуль безопасности (`src/core/security.ts`) обеспечивает защиту системы от различных угроз безопасности, включая:

- Санитизацию пользовательских входов
- Валидацию путей для предотвращения обхода директорий
- Безопасное управление переменными окружения
- Установку прав доступа к файлам
- Аудит логирование выполнений

## Основные компоненты

### SecurityManager

Центральный класс для управления безопасностью системы.

#### Инициализация

```typescript
import { createSecurityManager } from './src/core/security.js';

const securityManager = createSecurityManager({
  baseDir: process.cwd(),
  allowedDirs: ['/path/to/allowed/dir'],
  maxInputLength: 10000,
  enableAuditLog: true,
  auditLogPath: './audit.log',
  defaultFileMode: 0o644,
  defaultDirMode: 0o755,
});

await securityManager.initialize();
```

## Функции безопасности

### 1. Санитизация пользовательских входов

Система автоматически удаляет опасные символы и паттерны из пользовательских входов:

```typescript
const result = securityManager.sanitizeInput('test; rm -rf /');
// result.sanitized: "test rm -rf "
// result.modified: true
// result.removedPatterns: ["/[;&|`$(){}[\\]<>]/g"]
```

**Удаляемые паттерны:**
- Попытки обхода директорий (`../`, `..\\`)
- Символы инъекций команд (`;`, `&`, `|`, `` ` ``, `$`, `()`, `{}`, `[]`, `<>`)
- Null bytes (`\x00`)
- Управляющие символы (`\x00-\x1F`, `\x7F`)

**Ограничения:**
- Максимальная длина ввода: 10000 символов (настраивается)
- Слишком длинные входы автоматически обрезаются

### 2. Валидация путей

Система предотвращает атаки обхода директорий:

```typescript
const validation = securityManager.validatePath('/path/to/file.txt', 'read');

if (validation.valid) {
  // Путь безопасен
  const normalizedPath = validation.normalizedPath;
} else {
  // Путь небезопасен
  console.error(validation.reason);
  console.error(validation.errorCode);
}
```

**Проверки:**
- Попытки обхода директорий (`..`)
- Соответствие запрещенным паттернам
- Нахождение пути в разрешенных директориях

**Безопасное разрешение путей:**

```typescript
try {
  const safePath = securityManager.resolveSafePath('subdir/file.txt');
  // safePath: '/base/dir/subdir/file.txt'
} catch (error) {
  // Обнаружена попытка обхода директорий
}
```

### 3. Управление переменными окружения

Система контролирует доступ к переменным окружения:

```typescript
// Валидация множественных переменных
const envVars = {
  API_KEY: 'test-key',
  LD_PRELOAD: '/malicious/lib.so', // Будет отфильтрована
};

const validated = securityManager.validateEnvVars(envVars);
// validated: { API_KEY: 'test-key' }
```

**Запрещенные переменные по умолчанию:**
- `LD_PRELOAD`
- `LD_LIBRARY_PATH`
- `DYLD_INSERT_LIBRARIES`
- `DYLD_LIBRARY_PATH`

**Безопасное получение переменной:**

```typescript
const value = securityManager.getEnvVar('API_KEY', 'default-value');
```

**Whitelist и Blacklist:**

```typescript
const securityManager = createSecurityManager({
  baseDir: process.cwd(),
  // Whitelist: разрешены только эти переменные
  allowedEnvVars: ['API_KEY', 'NODE_ENV', 'PORT'],
  // Blacklist: запрещены эти переменные
  forbiddenEnvVars: ['LD_PRELOAD', 'CUSTOM_FORBIDDEN_VAR'],
});
```

### 4. Управление правами доступа

Система автоматически устанавливает безопасные права доступа к файлам:

```typescript
// Установка прав доступа к файлу
await securityManager.setFilePermissions('/path/to/file.txt', 0o600);
// Права: rw------- (только владелец может читать и писать)

// Установка прав доступа к директории
await securityManager.setDirectoryPermissions('/path/to/dir', 0o700);
// Права: rwx------ (только владелец имеет полный доступ)
```

**Права по умолчанию:**
- Файлы: `0o644` (rw-r--r--)
- Директории: `0o755` (rwxr-xr-x)

### 5. Аудит логирование

Все операции безопасности логируются в аудит лог:

```typescript
const securityManager = createSecurityManager({
  baseDir: process.cwd(),
  enableAuditLog: true,
  auditLogPath: './audit.log',
});

await securityManager.initialize();
```

**Типы событий:**
- `file_access` - Доступ к файлам
- `env_access` - Доступ к переменным окружения
- `input_sanitized` - Санитизация входов
- `security_violation` - Нарушения безопасности
- `permission_change` - Изменение прав доступа

**Формат записи:**

```json
{
  "timestamp": "2026-01-10T12:00:00.000Z",
  "eventType": "security_violation",
  "severity": "error",
  "message": "Попытка обхода директорий",
  "context": {
    "filePath": "../../../etc/passwd",
    "normalizedPath": "/etc/passwd",
    "operation": "read"
  },
  "result": "denied"
}
```

### 6. Разрешения на уровне шага (StepPermissions)

Система разрешений позволяет контролировать действия AI-моделей на уровне каждого шага workflow. Это предотвращает ситуации, когда модель выполняет действия за пределами намерений пользователя.

#### Структура StepPermissions

```typescript
interface StepPermissions {
  read?: string[];      // Паттерны файлов для чтения
  write?: string[];     // Паттерны файлов для записи
  execute?: boolean;    // Разрешено ли выполнять shell-команды
  fullAccess?: boolean; // Режим полного доступа (ОПАСНО)
}
```

#### Принципы безопасности

1. **Безопасность по умолчанию**: Без указания permissions используется режим только чтения
2. **Минимальные привилегии**: Запрашивайте только необходимые разрешения
3. **Явное указание опасных режимов**: `fullAccess` требует явного указания
4. **Валидация паттернов**: Path traversal (`..`) запрещён в паттернах

#### Маппинг на CLI-утилиты

Разрешения автоматически преобразуются в безопасные флаги CLI:

| Permissions | Codex CLI | Claude CLI | Gemini CLI |
|-------------|-----------|------------|------------|
| Без permissions | `--sandbox read-only` | Базовые tools | Без `--yolo` |
| `write: [...]` | `--sandbox workspace-write` | `--tools "...,Write"` | `--allowed-tools write_file --yolo` |
| `execute: true` | `--full-auto` | `--tools "...,Bash"` | `--allowed-tools shell --yolo` |
| `fullAccess: true` | Без sandbox | `--dangerously-skip-permissions` | `--yolo` |

#### Важные гарантии

- `--yolo` (Codex) и `--dangerously-skip-permissions` (Claude) **НИКОГДА** не используются без явного `fullAccess: true`
- `Bash` инструмент (Claude) **НЕДОСТУПЕН** без `execute: true`
- `shell` инструмент (Gemini) **НЕДОСТУПЕН** без `execute: true`

#### Пример в workflow

```yaml
steps:
  - id: "analyze"
    type: "model"
    role: "architect"
    permissions:
      read: ["src/**/*.ts", "*.md"]
    # Модель может только читать файлы, не может писать или выполнять команды

  - id: "generate"
    type: "model"
    role: "architect"
    permissions:
      read: ["src/**/*.ts"]
      write: ["docs/*.md"]
    outputs:
      documentation: "docs/API.md"
    # Модель может читать и писать в указанные паттерны
```

## Интеграция с другими компонентами

### StateManager

StateManager использует SecurityManager для валидации путей к файлам состояния:

```typescript
const stateManager = new DefaultStateManager({
  stateDir: './state',
  securityManager: securityManager,
});
```

### ArtifactManager

ArtifactManager использует SecurityManager для валидации путей к артефактам:

```typescript
const artifactManager = new DefaultArtifactManager({
  baseDir: './artifacts',
  securityManager: securityManager,
});
```

### StepExecutor

StepExecutor использует SecurityManager для санитизации пользовательских входов и валидации переменных окружения:

```typescript
const stepExecutor = new DefaultStepExecutor({
  securityManager: securityManager,
});
```

## Рекомендации по безопасности

### 1. Ограничение разрешенных директорий

Всегда указывайте минимальный набор разрешенных директорий:

```typescript
const securityManager = createSecurityManager({
  baseDir: '/app',
  allowedDirs: [
    '/app/data',
    '/app/artifacts',
    '/app/state',
  ],
});
```

### 2. Использование whitelist для переменных окружения

Если возможно, используйте whitelist вместо blacklist:

```typescript
const securityManager = createSecurityManager({
  baseDir: process.cwd(),
  allowedEnvVars: [
    'API_KEY',
    'NODE_ENV',
    'PORT',
    'DATABASE_URL',
  ],
});
```

### 3. Регулярная проверка аудит логов

Настройте автоматический мониторинг аудит логов для обнаружения подозрительной активности:

```bash
# Поиск нарушений безопасности
grep "security_violation" audit.log

# Поиск отклоненных операций
grep "\"result\":\"denied\"" audit.log
```

### 4. Установка строгих прав доступа

Используйте минимально необходимые права доступа:

```typescript
// Для конфиденциальных файлов
await securityManager.setFilePermissions('/path/to/secret.key', 0o600);

// Для временных файлов
await securityManager.setFilePermissions('/path/to/temp.txt', 0o644);

// Для исполняемых файлов
await securityManager.setFilePermissions('/path/to/script.sh', 0o755);
```

### 5. Санитизация всех пользовательских входов

Всегда санитизируйте входы перед использованием:

```typescript
const userInput = getUserInput();
const sanitized = securityManager.sanitizeInput(userInput);

if (sanitized.modified) {
  logger.warn('Пользовательский ввод был изменен', {
    removedPatterns: sanitized.removedPatterns,
  });
}

// Используйте sanitized.sanitized вместо userInput
processInput(sanitized.sanitized);
```

## Обработка ошибок безопасности

Все ошибки безопасности выбрасываются как `WorkflowErrorClass`:

```typescript
try {
  const safePath = securityManager.resolveSafePath('../../../etc/passwd');
} catch (error) {
  if (error instanceof WorkflowErrorClass) {
    console.error('Код ошибки:', error.code);
    console.error('Категория:', error.category);
    console.error('Серьезность:', error.severity);
    console.error('Сообщение:', error.message);
    console.error('Предложения:', error.suggestions);
  }
}
```

## Тестирование безопасности

Для тестирования функций безопасности используйте следующие сценарии:

### 1. Тестирование санитизации

```typescript
// Попытка инъекции команды
const result1 = securityManager.sanitizeInput('test; rm -rf /');
assert(result1.modified === true);
assert(!result1.sanitized.includes(';'));

// Попытка обхода директорий
const result2 = securityManager.sanitizeInput('../../../etc/passwd');
assert(result2.modified === true);
assert(!result2.sanitized.includes('..'));
```

### 2. Тестирование валидации путей

```typescript
// Валидный путь
const valid = securityManager.validatePath('/app/data/file.txt');
assert(valid.valid === true);

// Попытка обхода
const invalid = securityManager.validatePath('/app/../../../etc/passwd');
assert(invalid.valid === false);
assert(invalid.errorCode === 'PATH_TRAVERSAL_ATTEMPT');
```

### 3. Тестирование переменных окружения

```typescript
// Запрещенная переменная
const envVars = { LD_PRELOAD: '/malicious/lib.so' };
const validated = securityManager.validateEnvVars(envVars);
assert(Object.keys(validated).length === 0);
```

## Заключение

Модуль безопасности обеспечивает комплексную защиту Workflow Orchestrator от различных угроз. Следуйте рекомендациям по безопасности и регулярно проверяйте аудит логи для обеспечения безопасности вашей системы.
