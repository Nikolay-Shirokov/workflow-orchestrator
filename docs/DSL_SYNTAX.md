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

#### Артефакты с тегами (обрамление контекста)

Для четкого разграничения вложенного контекста можно обрамлять содержимое артефактов в XML-подобные теги:

```
${artifact:${path_variable}:tag_name}
```

Это особенно полезно при передаче больших объемов данных в AI-модели, так как теги помогают модели четко различать границы разных частей промпта.

**Примеры:**

```
// Без тегов (простая вставка)
"Проанализируйте следующие данные:\n${artifact:${research_file}}"

// С тегами (четкие границы)
"Проанализируйте следующие данные:\n${artifact:${research_file}:research_data}"

// Результат с тегами:
// <research_data>
// [содержимое файла]
// </research_data>
```

**Когда использовать теги:**
- При вложении больших объемов данных (> 1000 символов)
- При передаче нескольких артефактов в одном промпте
- Когда нужно четко разграничить разные части контекста
- При работе со структурированными данными (JSON, YAML, код)

**Рекомендации:**
- Используйте осмысленные имена тегов (questions, analysis, code)
- Имена тегов должны содержать только буквы, цифры, дефисы и подчеркивания
- Специальные символы автоматически заменяются на подчеркивания

#### Прямое содержимое vs загрузка из файла

Система поддерживает два способа доступа к артефактам:

**Вариант 1: Прямое содержимое (рекомендуется)**
```
${output_name}
```
- Быстрее (нет операций чтения файла)
- Проще синтаксис
- Содержимое уже в памяти

**Вариант 2: Загрузка из файла**
```
${artifact:${output_name_file}}
```
- Гарантирует актуальность данных
- Полезно, если файл может быть изменен внешним процессом
- Использует кэширование (5 минут)

**Вариант 3: Загрузка из файла с тегами**
```
${artifact:${output_name_file}:tag_name}
```
- Комбинирует загрузку из файла с обрамлением в теги
- Лучший выбор для больших вложенных данных

**Пример использования в промпте:**

```
step analysis {
  type model
  role architect
  prompt """
    Проанализируйте следующую информацию:
    
    ## Запрос пользователя
    ${user_request}
    
    ## Результаты исследования
    ${artifact:${research_file}:research}
    
    ## Вопросы от второго пилота
    ${copilot_questions}
    
    Предоставьте детальный анализ с учетом всех данных.
  """
  input user_request, research_file, copilot_questions
  output analysis = "${artifacts_dir}/analysis.md"
}
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

// Загрузка артефакта с тегами
"Результаты исследования:\n${artifact:${research_file}:research_data}"

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

## Дополнительные ресурсы

- [Передача контекста](CONTEXT_PASSING.md) - Три способа передачи данных между шагами
- [Вложенные подстановки](NESTED_SUBSTITUTIONS.md) - Детальное руководство по динамической загрузке
- [Выбор способа передачи данных](DATA_PASSING_GUIDE.md) - Быстрый гид с блок-схемой
- [Примеры с тегами](../examples/prompts/dual-design/examples_with_tags.txt) - Практические примеры обрамления контекста
- [Начало работы](GETTING_STARTED.md) - Базовое руководство по системе
