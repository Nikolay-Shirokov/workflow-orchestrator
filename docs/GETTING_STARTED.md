# Руководство по началу работы

Это краткое руководство поможет вам создать и запустить ваш первый рабочий процесс с Workflow Orchestrator.

## Установка

> **Примечание:** Пакет пока не опубликован на npm. Используйте установку из исходников.

```bash
git clone https://github.com/anthropics/workflow-orchestrator.git
cd workflow-orchestrator
npm install
npm run build
npm link  # Опционально: для глобальной команды workflow-orchestrator
```

Без `npm link` можно запускать напрямую:
```bash
node dist/cli/cli.js run config.yaml
```

## Предварительные требования

1. Установлен Node.js 18+ и npm
2. Установлен хотя бы один CLI-адаптер (например, claude-cli)
3. Настроены API ключи

Если что-то из этого не готово, см. [INSTALLATION.md](INSTALLATION.md)

## Шаг 1: Создание простого процесса

Создайте файл `hello-world.yaml`:

```yaml
workflow:
  name: "hello-world"
  version: "1.0"
  description: "Мой первый рабочий процесс"
  
  settings:
    artifacts_dir: "artifacts/hello-world"
    default_adapter: "claude-cli"
    log_level: "info"
  
  roles:
    assistant:
      adapter: "claude-cli"
      model: "claude-sonnet-3.5"
      role_definition: "Вы - дружелюбный помощник"
  
  steps:
    - id: "greeting"
      name: "Приветствие"
      type: "model"
      role: "assistant"
      prompt_template: |
        Поприветствуйте пользователя и расскажите, что вы можете помочь
        с автоматизацией рабочих процессов.
      outputs:
        greeting: "${artifacts_dir}/greeting.md"
```

## Шаг 2: Валидация конфигурации

Проверьте конфигурацию перед запуском:

```bash
workflow-orchestrator dry-run hello-world.yaml
```

Вы должны увидеть:

```
✓ Конфигурация валидна
✓ Адаптер 'claude-cli' доступен
✓ Все зависимости разрешены
✓ Готово к выполнению

Шаги для выполнения:
1. greeting - Приветствие (model)
```

## Шаг 3: Запуск процесса

Запустите процесс:

```bash
workflow-orchestrator run hello-world.yaml
```

Вы увидите прогресс выполнения:

```
[INFO] Запуск процесса: hello-world v1.0
[INFO] Сессия: session_20260110_120000
[INFO] Артефакты: artifacts/hello-world

[INFO] Шаг 1/1: greeting - Приветствие
[INFO] Роль: assistant (claude-cli, claude-sonnet-3.5)
[INFO] Выполнение...

[INFO] ✓ Шаг завершен за 3.2s
[INFO] Артефакт: artifacts/hello-world/greeting.md

[INFO] ✓ Процесс завершен успешно
[INFO] Время выполнения: 3.5s
```

## Шаг 4: Проверка результатов

Откройте файл с результатом:

```bash
cat artifacts/hello-world/greeting.md
```

Вы увидите приветствие от AI-модели.

## Шаг 5: Добавление переменных

Модифицируйте процесс для использования переменных. Создайте `personalized-greeting.yaml`:

```yaml
workflow:
  name: "personalized-greeting"
  version: "1.0"
  
  settings:
    artifacts_dir: "artifacts/personalized"
  
  roles:
    assistant:
      adapter: "claude-cli"
      model: "claude-sonnet-3.5"
  
  steps:
    - id: "greeting"
      name: "Персонализированное приветствие"
      type: "model"
      role: "assistant"
      prompt_template: |
        Поприветствуйте пользователя по имени: ${user_name}
        Расскажите о возможностях автоматизации для их роли: ${user_role}
      inputs:
        user_name: "${user_name}"
        user_role: "${user_role}"
      outputs:
        greeting: "${artifacts_dir}/greeting.md"
```

Запустите с переменными:

```bash
workflow-orchestrator run personalized-greeting.yaml \
  --var user_name="Алексей" \
  --var user_role="разработчик"
```

## Шаг 6: Создание многошагового процесса

Создайте процесс с несколькими шагами `analysis-workflow.yaml`:

```yaml
workflow:
  name: "analysis-workflow"
  version: "1.0"
  
  settings:
    artifacts_dir: "artifacts/analysis"
  
  roles:
    analyst:
      adapter: "claude-cli"
      model: "claude-sonnet-3.5"
      role_definition: "Вы - аналитик данных"
  
  steps:
    # Шаг 1: Сбор требований
    - id: "requirements"
      name: "Сбор требований"
      type: "model"
      role: "analyst"
      prompt_template: |
        Проанализируйте следующий запрос и выделите ключевые требования:
        ${user_request}
      inputs:
        user_request: "${user_request}"
      outputs:
        requirements: "${artifacts_dir}/requirements.md"
    
    # Шаг 2: Анализ требований
    - id: "analysis"
      name: "Анализ требований"
      type: "model"
      role: "analyst"
      depends_on:
        - "requirements"
      prompt_template: |
        На основе следующих требований, предложите план реализации:
        
        ${requirements}
      inputs:
        requirements: "${requirements}"
      outputs:
        analysis: "${artifacts_dir}/analysis.md"
    
    # Шаг 3: Рекомендации
    - id: "recommendations"
      name: "Рекомендации"
      type: "model"
      role: "analyst"
      depends_on:
        - "analysis"
      prompt_template: |
        На основе анализа, предоставьте конкретные рекомендации:
        
        ${analysis}
      inputs:
        analysis: "${analysis}"
      outputs:
        recommendations: "${artifacts_dir}/recommendations.md"
```

**Обратите внимание**: В шагах 2 и 3 используется прямое содержимое (`${requirements}`, `${analysis}`) вместо загрузки из файла. Это быстрее и проще, так как содержимое уже доступно в контексте после выполнения предыдущих шагов.

Запустите:

```bash
workflow-orchestrator run analysis-workflow.yaml \
  --var user_request="Создать систему управления задачами"
```

## Шаг 6.1: Передача контекста между шагами

Система поддерживает несколько способов передачи данных между шагами:

### Способ 1: Прямое содержимое (рекомендуется)

Когда шаг создает артефакт, его содержимое автоматически доступно в контексте:

```yaml
steps:
  - id: "step1"
    outputs:
      result: "${artifacts_dir}/result.md"
  
  - id: "step2"
    depends_on: ["step1"]
    prompt_template: |
      Используйте результат предыдущего шага:
      ${result}
```

**Преимущества:**
- ⚡ Быстро (нет чтения файла)
- 📝 Простой синтаксис
- 💾 Данные уже в памяти

### Способ 2: Загрузка из файла

Если нужна гарантия актуальности данных или файл может быть изменен:

```yaml
steps:
  - id: "step1"
    outputs:
      result: "${artifacts_dir}/result.md"
  
  - id: "step2"
    depends_on: ["step1"]
    prompt_template: |
      Используйте результат из файла:
      ${artifact:${result_file}}
```

**Когда использовать:**
- 📂 Файл может быть изменен внешним процессом
- ✅ Нужна гарантия актуальности
- 💾 Данные слишком большие для памяти

### Способ 3: С обрамлением в теги

Для четкого разграничения больших объемов данных:

```yaml
steps:
  - id: "step1"
    outputs:
      result: "${artifacts_dir}/result.md"
  
  - id: "step2"
    depends_on: ["step1"]
    prompt_template: |
      Проанализируйте следующие данные:
      
      ${artifact:${result_file}:analysis_data}
      
      Предоставьте рекомендации.
```

**Результат:**
```
Проанализируйте следующие данные:

<analysis_data>
[содержимое файла]
</analysis_data>

Предоставьте рекомендации.
```

**Когда использовать:**
- 📊 Большие объемы данных (> 1000 символов)
- 🔀 Несколько артефактов в одном промпте
- 🏷️ Нужны четкие границы для AI-модели
- 📋 Структурированные данные (JSON, YAML, код)

### Пример с множественными артефактами

```yaml
steps:
  - id: "parallel_analysis"
    type: "parallel"
    steps:
      - id: "technical"
        outputs:
          tech_analysis: "${artifacts_dir}/technical.md"
      
      - id: "business"
        outputs:
          biz_analysis: "${artifacts_dir}/business.md"
  
  - id: "merge"
    depends_on: ["parallel_analysis"]
    prompt_template: |
      Объедините следующие анализы:
      
      ## Технический анализ
      ${artifact:${tech_analysis_file}:technical}
      
      ## Бизнес-анализ
      ${artifact:${biz_analysis_file}:business}
      
      Создайте единый документ.
```

**Подробнее**: См. [примеры с тегами](../examples/prompts/dual-design/examples_with_tags.txt)

## Шаг 7: Использование DSL

Создайте тот же процесс в DSL формате `analysis-workflow.dsl`:

```
workflow analysis-workflow v1.0 {
  artifacts_dir "artifacts/analysis"
  
  role analyst {
    adapter claude-cli
    model claude-sonnet-3.5
    definition "Вы - аналитик данных"
  }
  
  step requirements {
    type model
    role analyst
    prompt """
      Проанализируйте следующий запрос и выделите ключевые требования:
      ${user_request}
    """
    input user_request
    output requirements = "${artifacts_dir}/requirements.md"
  }
  
  step analysis {
    depends_on requirements
    type model
    role analyst
    prompt """
      На основе следующих требований, предложите план реализации:
      
      ${artifact:${requirements}}
    """
    input requirements
    output analysis = "${artifacts_dir}/analysis.md"
  }
  
  step recommendations {
    depends_on analysis
    type model
    role analyst
    prompt """
      На основе анализа, предоставьте конкретные рекомендации:
      
      ${artifact:${analysis}}
    """
    input analysis
    output recommendations = "${artifacts_dir}/recommendations.md"
  }
}
```

Запустите DSL:

```bash
workflow-orchestrator run analysis-workflow.dsl \
  --var user_request="Создать систему управления задачами"
```

## Шаг 8: Остановка и возобновление

Запустите длинный процесс:

```bash
workflow-orchestrator run long-workflow.yaml
```

Остановите его (Ctrl+C), затем возобновите:

```bash
workflow-orchestrator resume session_20260110_120000 long-workflow.yaml
```

Проверьте статус:

```bash
workflow-orchestrator status session_20260110_120000
```

## Шаг 9: Параллельное выполнение

Создайте процесс с параллельными шагами `parallel-workflow.yaml`:

```yaml
workflow:
  name: "parallel-analysis"
  version: "1.0"
  
  settings:
    artifacts_dir: "artifacts/parallel"
    parallel_execution: true
  
  roles:
    technical_analyst:
      adapter: "claude-cli"
      model: "claude-sonnet-3.5"
      role_definition: "Технический аналитик"
    
    business_analyst:
      adapter: "openai-cli"
      model: "gpt-4"
      role_definition: "Бизнес-аналитик"
  
  steps:
    # Параллельный анализ
    - id: "parallel_analysis"
      name: "Параллельный анализ"
      type: "parallel"
      steps:
        - id: "technical"
          name: "Технический анализ"
          type: "model"
          role: "technical_analyst"
          prompt_template: |
            Проведите технический анализ: ${request}
          inputs:
            request: "${request}"
          outputs:
            technical: "${artifacts_dir}/technical.md"
        
        - id: "business"
          name: "Бизнес-анализ"
          type: "model"
          role: "business_analyst"
          prompt_template: |
            Проведите бизнес-анализ: ${request}
          inputs:
            request: "${request}"
          outputs:
            business: "${artifacts_dir}/business.md"
    
    # Объединение результатов
    - id: "merge"
      name: "Объединение результатов"
      type: "model"
      role: "technical_analyst"
      depends_on:
        - "parallel_analysis"
      prompt_template: |
        Объедините технический и бизнес-анализ:
        
        Технический:
        ${artifact:${technical}}
        
        Бизнес:
        ${artifact:${business}}
      inputs:
        technical: "${technical}"
        business: "${business}"
      outputs:
        final: "${artifacts_dir}/final.md"
```

## Шаг 10: Циклы с условиями

Создайте процесс с циклом, который выполняется до достижения условия `loop-condition-workflow.yaml`:

```yaml
workflow:
  name: "iterative-improvement"
  version: "1.0"

  settings:
    artifacts_dir: "artifacts/improvement-${timestamp}"

  roles:
    writer:
      adapter: "claude-cli"
      model: "claude-sonnet-3.5"
      role_definition: "Вы создаёте и улучшаете тексты"

  steps:
    # Инициализация статуса
    - id: "init"
      name: "Инициализация"
      type: "script"
      script: echo "IN_PROGRESS"
      shell: "bash"
      outputs:
        status: "${artifacts_dir}/status.txt"

    # Цикл улучшения с условием
    - id: "improve_loop"
      name: "Цикл улучшения"
      type: "loop"
      depends_on: ["init"]
      loop_condition: "status != 'APPROVED'"  # Продолжать пока не одобрено
      loop_max_iterations: 3  # Максимум 3 итерации
      loop_body:
        id: "write"
        name: "Написание/улучшение"
        type: "model"
        role: "writer"
        prompt_template: |
          Итерация ${loop_iteration} из ${loop_max_iterations}

          Создай или улучши текст о важности тестирования.
          В конце напиши: STATUS: APPROVED или STATUS: IN_PROGRESS
        outputs:
          text: "${artifacts_dir}/text_v${loop_iteration}.md"
          status: "${artifacts_dir}/status_v${loop_iteration}.txt"

    # Финальный результат
    - id: "final"
      name: "Финальная версия"
      type: "model"
      role: "writer"
      depends_on: ["improve_loop"]
      prompt_template: |
        Финальная проверка текста: ${text}
      inputs:
        text: "${text}"
      outputs:
        final: "${artifacts_dir}/final.md"
```

**Поддерживаемые операторы в условиях:**
- Сравнение: `==`, `!=`, `>`, `<`, `>=`, `<=`
- Строковые: `contains`, `startsWith`, `endsWith`
- Логические: `&&`, `||`, `!`

**Пример со сложным условием:**
```yaml
loop_condition: "score < 80 && attempts < 3"
loop_max_iterations: 10
```

**Доступные переменные в цикле:**
- `${loop_iteration}` - номер итерации (1, 2, 3, ...)
- `${loop_index}` - индекс (0, 1, 2, ...)
- `${loop_max_iterations}` - максимальное количество итераций

## Шаг 11: Экспорт и совместное использование

Экспортируйте ваш процесс:

```bash
workflow-orchestrator export \
  analysis-workflow.yaml \
  exports/analysis-v1.0.yaml \
  --include-files \
  --author "Ваше Имя" \
  --description "Процесс анализа требований"
```

Поделитесь с коллегами, они могут импортировать:

```bash
workflow-orchestrator import \
  exports/analysis-v1.0.yaml \
  my-analysis.yaml
```

## Следующие шаги

Теперь вы готовы к более сложным сценариям:

1. **Изучите примеры**:
   - [Dual-design процесс](../examples/dual-design-workflow.yaml)
   - [Процесс с MCP](../examples/mcp-workflow-example.yaml)

2. **Изучите документацию**:
   - [DSL синтаксис](DSL_SYNTAX.md)
   - [Экспорт/импорт](../examples/export-import-example.md)
   - [Конфигурация адаптеров](../examples/cli-adapters-config.yaml)

3. **Создайте свои процессы**:
   - Автоматизация код-ревью
   - Генерация документации
   - Анализ требований
   - Создание тестов

4. **Интегрируйте в CI/CD**:
   - Автоматический запуск процессов
   - Валидация конфигураций
   - Генерация отчетов

## Полезные команды

```bash
# Справка
workflow-orchestrator --help
workflow-orchestrator run --help

# Валидация
workflow-orchestrator dry-run config.yaml

# Запуск с переменными
workflow-orchestrator run config.yaml --var key=value

# Статус
workflow-orchestrator status <session-id>

# Возобновление
workflow-orchestrator resume <session-id> config.yaml

# Экспорт
workflow-orchestrator export config.yaml output.yaml --include-files

# Импорт
workflow-orchestrator import input.yaml output.yaml

# DSL
workflow-orchestrator parse workflow.dsl --output workflow.yaml
workflow-orchestrator validate workflow.dsl
```

## Получение помощи

- 📖 **Документация**: [docs/](.)
- 💬 **Примеры**: [examples/](../examples/)
- 🐛 **Issues**: [GitHub Issues](https://github.com/Nikolay-Shirokov/workflow-orchestrator/issues)
- 💡 **Обсуждения**: [GitHub Discussions](https://github.com/Nikolay-Shirokov/workflow-orchestrator/discussions)

Удачи в автоматизации ваших рабочих процессов! 🚀
