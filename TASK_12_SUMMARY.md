# Задача 12: Исправление передачи многострочных промптов в Gemini CLI

## Проблема

При выполнении workflow файл `questions.md` содержал ответ "Okay, I'm ready. Please provide your first command..." вместо реальных вопросов. Это означало, что Gemini CLI не получал промпт с описанием потребности пользователя.

### Причина

Многострочные промпты не работают при передаче через аргументы командной строки в Windows с использованием `spawn()`. Тесты показали:

- ❌ **Через args**: `spawn('gemini', [multilinePrompt])` → "Я готов принять ваш запрос."
- ✅ **Через stdin**: `child.stdin.write(multilinePrompt)` → Корректный ответ с вопросами

## Решение

Реализована поддержка передачи промптов через stdin в CLI-адаптерах:

### 1. Добавлено поле `useStdin` в `AdapterConfig`

```typescript
// src/core/types.ts
export interface AdapterConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  parser?: string;
  timeout?: number;
  useStdin?: boolean; // ← Новое поле
}
```

### 2. Модифицирован `BaseCLIAdapter.executeCommand()`

```typescript
// src/adapters/base-cli-adapter.ts
protected executeCommand(
  command: string,
  args: string[],
  env: Record<string, string>,
  timeout: number,
  stdinData?: string // ← Новый параметр
): Promise<CommandResult> {
  // ...
  const child = spawn(command, args, { env, shell: true });
  
  // Если нужно передать данные через stdin
  if (stdinData && child.stdin) {
    child.stdin.write(stdinData);
    child.stdin.end();
  }
  // ...
}
```

### 3. Обновлен `GeminiCLIAdapter`

```typescript
// src/adapters/gemini-cli-adapter.ts
constructor(config?: Partial<AdapterConfig>) {
  const defaultConfig: AdapterConfig = {
    name: 'gemini-cli',
    command: 'gemini',
    args: [], // ← Промпт больше не в args
    useStdin: true, // ← Используем stdin
    // ...
  };
  super(mergedConfig);
}

protected prepareArguments(request: AdapterRequest): string[] {
  const args: string[] = [];
  
  // Добавляем только флаг --model
  if (request.model) {
    args.push('--model', request.model);
  }
  
  // Промпт НЕ добавляем - он передается через stdin
  return args;
}
```

### 4. Обновлен `BaseCLIAdapter.execute()`

```typescript
// src/adapters/base-cli-adapter.ts
async execute(request: AdapterRequest): Promise<AdapterResponse> {
  // ...
  const result = await this.executeCommand(
    this.config.command,
    args,
    env,
    timeout,
    this.config.useStdin ? request.prompt : undefined // ← Передаем промпт через stdin
  );
  // ...
}
```

## Результат

✅ **Многострочные промпты корректно передаются в Gemini CLI**

Пример работы:

```bash
# Промпт
Ты - бизнес-аналитик. Пользователь описал свою потребность:

---
Давай спроектируем решение которое позволит делать снимок области экрана, 
распознавать текст в нем.
---

Твоя задача: задать 3 ключевых вопроса для уточнения требований.

# Ответ Gemini (через stdin)
- Для какой основной задачи пользователи будут использовать распознанный текст?
- Что должно происходить с текстом после распознавания?
- На каких операционных системах должно работать решение?
...
```

## Тестирование

Создан тест `test-gemini-prompt.js` для проверки работы:

```bash
node test-gemini-prompt.js
# ✅ УСПЕХ: Gemini получил промпт и сгенерировал ответ!
```

Полный workflow работает корректно:

```bash
node dist/cli/cli.js run examples/business-requirements-simple.yaml
# Шаг questions успешно генерирует вопросы на основе user_need
```

## Файлы

- `src/core/types.ts` - добавлено поле `useStdin` в `AdapterConfig`
- `src/adapters/base-cli-adapter.ts` - добавлена поддержка stdin в `executeCommand()`
- `src/adapters/gemini-cli-adapter.ts` - включен режим stdin, убран промпт из args
- `test-gemini-prompt.js` - тест для проверки работы stdin

## Коммит

```
fix: использование stdin для передачи многострочных промптов в Gemini CLI
Commit: 04cc3bc
```
