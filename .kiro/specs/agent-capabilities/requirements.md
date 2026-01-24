# Requirements Document: Система capabilities для CLI-адаптеров

## Introduction

Система workflow-оркестратора использует CLI-адаптеры для взаимодействия с различными LLM моделями. Текущая система разрешений (`StepPermissions`) контролирует только доступ к файловой системе (read/write) и выполнение команд (execute). Однако современные CLI-утилиты предоставляют дополнительные возможности: веб-поиск, MCP-инструменты, интеграцию с браузером и другие.

Необходимо расширить систему разрешений для поддержки этих capabilities, при этом:
- MCP-серверы должны быть настроены на уровне CLI-утилиты (проект/глобально)
- Система workflow должна давать разрешение на использование этих возможностей
- Текущий MCPManager должен быть переработан или заменён

## Glossary

- **Capability**: Дополнительная возможность модели, выходящая за рамки базовых файловых операций
- **MCP (Model Context Protocol)**: Протокол для расширения возможностей моделей через внешние инструменты
- **MCP Server**: Сервер, предоставляющий инструменты по протоколу MCP
- **Web Search**: Возможность модели искать информацию в интернете
- **Browser Integration**: Возможность модели взаимодействовать с браузером
- **Codebase Exploration**: Возможность модели исследовать кодовую базу (Read, Glob, Grep)
- **StepPermissions**: Текущая система разрешений для шагов workflow
- **StepCapabilities**: Расширение системы для управления дополнительными возможностями

## Анализ возможностей CLI-утилит

### Обнаруженные capabilities

| Capability | Claude CLI | Codex CLI | Gemini CLI |
|------------|------------|-----------|------------|
| **Web Search** | - | `--search` | `google_web_search` (инструмент) |
| **MCP Tools** | `--mcp-config`, `--tools`, `--allowedTools` | `codex mcp` (настройка) | - |
| **Browser** | `--chrome` | - | - |
| **Codebase Read** | `Read`, `Glob`, `Grep` (по умолчанию) | По умолчанию | По умолчанию |

### Ключевые наблюдения

1. **MCP-серверы настраиваются отдельно**: Через файлы конфигурации или CLI-команды
2. **Workflow даёт разрешение**: А не конфигурирует подключение
3. **Capabilities зависят от CLI**: Не все возможности доступны во всех утилитах

## Requirements

### Requirement 1: Расширение StepPermissions полем capabilities

**User Story:** Как разработчик workflow, я хочу указывать какие дополнительные возможности доступны модели на шаге, чтобы контролировать её поведение.

#### Acceptance Criteria

1. WHEN в конфигурации шага указан `permissions.capabilities`, THE System SHALL передать эти capabilities в адаптер
2. WHEN capabilities содержит `web_search: true`, THE Adapter SHALL включить соответствующие флаги CLI для веб-поиска
3. WHEN capabilities содержит `mcp_tools: true`, THE Adapter SHALL разрешить использование всех настроенных MCP-инструментов
4. WHEN capabilities содержит `mcp_tools: ["tool1", "tool2"]`, THE Adapter SHALL разрешить только указанные MCP-инструменты
5. WHEN capabilities содержит `browser: true`, THE Adapter SHALL включить интеграцию с браузером (если поддерживается)
6. IF capabilities не указан, THEN THE Adapter SHALL использовать только базовые возможности чтения

### Requirement 2: Поддержка веб-поиска

**User Story:** Как пользователь, я хочу разрешить модели искать информацию в интернете, чтобы она могла отвечать на вопросы требующие актуальных данных.

#### Acceptance Criteria

1. WHEN `capabilities.web_search: true` в Codex, THE Adapter SHALL добавить флаг `--search`
2. WHEN `capabilities.web_search: true` в Gemini, THE Adapter SHALL разрешить инструмент `google_web_search`
3. WHEN `capabilities.web_search: true` в Claude, THE Adapter SHALL логировать предупреждение о неподдерживаемой возможности
4. IF CLI-утилита не поддерживает веб-поиск, THEN THE Adapter SHALL продолжить выполнение без ошибки
5. WHEN веб-поиск разрешен, THE Adapter SHALL логировать это для аудита

### Requirement 3: Поддержка MCP-инструментов

**User Story:** Как пользователь, я хочу давать модели доступ к настроенным MCP-инструментам, чтобы расширить её возможности без конфигурирования MCP в workflow.

#### Acceptance Criteria

1. WHEN MCP-серверы настроены на уровне CLI-утилиты, THE System SHALL НЕ требовать их конфигурации в workflow
2. WHEN `capabilities.mcp_tools: true` в Claude, THE Adapter SHALL НЕ ограничивать доступ к MCP-инструментам через `--tools`
3. WHEN `capabilities.mcp_tools: ["tool1"]` в Claude, THE Adapter SHALL добавить инструменты в `--allowedTools`
4. WHEN MCP-инструменты разрешены, THE Adapter SHALL логировать какие инструменты были использованы (из response)
5. IF CLI-утилита не поддерживает MCP, THEN THE Adapter SHALL игнорировать эту capability

### Requirement 4: Поддержка интеграции с браузером

**User Story:** Как пользователь, я хочу разрешить модели взаимодействовать с браузером, чтобы она могла автоматизировать веб-интерфейсы.

#### Acceptance Criteria

1. WHEN `capabilities.browser: true` в Claude, THE Adapter SHALL добавить флаг `--chrome`
2. WHEN `capabilities.browser: true` в других CLI, THE Adapter SHALL логировать предупреждение о неподдерживаемой возможности
3. WHEN browser требует явного разрешения, THE Adapter SHALL не включать его без `capabilities.browser: true`
4. WHEN browser интеграция включена, THE Adapter SHALL логировать это для аудита

### Requirement 5: Маппинг capabilities на флаги CLI

**User Story:** Как разработчик системы, я хочу иметь чёткое соответствие между capabilities и флагами CLI, чтобы обеспечить корректное поведение.

#### Acceptance Criteria

1. THE System SHALL определить маппинг capabilities -> флаги для каждого адаптера:

   **Claude CLI:**
   | Capability | Флаги |
   |------------|-------|
   | `web_search` | Не поддерживается |
   | `mcp_tools: true` | Не ограничивать `--tools` по MCP |
   | `mcp_tools: [...]` | `--allowedTools <tools>` |
   | `browser` | `--chrome` |

   **Codex CLI:**
   | Capability | Флаги |
   |------------|-------|
   | `web_search` | `--search` |
   | `mcp_tools` | MCP настраивается через `codex mcp`, capability игнорируется |
   | `browser` | Не поддерживается |

   **Gemini CLI:**
   | Capability | Флаги |
   |------------|-------|
   | `web_search` | `--allowed-tools google_web_search` |
   | `mcp_tools` | Не поддерживается |
   | `browser` | Не поддерживается |

2. WHEN capability не поддерживается CLI, THE Adapter SHALL логировать предупреждение и продолжить
3. WHEN capability требует `--yolo` или аналог, THE Adapter SHALL использовать его только при наличии других permissions

### Requirement 6: Удаление/рефакторинг MCPManager

**User Story:** Как разработчик системы, я хочу убрать заглушку MCPManager, чтобы не вводить пользователей в заблуждение.

#### Acceptance Criteria

1. THE System SHALL удалить или переработать текущий `MCPManager` который только проверяет `which` команды
2. IF MCPManager сохраняется, THE System SHALL изменить его назначение на проверку доступности capabilities
3. THE System SHALL НЕ добавлять информацию о "MCP-инструментах" в промпт (текущее поведение)
4. THE System SHALL обновить документацию чтобы объяснить что MCP настраивается вне workflow

### Requirement 7: Обратная совместимость

**User Story:** Как пользователь существующих workflow, я хочу чтобы изменения не нарушили работу моих конфигураций.

#### Acceptance Criteria

1. WHEN workflow не указывает capabilities, THE System SHALL работать как раньше
2. WHEN workflow использует старый формат permissions, THE System SHALL обработать его корректно
3. IF mcp_tools секция существует в settings, THE System SHALL логировать предупреждение о deprecated формате
4. THE System SHALL предоставить миграционное руководство

### Requirement 8: Безопасность capabilities

**User Story:** Как администратор системы, я хочу контролировать какие capabilities доступны, чтобы предотвратить нежелательные действия.

#### Acceptance Criteria

1. WHEN capabilities не указаны явно, THE System SHALL НЕ включать дополнительные возможности
2. WHEN web_search включен, THE Model SHALL иметь возможность делать внешние запросы (учитывать риски)
3. WHEN browser включен, THE Model SHALL иметь возможность управлять браузером (учитывать риски)
4. THE System SHALL логировать все использованные capabilities для аудита
5. THE System SHALL позволять запретить capabilities на уровне роли

### Requirement 9: Конфигурация capabilities на уровне роли

**User Story:** Как разработчик workflow, я хочу задавать capabilities на уровне роли, чтобы не дублировать конфигурацию в каждом шаге.

#### Acceptance Criteria

1. WHEN роль содержит `default_capabilities`, THE System SHALL применять их ко всем шагам этой роли
2. WHEN шаг переопределяет capabilities, THE System SHALL использовать capabilities шага
3. WHEN capabilities на уровне шага частичные, THE System SHALL merge с default_capabilities роли
4. THE System SHALL документировать приоритет: шаг > роль > адаптер по умолчанию

## Non-Functional Requirements

### NFR 1: Производительность

1. Проверка capabilities НЕ должна добавлять значительную задержку при запуске шага
2. Логирование capabilities не должно влиять на производительность выполнения

### NFR 2: Расширяемость

1. Система должна позволять добавление новых capabilities без изменения интерфейсов
2. Каждый адаптер должен иметь возможность объявить поддерживаемые capabilities

### NFR 3: Документация

1. Все capabilities должны быть документированы с примерами использования
2. Должно быть чёткое указание какие capabilities поддерживаются каким адаптером
3. Миграционное руководство должно описывать переход от MCPManager

### NFR 4: Тестируемость

1. Каждая capability должна иметь unit-тесты для маппинга на флаги CLI
2. Property-based тесты должны проверять что capabilities не нарушают безопасность
3. Integration тесты должны проверять работу с реальными CLI (где возможно)
