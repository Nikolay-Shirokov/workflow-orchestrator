# Задача 13: Включение вопросов в файл ответов пользователя

## Проблема

При выполнении workflow файл `answers_input.md` не содержал вопросы из `questions.md`. Пользователь видел только пустой шаблон без контекста, что затрудняло заполнение ответов.

### Пример проблемы

**Ожидалось:**
```markdown
# Ответы на вопросы

- Для какой основной задачи пользователи будут использовать распознанный текст?
- Что должно происходить с текстом после распознавания?
- На каких операционных системах должно работать решение?

---

**Напишите ваши ответы ниже:**

[Ваши ответы]
```

**Получалось:**
```markdown
# Ответы на вопросы

## Ваш ответ

<!-- Напишите ваш ответ здесь -->
```

## Причины

### 1. Неправильное использование полей конфигурации

В конфигурации шага `answers` использовалось поле `prompt_template` вместо `prompt_message`:

```yaml
# ❌ НЕПРАВИЛЬНО
- id: "answers"
  type: "user_input"
  prompt_template: |  # ← Это поле для шагов типа 'model'
    ${questions}
```

**Разница между полями:**
- `prompt_template` - используется для шагов типа `model` (генерация промпта для AI-модели)
- `prompt_message` - используется для шагов типа `user_input` (генерация шаблона файла для пользователя)

### 2. Отсутствие рендеринга переменных

`TemplateGenerator` не рендерил переменные в `prompt_message` перед генерацией шаблона. Переменные типа `${questions}` оставались нераскрытыми.

## Решение

### 1. Добавлен рендеринг переменных в `TemplateGenerator`

```typescript
// src/core/template-generator.ts
generate(
  format: FileFormat,
  step: WorkflowStep,
  context: ExecutionContext
): string {
  // Рендерим prompt_message с подстановкой переменных из контекста
  if (step.prompt_message) {
    step.prompt_message = context.templateEngine.render(
      step.prompt_message,
      {
        variables: context.state.context,
        loadArtifact: (_path: string) => '',
        if: (condition: boolean, thenValue: string, elseValue?: string) => 
          condition ? thenValue : (elseValue || ''),
        forEach: (_items: unknown[], _template: string) => ''
      }
    );
  }
  
  switch (format) {
    case 'markdown':
      return this.generateMarkdownTemplate(step, context);
    // ...
  }
}
```

Теперь переменные `${questions}`, `${user_need}` и другие корректно подставляются из контекста перед генерацией шаблона.

### 2. Исправлена конфигурация workflow

```yaml
# ✅ ПРАВИЛЬНО
- id: "answers"
  name: "Ответы на вопросы"
  type: "user_input"
  depends_on: ["questions"]
  input_mode: "file"
  file_format: "markdown"
  prompt_message: |  # ← Правильное поле для user_input
    # Ответы на вопросы
    
    ${questions}  # ← Эта переменная теперь рендерится
    
    ---
    
    **Напишите ваши ответы ниже:**
    
    [Ваши ответы]
  inputs:
    questions: "${questions}"
  outputs:
    answers: "${artifacts_dir}/answers.md"
```

## Результат

✅ **Файл `answers_input.md` теперь содержит вопросы**

Пример сгенерированного файла:

```markdown
# Ответы на вопросы

<!--
📝 Инструкции:

1. Заполните разделы ниже, заменив текст в квадратных скобках [...] своими ответами
2. Сохраните файл (Ctrl+S или Cmd+S)
3. Вернитесь в терминал и выберите "Продолжить" в интерактивном меню

💡 Совет: Пишите свободно, не обязательно следовать структуре точно. Главное - передать суть.
-->

# Ответы на вопросы

- Каково основное предназначение распознанного текста?
- Для какой операционной системы создается решение?
- Как пользователь будет запускать процесс распознавания?
- Требуется ли работа без подключения к интернету?
- Можете описать наиболее частый сценарий использования?

---

**Напишите ваши ответы ниже (по одному ответу на строку):**

[Ваши ответы]
```

## Тестирование

Полный workflow работает корректно:

```bash
node dist/cli/cli.js run examples/business-requirements-simple.yaml

# Шаг 1: user_need - пользователь описывает потребность ✅
# Шаг 2: questions - Gemini генерирует вопросы ✅
# Шаг 3: answers - файл содержит вопросы, пользователь отвечает ✅
# Шаг 4: requirements - Gemini генерирует требования на основе ответов
```

## Важные замечания

### Разница между `prompt_template` и `prompt_message`

| Поле | Тип шага | Назначение | Рендеринг |
|------|----------|------------|-----------|
| `prompt_template` | `model` | Генерация промпта для AI-модели | Да, в StepExecutor |
| `prompt_message` | `user_input` | Генерация шаблона файла для пользователя | Да, в TemplateGenerator |

### Порядок рендеринга

1. **Для шагов `model`**: `prompt_template` рендерится в `StepExecutor.executeModelStep()`
2. **Для шагов `user_input`**: `prompt_message` рендерится в `TemplateGenerator.generate()`

Это позволяет использовать переменные из контекста в обоих случаях.

## Файлы

- `src/core/template-generator.ts` - добавлен рендеринг `prompt_message` с подстановкой переменных
- `examples/business-requirements-simple.yaml` - изменено `prompt_template` → `prompt_message` для шага `answers`

## Коммит

```
fix: включение вопросов в файл ответов пользователя
Commit: 9febf28
```
