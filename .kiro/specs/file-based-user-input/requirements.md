# Requirements Document: File-Based User Input

## Introduction

Эта функциональность улучшает пользовательский опыт при работе с workflow orchestrator, позволяя пользователям вводить большие структурированные промпты и отвечать на вопросы через текстовые файлы вместо командной строки или предподготовленных файлов.

## Glossary

- **Workflow_Orchestrator**: Система управления рабочими процессами, выполняющая последовательность шагов
- **User_Input_Step**: Шаг рабочего процесса, требующий ввода от пользователя
- **Template_File**: Временный файл с подсказками и структурой для заполнения пользователем
- **Editor**: Текстовый редактор для редактирования файлов (по умолчанию или указанный пользователем)
- **Interactive_Mode**: Режим работы, при котором процесс приостанавливается и ожидает действий пользователя
- **Context**: Набор переменных и данных, передаваемых между шагами процесса

## Requirements

### Requirement 1: Создание файла-шаблона для пользовательского ввода

**User Story:** Как пользователь, я хочу получать файл-шаблон с подсказками, чтобы удобно вводить большие структурированные данные.

#### Acceptance Criteria

1. WHEN процесс достигает шага user_input THEN THE Workflow_Orchestrator SHALL создать Template_File с подсказками для пользователя
2. WHEN создается Template_File THEN THE Workflow_Orchestrator SHALL включить в него инструкции по заполнению
3. WHEN создается Template_File для вопросов THEN THE Workflow_Orchestrator SHALL включить все вопросы с вариантами ответов
4. WHEN создается Template_File THEN THE Workflow_Orchestrator SHALL сохранить его в директории артефактов с понятным именем
5. THE Template_File SHALL использовать формат Markdown для удобства чтения и редактирования

### Requirement 2: Открытие файла в редакторе

**User Story:** Как пользователь, я хочу, чтобы файл автоматически открывался в моем редакторе, чтобы сразу начать его заполнение.

#### Acceptance Criteria

1. WHEN Template_File создан THEN THE Workflow_Orchestrator SHALL открыть его в Editor
2. WHERE пользователь указал предпочитаемый Editor в настройках процесса THEN THE Workflow_Orchestrator SHALL использовать указанный Editor
3. WHERE пользователь не указал Editor THEN THE Workflow_Orchestrator SHALL использовать системный редактор по умолчанию
4. IF Editor не может быть запущен THEN THE Workflow_Orchestrator SHALL вывести путь к файлу и продолжить в интерактивном режиме
5. THE Workflow_Orchestrator SHALL поддерживать настройку editor в конфигурации процесса
6. THE Workflow_Orchestrator SHALL проверять доступность Editor перед попыткой запуска только для редакторов, доступных на текущей платформе

### Requirement 3: Приостановка процесса и ожидание пользователя

**User Story:** Как пользователь, я хочу, чтобы процесс приостанавливался после открытия файла, чтобы у меня было время его заполнить.

#### Acceptance Criteria

1. WHEN Template_File открыт в Editor THEN THE Workflow_Orchestrator SHALL приостановить выполнение процесса
2. WHEN процесс приостановлен THEN THE Workflow_Orchestrator SHALL вывести сообщение с инструкциями для пользователя
3. THE Workflow_Orchestrator SHALL предложить команды: "продолжить" (или "готово"), "отложить" (или "позже")
4. WHEN пользователь вводит команду "продолжить" или "готово" THEN THE Workflow_Orchestrator SHALL прочитать заполненный файл и продолжить выполнение
5. WHEN пользователь вводит команду "отложить" или "позже" THEN THE Workflow_Orchestrator SHALL сохранить состояние и завершить выполнение для последующего возобновления

### Requirement 4: Чтение и валидация заполненного файла

**User Story:** Как пользователь, я хочу, чтобы система проверяла мой ввод, чтобы избежать ошибок в дальнейшем выполнении.

#### Acceptance Criteria

1. WHEN пользователь подтверждает заполнение файла THEN THE Workflow_Orchestrator SHALL прочитать содержимое Template_File
2. WHEN файл прочитан THEN THE Workflow_Orchestrator SHALL распарсить его согласно указанному формату
3. WHEN файл распарсен THEN THE Workflow_Orchestrator SHALL выполнить валидацию согласно правилам шага
4. IF валидация не пройдена THEN THE Workflow_Orchestrator SHALL вывести ошибки и предложить исправить файл
5. IF валидация не пройдена THEN THE Workflow_Orchestrator SHALL позволить пользователю повторно отредактировать файл
6. WHEN валидация пройдена THEN THE Workflow_Orchestrator SHALL сохранить данные в Context

### Requirement 5: Обработка ответов на вопросы

**User Story:** Как пользователь, я хочу отвечать на вопросы в файле, используя предложенные варианты или свой текст, чтобы иметь гибкость в ответах.

#### Acceptance Criteria

1. WHEN Template_File содержит вопросы THEN THE Workflow_Orchestrator SHALL отформатировать каждый вопрос с номером и вариантами ответов
2. THE пользователь SHALL иметь возможность выбрать предложенный вариант ответа
3. THE пользователь SHALL иметь возможность написать свой ответ вместо предложенных
4. THE пользователь SHALL иметь возможность добавить дополнительный текст к любому ответу
5. WHEN ответы обработаны THEN THE Workflow_Orchestrator SHALL извлечь только ответы без вопросов для передачи в Context

### Requirement 6: Оптимизация контекста для следующих шагов

**User Story:** Как разработчик процесса, я хочу минимизировать размер контекста, чтобы снизить затраты на API и ускорить выполнение.

#### Acceptance Criteria

1. WHEN ответы пользователя передаются в следующие шаги THEN THE Workflow_Orchestrator SHALL передавать только ответы без текста вопросов
2. WHERE необходима ссылка на вопрос THEN THE Workflow_Orchestrator SHALL использовать номер вопроса
3. THE Workflow_Orchestrator SHALL поддерживать опцию include_questions для включения вопросов в контекст
4. WHERE include_questions установлена в true THEN THE Workflow_Orchestrator SHALL включить вопросы в контекст
5. WHERE include_questions не указана или false THEN THE Workflow_Orchestrator SHALL передавать только ответы

### Requirement 7: Конфигурация типа ввода в workflow

**User Story:** Как разработчик процесса, я хочу настраивать способ ввода для каждого шага, чтобы выбирать между файловым и консольным вводом.

#### Acceptance Criteria

1. THE Workflow_Orchestrator SHALL поддерживать параметр input_mode в конфигурации шага user_input
2. WHERE input_mode установлен в "file" THEN THE Workflow_Orchestrator SHALL использовать файловый ввод
3. WHERE input_mode установлен в "console" THEN THE Workflow_Orchestrator SHALL использовать консольный ввод
4. WHERE input_mode не указан THEN THE Workflow_Orchestrator SHALL использовать значение по умолчанию из настроек процесса
5. THE Workflow_Orchestrator SHALL поддерживать глобальную настройку default_input_mode в settings

### Requirement 8: Возобновление процесса после редактирования файла

**User Story:** Как пользователь, я хочу иметь возможность вернуться к редактированию позже, чтобы не терять прогресс при необходимости прерваться.

#### Acceptance Criteria

1. WHEN пользователь выбирает "возобновить позже" THEN THE Workflow_Orchestrator SHALL сохранить текущее состояние процесса
2. WHEN пользователь возобновляет процесс THEN THE Workflow_Orchestrator SHALL проверить наличие заполненного Template_File
3. IF Template_File заполнен THEN THE Workflow_Orchestrator SHALL предложить использовать его или создать новый
4. IF Template_File не заполнен THEN THE Workflow_Orchestrator SHALL предложить открыть его для редактирования
5. WHEN процесс возобновлен с заполненным файлом THEN THE Workflow_Orchestrator SHALL продолжить выполнение со следующего шага

### Requirement 9: Поддержка различных форматов файлов

**User Story:** Как пользователь, я хочу работать с разными форматами файлов, чтобы использовать привычные мне инструменты.

#### Acceptance Criteria

1. THE Workflow_Orchestrator SHALL поддерживать формат Markdown для Template_File
2. THE Workflow_Orchestrator SHALL поддерживать формат Plain Text для Template_File
3. THE Workflow_Orchestrator SHALL поддерживать формат YAML для структурированных данных
4. THE Workflow_Orchestrator SHALL поддерживать формат JSON для структурированных данных
5. THE Workflow_Orchestrator SHALL определять формат файла по расширению или параметру file_format в конфигурации

### Requirement 10: Обработка ошибок и граничных случаев

**User Story:** Как пользователь, я хочу получать понятные сообщения об ошибках, чтобы быстро их исправлять.

#### Acceptance Criteria

1. IF Template_File не может быть создан THEN THE Workflow_Orchestrator SHALL вывести ошибку и предложить альтернативный путь
2. IF Editor не может быть запущен THEN THE Workflow_Orchestrator SHALL вывести предупреждение и путь к файлу для ручного открытия
3. IF Template_File был удален пользователем THEN THE Workflow_Orchestrator SHALL предложить создать новый
4. IF Template_File содержит некорректные данные THEN THE Workflow_Orchestrator SHALL вывести конкретные ошибки валидации
5. IF процесс прерван во время редактирования THEN THE Workflow_Orchestrator SHALL сохранить частично заполненный файл для возобновления
