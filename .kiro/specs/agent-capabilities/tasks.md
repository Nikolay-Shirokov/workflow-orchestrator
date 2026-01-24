# План реализации: Система capabilities для CLI-адаптеров

## Обзор

План реализации системы capabilities для расширения возможностей CLI-адаптеров. Позволит управлять веб-поиском, MCP-инструментами и интеграцией с браузером.

**Оценка сложности:** Средняя
**Зависимости:** file-output-tool-support (завершён)

---

## Фаза 1: Типы и интерфейсы

### Задача 1.1: Добавить StepCapabilities в types.ts
- [ ] Создать интерфейс `StepCapabilities`
- [ ] Добавить поля: `web_search`, `mcp_tools`, `browser`
- [ ] Добавить JSDoc документацию с описанием маппинга на CLI

**Файл:** `src/core/types.ts`

**Код:**
```typescript
export interface StepCapabilities {
  web_search?: boolean;
  mcp_tools?: boolean | string[];
  browser?: boolean;
}
```

### Задача 1.2: Расширить StepPermissions
- [ ] Добавить поле `capabilities?: StepCapabilities` в `StepPermissions`
- [ ] Обновить JSDoc

**Файл:** `src/core/types.ts`

### Задача 1.3: Расширить RoleConfig
- [ ] Добавить поле `default_capabilities?: StepCapabilities`
- [ ] Обновить JSDoc

**Файл:** `src/core/types.ts`

### Задача 1.4: Добавить CapabilitySupport интерфейс
- [ ] Создать интерфейс `CapabilitySupport`
- [ ] Создать интерфейс `CapabilityAwareAdapter`

**Файл:** `src/core/types.ts`

**Код:**
```typescript
export interface CapabilitySupport {
  supported: boolean;
  flags?: string[];
  note?: string;
}

export interface CapabilityAwareAdapter extends CLIAdapter {
  getCapabilitySupport(): Record<keyof StepCapabilities, CapabilitySupport>;
  mapCapabilitiesToArgs(capabilities: StepCapabilities): string[];
}
```

---

## Фаза 2: Базовый адаптер

### Задача 2.1: Добавить метод mapCapabilitiesToArgs в BaseCLIAdapter
- [ ] Добавить protected метод `mapCapabilitiesToArgs`
- [ ] Базовая реализация возвращает пустой массив
- [ ] Логирование предупреждений для неподдерживаемых capabilities

**Файл:** `src/adapters/base-cli-adapter.ts`

### Задача 2.2: Интегрировать capabilities в prepareArguments
- [ ] Вызывать `mapCapabilitiesToArgs` если capabilities указаны
- [ ] Объединять с результатом `mapPermissionsToArgs`

**Файл:** `src/adapters/base-cli-adapter.ts`

### Задача 2.3: Добавить метод getCapabilitySupport
- [ ] Добавить метод с базовой реализацией (все не поддерживаются)
- [ ] Переопределять в конкретных адаптерах

**Файл:** `src/adapters/base-cli-adapter.ts`

---

## Фаза 3: Claude CLI адаптер

### Задача 3.1: Реализовать getCapabilitySupport для Claude
- [ ] `web_search`: supported: false
- [ ] `mcp_tools`: supported: true
- [ ] `browser`: supported: true, flags: ['--chrome']

**Файл:** `src/adapters/claude-cli-adapter.ts`

### Задача 3.2: Реализовать mapCapabilitiesToArgs для Claude
- [ ] `browser: true` → `--chrome`
- [ ] `mcp_tools: true` → не ограничивать --tools по MCP
- [ ] `mcp_tools: ["tool1"]` → добавить в `--allowedTools`
- [ ] Логировать warning для web_search

**Файл:** `src/adapters/claude-cli-adapter.ts`

### Задача 3.3: Интегрировать с существующим mapPermissionsToArgs
- [ ] Убедиться что capabilities и permissions не конфликтуют
- [ ] `--allowedTools` должен объединять из обоих источников

**Файл:** `src/adapters/claude-cli-adapter.ts`

---

## Фаза 4: Codex CLI адаптер

### Задача 4.1: Реализовать getCapabilitySupport для Codex
- [ ] `web_search`: supported: true, flags: ['--search']
- [ ] `mcp_tools`: supported: false, note: 'Use codex mcp add'
- [ ] `browser`: supported: false

**Файл:** `src/adapters/codex-cli-adapter.ts`

### Задача 4.2: Реализовать mapCapabilitiesToArgs для Codex
- [ ] `web_search: true` → `--search`
- [ ] Логировать warning для mcp_tools и browser

**Файл:** `src/adapters/codex-cli-adapter.ts`

---

## Фаза 5: Gemini CLI адаптер

### Задача 5.1: Реализовать getCapabilitySupport для Gemini
- [ ] `web_search`: supported: true, flags: ['--allowed-tools', 'google_web_search']
- [ ] `mcp_tools`: supported: false
- [ ] `browser`: supported: false

**Файл:** `src/adapters/gemini-cli-adapter.ts`

### Задача 5.2: Рефакторинг mapPermissionsToArgs для объединения tools
- [ ] Собирать все --allowed-tools в один список
- [ ] Источники: permissions.write → write_file, permissions.execute → shell, capabilities.web_search → google_web_search
- [ ] `--yolo` добавлять только если список непустой

**Файл:** `src/adapters/gemini-cli-adapter.ts`

### Задача 5.3: Реализовать mapCapabilitiesToArgs для Gemini
- [ ] `web_search: true` → добавить google_web_search в общий список tools
- [ ] Логировать warning для mcp_tools и browser

**Файл:** `src/adapters/gemini-cli-adapter.ts`

---

## Фаза 6: StepExecutor

### Задача 6.1: Добавить merge capabilities
- [ ] Создать функцию `mergeCapabilities(step, role)`
- [ ] Приоритет: step > role > defaults

**Файл:** `src/core/step-executor.ts` или новый `src/core/capabilities-utils.ts`

### Задача 6.2: Интегрировать в executeModelStep
- [ ] Получать default_capabilities из роли
- [ ] Merge с capabilities шага
- [ ] Передавать в AdapterRequest

**Файл:** `src/core/step-executor.ts`

### Задача 6.3: Добавить validation/warnings
- [ ] Проверять поддержку capabilities адаптером
- [ ] Логировать warnings для неподдерживаемых
- [ ] Не прерывать выполнение при warnings

**Файл:** `src/core/step-executor.ts`

---

## Фаза 7: Удаление MCPManager

### Задача 7.1: Проанализировать использование MCPManager
- [ ] Найти все импорты и использования
- [ ] Определить что нужно сохранить (если есть)

**Файлы:** Поиск по проекту

### Задача 7.2: Удалить MCPManager
- [ ] Удалить `src/core/mcp-manager.ts`
- [ ] Удалить экспорт из index
- [ ] Удалить тесты MCPManager

**Файлы:** `src/core/mcp-manager.ts`, `src/core/index.ts`, тесты

### Задача 7.3: Обновить WorkflowSettings
- [ ] Удалить `mcp_tools` из settings (устаревший формат)
- [ ] Обновить примеры workflow без mcp_tools в settings

**Файл:** `src/core/types.ts`, примеры workflow

### Задача 7.4: Создать CapabilityChecker (опционально)
- [ ] Создать `src/core/capability-checker.ts`
- [ ] Реализовать проверку доступности capabilities
- [ ] Интегрировать с StepExecutor

**Файл:** `src/core/capability-checker.ts`

---

## Фаза 8: Тестирование

### Задача 8.1: Unit-тесты для типов
- [ ] Тесты для StepCapabilities
- [ ] Тесты для mergeCapabilities

**Файл:** `tests/core/capabilities.test.ts`

### Задача 8.2: Property-based тесты для Claude
- [ ] Property: browser → --chrome
- [ ] Property: mcp_tools массив → --allowedTools
- [ ] Property: web_search → warning без флагов

**Файл:** `tests/adapters/claude-capabilities.property.test.ts`

### Задача 8.3: Property-based тесты для Codex
- [ ] Property: web_search → --search
- [ ] Property: mcp_tools → warning
- [ ] Property: browser → warning

**Файл:** `tests/adapters/codex-capabilities.property.test.ts`

### Задача 8.4: Property-based тесты для Gemini
- [ ] Property: web_search → google_web_search в --allowed-tools
- [ ] Property: web_search + write → объединение tools + --yolo
- [ ] Property: mcp_tools → warning

**Файл:** `tests/adapters/gemini-capabilities.property.test.ts`

### Задача 8.5: Integration тесты
- [ ] Тест merge capabilities step + role
- [ ] Тест validation warnings
- [ ] Тест с реальными CLI (если возможно)

**Файл:** `tests/integration/capabilities.test.ts`

---

## Фаза 9: Документация

### Задача 9.1: Обновить README адаптеров
- [ ] Добавить таблицу поддерживаемых capabilities
- [ ] Добавить примеры использования
- [ ] Документировать маппинг на флаги CLI

**Файл:** `src/adapters/README.md`

### Задача 9.2: Обновить FAQ
- [ ] Добавить вопрос о capabilities
- [ ] Добавить вопрос о MCP
- [ ] Обновить примеры конфигурации

**Файл:** `docs/FAQ.md`

### Задача 9.3: Обновить SECURITY.md
- [ ] Добавить раздел о безопасности capabilities
- [ ] Документировать риски web_search и browser
- [ ] Рекомендации по использованию

**Файл:** `docs/SECURITY.md`

### Задача 9.5: Обновить примеры workflow
- [ ] Обновить существующие примеры с capabilities
- [ ] Создать новый пример research-workflow с web_search
- [ ] Создать пример с mcp_tools

**Файлы:** `examples/*.yaml`

---

## Фаза 10: Финализация

### Задача 10.1: Code review checklist
- [ ] Все тесты проходят
- [ ] Нет TypeScript ошибок
- [ ] Документация актуальна
- [ ] Нет breaking changes без документации

### Задача 10.2: Обновить CHANGELOG
- [ ] Добавить запись о capabilities
- [ ] Документировать deprecated MCPManager
- [ ] Указать breaking changes (если есть)

**Файл:** `CHANGELOG.md`

### Задача 10.3: Финальное тестирование
- [ ] Запустить все тесты
- [ ] Проверить примеры workflow
- [ ] Тест с реальными CLI-утилитами

---

## Зависимости между фазами

```
Фаза 1 (Типы)
    ↓
Фаза 2 (Base Adapter) ←──────────────────┐
    ↓                                     │
┌───┴───┬───────────┐                     │
↓       ↓           ↓                     │
Фаза 3  Фаза 4      Фаза 5               │
Claude  Codex       Gemini                │
    ↓       ↓           ↓                 │
    └───────┴───────────┘                 │
            ↓                             │
        Фаза 6 (StepExecutor) ───────────┘
            ↓
        Фаза 7 (MCPManager cleanup)
            ↓
        Фаза 8 (Тестирование)
            ↓
        Фаза 9 (Документация)
            ↓
        Фаза 10 (Финализация)
```

---

## Риски и митигация

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Breaking changes в API | Средняя | Высокое | Deprecation warnings, миграционное руководство |
| CLI-утилиты изменят флаги | Низкая | Среднее | Версионирование адаптеров, тесты с реальными CLI |
| Конфликт capabilities с permissions | Средняя | Среднее | Чёткие правила приоритета, validation |
| MCP-серверы не настроены | Высокая | Низкое | Warnings, документация |

---

## Критерии готовности

- [ ] Все задачи выполнены
- [ ] Все тесты проходят (unit + property + integration)
- [ ] Документация обновлена
- [ ] Примеры работают с реальными CLI
- [ ] Code review пройден
- [ ] CHANGELOG обновлён
