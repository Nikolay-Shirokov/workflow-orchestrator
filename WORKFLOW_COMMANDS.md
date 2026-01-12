# Команды для работы с Workflow Orchestrator

## Проблема с кириллицей в codex-cli

**Решение**: Адаптер `codex-cli` теперь передает промпт через stdin (используя `-` как аргумент), что решает проблему с кириллицей в Windows.

**Изменения в `src/adapters/codex-cli-adapter.ts`**:
- Добавлен импорт `spawn` из `child_process`
- Метод `prepareArguments()` добавляет `-` в конец аргументов для чтения из stdin
- Метод `execute()` передает промпт напрямую через stdin (без временных файлов)
- Добавлен приватный метод `executeCommandWithStdin()` для передачи данных через stdin

**Важно**: Модель `gpt-4o` не поддерживается с ChatGPT аккаунтом в Codex. Используйте `o1-mini` или другие доступные модели.

## Валидация конфигурации (dry-run)

```powershell
node dist/cli/cli.js dry-run examples/dual-design-workflow.yaml
```

Проверяет корректность конфигурации без выполнения.

## Запуск workflow

```powershell
node dist/cli/cli.js run examples/dual-design-workflow.yaml -f test-context.json
```

Запускает процесс с контекстом из файла `test-context.json`.

## Структура test-context.json

```json
{
  "user_request": "Создать систему управления задачами с REST API",
  "web_research": ""
}
```

## Проверка доступности адаптеров

```powershell
# Проверка codex-cli
codex --version

# Проверка claude-cli  
claude --version

# Проверка openai-cli
openai --version
```

## Отладка

### Просмотр логов с подробностями

```powershell
node dist/cli/cli.js run examples/dual-design-workflow.yaml -f test-context.json --verbose
```

### Проверка состояния выполнения

```powershell
node dist/cli/cli.js status <session-id>
```

### Возобновление прерванного процесса

```powershell
node dist/cli/cli.js resume <session-id> examples/dual-design-workflow.yaml
```

## Артефакты

Результаты выполнения сохраняются в:
```
artifacts/session_<timestamp>/
  step1_user_request.md
  step2_architect_questions.md
  step3_copilot_questions.md
  step4_architect_analysis.md
  step5_copilot_analysis.md
  step6_architect_final_questions.md
  step7_copilot_final_questions.md
  step8_final_questions.md
  step9_user_answers.md
  step10_final_requirements.md
```

## Состояние процесса

Файлы состояния сохраняются в:
```
state/session_<session-id>.json
```

## Типичные проблемы и решения

### 1. Ошибка "codex: command not found"
**Решение**: Установите codex-cli:
```powershell
npm install -g @openai/codex-cli
```

### 2. Ошибка "The 'gpt-4o' model is not supported"
**Решение**: Измените модель в `examples/dual-design-workflow.yaml` на `o1-mini` или другую поддерживаемую модель.

### 3. Ошибка с кириллицей "unexpected argument"
**Решение**: Убедитесь, что используете обновленную версию адаптера, которая передает промпт через stdin.

### 4. MCP-инструмент web_search недоступен
**Решение**: Это нормально. Шаг step1_5 будет пропущен автоматически, если MCP-инструмент недоступен.

### 5. Ошибка "require is not defined"
**Решение**: Убедитесь, что используете `import` вместо `require` в ES модулях. Пересоберите проект: `npm run build`

## Сборка проекта

```powershell
npm run build
```

Компилирует TypeScript в JavaScript в папку `dist/`.

## Тестирование адаптера

```powershell
# Простой тест codex-cli через stdin
echo "Привет, как дела?" | codex exec -m o1-mini -
```

Если команда работает, адаптер должен работать корректно.
