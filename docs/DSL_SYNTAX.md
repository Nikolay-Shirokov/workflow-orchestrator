# Документация по DSL синтаксису

## Обзор

Workflow Orchestrator поддерживает упрощенный предметно-ориентированный язык (DSL) для описания рабочих процессов. DSL предоставляет более читаемый и компактный синтаксис по сравнению с YAML/JSON конфигурациями.

## Основная структура

```
workflow <name> v<version> {
  // Настройки процесса
  // Определения ролей
  // Шаги процесса
}
```

## Элементы синтаксиса

### 1. Объявление процесса

```
workflow <имя> v<версия> {
  description "<описание>"
  author "<автор>"
  
  // Настройки
  artifacts_dir "<путь>"
  default_adapter "<адаптер>"
  parallel_execution <true|false>
  max_retries <число>
  timeout <секунды>
  log_level "<уровень>"
}
```

**Пример:**
```
workflow dual-design v1.0 {
  description "Совместная разработка требований"
  author "Team Lead"
  
  artifacts_dir "artifacts/session_${timestamp}"
  default_adapter "claude-cli"
  parallel_execution true
  max_retries 3
  timeout 300
  log_level "info"
}
```

### 2. Определение ролей

```
role <имя> {
  adapter <адаптер>
  model <модель>
  definition """
    <многострочное описание роли>
  """
  instructions """
    <дополнительные инструкции>
  """
  permissions <список>
  temperature <число>
  max_tokens <число>
}
```

**Пример:**
```
role architect {
  adapter claude-cli
  model claude-sonnet-3.5
  definition """
    Вы - АРХИТЕКТОР в совместной разработке требований.
    Фокусируйтесь на технических аспектах и архитектуре.
  """
  instructions """
    - Выполните задачу в одном ответе
    - Будьте конкретны и структурированы
  """
  permissions [read, edit:*.md, mcp]
  temperature 0.7
  max_tokens 4000
}
```

### 3. Определение шагов

#### Базовый шаг

```
step <id> {
  name "<название>"
  type <тип>
  description "<описание>"
  
  // Специфичные для типа поля
  // Входы и выходы
  // Настройки выполнения
}
```

#### Типы шагов

##### Model (вызов AI-модели)

```
step analysis {
  type model
  role architect
  prompt from "<путь к файлу>"
  // или
  prompt """
    <inline промпт>
  """
  input <переменная1>, <переменная2>
  output <имя> = "<путь>"
}
```

**Пример:**
```
step architect_questions {
  type model
  role architect
  prompt from "prompts/architect_questions.txt"
  input user_request, web_research
  output architect_questions = "${artifacts_dir}/step2_questions.md"
}
```

##### Script (выполнение скрипта)

```
step init {
  type script
  shell <bash|python|node>
  script """
    <многострочный скрипт>
  """
  output <имя> = "<путь>"
}
```

**Пример:**
```
step init {
  type script
  script """
    mkdir -p ${artifacts_dir}
    echo "${user_request}" > ${artifacts_dir}/init.txt
  """
  output init_file = "${artifacts_dir}/init.txt"
}
```

##### User Input (ввод пользователя)

```
step user_answers {
  type user_input
  format <text|json|yaml|questions>
  prompt """
    <сообщение пользователю>
  """
  validation [<правила>]
  output <имя> = "<путь>"
}
```

**Пример:**
```
step user_answers {
  type user_input
  format questions
  prompt """
    Пожалуйста, ответьте на следующие вопросы:
    ${artifact:${final_questions}}
  """
  validation [required]
  output user_answers = "${artifacts_dir}/answers.md"
}
```

##### Conditional (условный шаг)

```
step optional_research {
  type model
  condition <выражение>
  role architect
  prompt from "<путь>"
  input <переменные>
  output <имя> = "<путь>"
}
```

**Пример:**
```
step web_research {
  type model
  condition mcp_tools.web_search_available
  role architect
  prompt from "prompts/web_research.txt"
  input user_request
  output research_file = "${artifacts_dir}/research.md"
}
```

##### Parallel (параллельные шаги)

```
parallel <id> {
  step <id1> {
    // определение шага 1
  }
  
  step <id2> {
    // определение шага 2
  }
}
```

**Пример:**
```
parallel questions {
  step architect_questions {
    type model
    role architect
    prompt from "prompts/architect_questions.txt"
    input user_request
    output architect_questions = "${artifacts_dir}/arch_q.md"
  }
  
  step copilot_questions {
    type model
    role copilot
    prompt from "prompts/copilot_questions.txt"
    input user_request
    output copilot_questions = "${artifacts_dir}/copilot_q.md"
  }
}
```

### 4. Зависимости между шагами

```
step final_report {
  depends_on <step1>, <step2>
  // остальные поля
}
```

**Пример:**
```
step final_report {
  depends_on web_research, analysis
  type model
  role architect
  prompt from "prompts/final_report.txt"
  input web_research, analysis
  output final_report = "${artifacts_dir}/report.md"
}
```

### 5. Переменные и подстановка

#### Простые переменные

```
${variable_name}
```

#### Артефакты

```
${artifact:${path_variable}}
```

#### Условные блоки

```
${if:condition:then_text:else_text}
```

**Примеры:**
```
// Простая подстановка
"Запрос: ${user_request}"

// Загрузка артефакта
"Результаты исследования:\n${artifact:${research_file}}"

// Условие
"${if:web_research:Исследование завершено:Исследование пропущено}"
```

### 6. Настройки выполнения

```
step complex_task {
  // основные поля
  
  timeout 600
  retries 5
  continue_on_error true
}
```

## Полный пример

```
workflow dual-design v1.0 {
  description "Совместная разработка требований"
  artifacts_dir "artifacts/session_${timestamp}"
  default_adapter "claude-cli"
  parallel_execution true
  
  role architect {
    adapter claude-cli
    model claude-sonnet-3.5
    definition """
      Вы - АРХИТЕКТОР, фокусирующийся на технических аспектах.
    """
    permissions [read, edit:*.md, mcp]
  }
  
  role copilot {
    adapter openai-cli
    model gpt-4
    definition """
      Вы - ВТОРОЙ ПИЛОТ, фокусирующийся на бизнес-аспектах.
    """
    permissions [read, mcp]
  }
  
  step init {
    type script
    script """
      mkdir -p ${artifacts_dir}
      echo "${user_request}" > ${artifacts_dir}/request.md
    """
    output user_request_file = "${artifacts_dir}/request.md"
  }
  
  step web_research {
    type model
    condition mcp_tools.web_search_available
    role architect
    prompt from "prompts/web_research.txt"
    input user_request
    output research_file = "${artifacts_dir}/research.md"
  }
  
  parallel questions {
    step architect_questions {
      type model
      role architect
      prompt from "prompts/architect_questions.txt"
      input user_request, web_research
      output architect_questions = "${artifacts_dir}/arch_q.md"
    }
    
    step copilot_questions {
      type model
      role copilot
      prompt from "prompts/copilot_questions.txt"
      input user_request, web_research
      output copilot_questions = "${artifacts_dir}/copilot_q.md"
    }
  }
  
  step merge_questions {
    depends_on questions
    type model
    role architect
    prompt from "prompts/merge_questions.txt"
    input architect_questions, copilot_questions
    output final_questions = "${artifacts_dir}/final_q.md"
  }
  
  step user_answers {
    depends_on merge_questions
    type user_input
    format questions
    prompt """
      Ответьте на вопросы:
      ${artifact:${final_questions}}
    """
    validation [required]
    output user_answers = "${artifacts_dir}/answers.md"
  }
  
  step final_document {
    depends_on user_answers
    type model
    role architect
    prompt from "prompts/final_document.txt"
    input user_request, final_questions, user_answers
    output final_document = "${artifacts_dir}/requirements.md"
  }
}
```

## Грамматика (EBNF)

```ebnf
workflow = "workflow" identifier version "{" workflow_body "}" ;

workflow_body = { setting | role_def | step_def | parallel_def } ;

setting = identifier ( string | number | boolean | expression ) ;

role_def = "role" identifier "{" { role_property } "}" ;

role_property = identifier ( string | number | boolean | list | expression ) ;

step_def = "step" identifier "{" { step_property } "}" ;

parallel_def = "parallel" identifier "{" { step_def } "}" ;

step_property = "type" step_type
              | "role" identifier
              | "condition" expression
              | "prompt" ( "from" string | string )
              | "input" identifier_list
              | "output" identifier "=" expression
              | "depends_on" identifier_list
              | "script" string
              | "shell" identifier
              | "format" identifier
              | "validation" list
              | "timeout" number
              | "retries" number
              | "continue_on_error" boolean
              | "description" string
              ;

step_type = "model" | "script" | "user_input" | "conditional" ;

identifier = letter { letter | digit | "_" } ;

version = "v" digit "." digit [ "." digit ] ;

string = "\"" { character } "\""
       | "\"\"\"" { character } "\"\"\"" ;

number = digit { digit } ;

boolean = "true" | "false" ;

expression = "${" identifier { "." identifier } "}" ;

list = "[" [ identifier { "," identifier } ] "]" ;

identifier_list = identifier { "," identifier } ;
```

## Преобразование DSL в YAML

DSL автоматически транслируется во внутреннее представление и может быть экспортирован в YAML/JSON:

```bash
# Парсинг DSL и генерация YAML
workflow-orchestrator parse workflow.dsl --output workflow.yaml

# Валидация DSL
workflow-orchestrator validate workflow.dsl

# Запуск процесса из DSL
workflow-orchestrator run workflow.dsl
```

## Лучшие практики

### 1. Именование

- Используйте snake_case для идентификаторов шагов
- Используйте понятные имена ролей (architect, copilot, reviewer)
- Префиксируйте связанные шаги (step2_architect, step2_copilot)

### 2. Структура

- Группируйте связанные настройки вместе
- Определяйте роли перед шагами
- Упорядочивайте шаги в логическом порядке выполнения

### 3. Комментарии

```
// Однострочный комментарий

/*
  Многострочный
  комментарий
*/
```

### 4. Переиспользование

- Выносите промпты в отдельные файлы
- Используйте переменные для путей
- Создавайте библиотеки ролей

### 5. Читаемость

- Используйте отступы для вложенности
- Разделяйте секции пустыми строками
- Добавляйте описания к сложным шагам

## Ошибки и отладка

### Синтаксические ошибки

```
Error: Unexpected token at line 15, column 3
Expected: '}'
Found: 'step'
```

### Семантические ошибки

```
Error: Undefined role 'reviewer' referenced in step 'code_review'
Available roles: architect, copilot
```

### Циклические зависимости

```
Error: Circular dependency detected:
step1 -> step2 -> step3 -> step1
```

## Миграция с YAML на DSL

Существующие YAML конфигурации можно конвертировать в DSL:

```bash
workflow-orchestrator convert workflow.yaml --to-dsl --output workflow.dsl
```

## Расширения

DSL поддерживает расширения для специфичных случаев:

### Макросы

```
macro common_settings {
  timeout 300
  retries 3
  continue_on_error false
}

step my_step {
  use common_settings
  // остальные поля
}
```

### Импорт

```
import "roles/standard_roles.dsl"
import "steps/common_steps.dsl"

workflow my_workflow v1.0 {
  // использование импортированных определений
}
```

## Инструменты разработки

### Подсветка синтаксиса

Доступны плагины для популярных редакторов:
- VS Code: workflow-orchestrator-dsl
- Sublime Text: WorkflowDSL
- Vim: vim-workflow-dsl

### Линтер

```bash
workflow-orchestrator lint workflow.dsl
```

### Форматтер

```bash
workflow-orchestrator format workflow.dsl --write
```

## Примеры

Больше примеров доступно в директории `examples/dsl/`:
- `simple-workflow.dsl` - простой процесс
- `dual-design.dsl` - процесс dual-design
- `parallel-execution.dsl` - параллельное выполнение
- `conditional-steps.dsl` - условные шаги
- `user-interaction.dsl` - взаимодействие с пользователем

## Справка

Полная справка по командам:

```bash
workflow-orchestrator dsl --help
```

Интерактивная документация:

```bash
workflow-orchestrator dsl docs
```
