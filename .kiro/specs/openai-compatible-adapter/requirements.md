# Требования: OpenAI-совместимый HTTP API адаптер

## Введение

Этот документ описывает требования к адаптеру для работы с OpenAI-совместимыми HTTP API, такими как LM Studio, LocalAI, Ollama (с OpenAI-совместимым режимом), Text Generation WebUI и другими локальными и облачными сервисами, реализующими OpenAI API спецификацию.

## Глоссарий

- **OpenAI_Compatible_Adapter**: Адаптер для взаимодействия с OpenAI-совместимыми HTTP API
- **LM_Studio**: Локальное приложение для запуска LLM моделей с OpenAI-совместимым API
- **Base_URL**: Базовый URL эндпоинта API (например, http://localhost:1234/v1)
- **API_Key**: Ключ аутентификации API (опциональный для локальных сервисов)
- **Chat_Completion**: Эндпоинт /chat/completions для генерации ответов
- **Model_List**: Эндпоинт /models для получения списка доступных моделей
- **HTTP_Client**: Клиент для выполнения HTTP запросов

## Требования

### Требование 1: Базовая конфигурация адаптера

**User Story:** Как пользователь, я хочу настроить адаптер для работы с любым OpenAI-совместимым API, чтобы использовать локальные и облачные модели.

#### Критерии приемки

1. WHEN пользователь создает адаптер, THE OpenAI_Compatible_Adapter SHALL принимать базовый URL эндпоинта
2. WHERE API требует аутентификации, THE OpenAI_Compatible_Adapter SHALL поддерживать передачу API ключа
3. THE OpenAI_Compatible_Adapter SHALL использовать значения по умолчанию для локального LM Studio (http://localhost:1234/v1)
4. THE OpenAI_Compatible_Adapter SHALL позволять переопределять таймауты запросов
5. THE OpenAI_Compatible_Adapter SHALL поддерживать настройку дополнительных HTTP заголовков

### Требование 2: Выполнение запросов к модели

**User Story:** Как пользователь, я хочу отправлять промпты к модели через OpenAI-совместимый API, чтобы получать ответы от локальных и облачных LLM.

#### Критерии приемки

1. WHEN пользователь отправляет запрос, THE OpenAI_Compatible_Adapter SHALL формировать HTTP POST запрос к эндпоинту /chat/completions
2. WHEN запрос выполняется, THE OpenAI_Compatible_Adapter SHALL включать промпт в формате OpenAI messages
3. WHERE модель указана, THE OpenAI_Compatible_Adapter SHALL передавать имя модели в параметре model
4. WHERE системный промпт указан, THE OpenAI_Compatible_Adapter SHALL добавлять его как сообщение с ролью system
5. WHERE параметры генерации указаны, THE OpenAI_Compatible_Adapter SHALL передавать temperature, max_tokens и другие параметры

### Требование 3: Обработка ответов

**User Story:** Как пользователь, я хочу получать корректно обработанные ответы от API, чтобы использовать их в workflow.

#### Критерии приемки

1. WHEN API возвращает успешный ответ, THE OpenAI_Compatible_Adapter SHALL извлекать текст из choices[0].message.content
2. WHEN ответ содержит метаданные, THE OpenAI_Compatible_Adapter SHALL сохранять информацию о модели и использовании токенов
3. WHEN ответ содержит несколько вариантов (choices), THE OpenAI_Compatible_Adapter SHALL возвращать первый вариант
4. THE OpenAI_Compatible_Adapter SHALL измерять время выполнения запроса

### Требование 4: Проверка доступности сервиса

**User Story:** Как пользователь, я хочу проверять доступность API перед использованием, чтобы получать понятные сообщения об ошибках.

#### Критерии приемки

1. WHEN вызывается метод isAvailable, THE OpenAI_Compatible_Adapter SHALL отправлять GET запрос к эндпоинту /models
2. WHEN эндпоинт /models отвечает успешно, THE OpenAI_Compatible_Adapter SHALL возвращать true
3. IF эндпоинт /models недоступен, THEN THE OpenAI_Compatible_Adapter SHALL возвращать false
4. WHEN проверка доступности выполняется, THE OpenAI_Compatible_Adapter SHALL использовать короткий таймаут (5 секунд)
5. THE OpenAI_Compatible_Adapter SHALL логировать причину недоступности для отладки

### Требование 5: Обработка ошибок

**User Story:** Как пользователь, я хочу получать понятные сообщения об ошибках, чтобы быстро диагностировать проблемы.

#### Критерии приемки

1. IF HTTP запрос завершается с ошибкой сети, THEN THE OpenAI_Compatible_Adapter SHALL возвращать ошибку с кодом ADAPTER_NETWORK_ERROR
2. IF API возвращает 401 или 403, THEN THE OpenAI_Compatible_Adapter SHALL возвращать ошибку с кодом ADAPTER_AUTH_ERROR
3. IF API возвращает 404, THEN THE OpenAI_Compatible_Adapter SHALL возвращать ошибку с кодом ADAPTER_NOT_FOUND
4. IF API возвращает 429, THEN THE OpenAI_Compatible_Adapter SHALL возвращать ошибку с кодом ADAPTER_RATE_LIMIT и флагом retryable=true
5. IF запрос превышает таймаут, THEN THE OpenAI_Compatible_Adapter SHALL возвращать ошибку с кодом ADAPTER_TIMEOUT и флагом retryable=true
6. IF API возвращает 500 или 503, THEN THE OpenAI_Compatible_Adapter SHALL возвращать ошибку с флагом retryable=true
7. WHEN API возвращает ошибку в теле ответа, THE OpenAI_Compatible_Adapter SHALL извлекать и включать сообщение об ошибке

### Требование 6: Совместимость с различными реализациями

**User Story:** Как пользователь, я хочу использовать адаптер с разными OpenAI-совместимыми сервисами, чтобы иметь гибкость в выборе провайдера.

#### Критерии приемки

1. THE OpenAI_Compatible_Adapter SHALL работать с LM Studio API
2. THE OpenAI_Compatible_Adapter SHALL работать с LocalAI
3. THE OpenAI_Compatible_Adapter SHALL работать с Ollama в OpenAI-совместимом режиме
4. THE OpenAI_Compatible_Adapter SHALL работать с Text Generation WebUI (oobabooga)
5. THE OpenAI_Compatible_Adapter SHALL работать с официальным OpenAI API
6. WHERE сервис не поддерживает определенные параметры, THE OpenAI_Compatible_Adapter SHALL игнорировать их без ошибок

### Требование 7: Интеграция с системой адаптеров

**User Story:** Как разработчик, я хочу, чтобы адаптер соответствовал общей архитектуре, чтобы он работал со всеми компонентами системы.

#### Критерии приемки

1. THE OpenAI_Compatible_Adapter SHALL реализовывать интерфейс CLIAdapter
2. THE OpenAI_Compatible_Adapter SHALL поддерживать регистрацию в AdapterRegistry
3. THE OpenAI_Compatible_Adapter SHALL возвращать ответы в формате AdapterResponse
4. THE OpenAI_Compatible_Adapter SHALL обрабатывать ошибки в формате AdapterError
5. THE OpenAI_Compatible_Adapter SHALL поддерживать все стандартные параметры AdapterRequest

### Требование 8: Конфигурация через YAML

**User Story:** Как пользователь, я хочу настраивать адаптер через YAML конфигурацию, чтобы легко переключаться между разными сервисами.

#### Критерии приемки

1. WHEN адаптер настраивается через YAML, THE OpenAI_Compatible_Adapter SHALL читать параметр baseUrl
2. WHEN адаптер настраивается через YAML, THE OpenAI_Compatible_Adapter SHALL читать параметр apiKey
3. WHEN адаптер настраивается через YAML, THE OpenAI_Compatible_Adapter SHALL читать параметр defaultModel
4. WHEN адаптер настраивается через YAML, THE OpenAI_Compatible_Adapter SHALL читать параметр timeout
5. WHEN адаптер настраивается через YAML, THE OpenAI_Compatible_Adapter SHALL читать параметр headers для дополнительных заголовков
6. THE OpenAI_Compatible_Adapter SHALL поддерживать переменные окружения для чувствительных данных (например, ${OPENAI_API_KEY})
