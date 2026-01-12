# Подключение к удаленному LM Studio

Это руководство описывает, как настроить подключение к LM Studio, запущенному на другой машине в локальной сети.

## Предварительные требования

### На машине с LM Studio (192.168.50.1)

1. **Запустите LM Studio**
2. **Загрузите модель** (например, Llama 2, Mistral, или другую)
3. **Включите сервер:**
   - Перейдите в раздел "Local Server" или "Developer"
   - Нажмите "Start Server"
   - Убедитесь, что сервер слушает на `0.0.0.0:1234` (не `127.0.0.1`)
   - Проверьте, что включен OpenAI-совместимый режим

4. **Настройте файрвол:**
   - Разрешите входящие соединения на порт 1234
   - Windows: `netsh advfirewall firewall add rule name="LM Studio" dir=in action=allow protocol=TCP localport=1234`
   - Linux: `sudo ufw allow 1234/tcp`

### На машине с оркестратором

1. **Убедитесь в сетевой доступности:**
   ```bash
   # Проверка доступности хоста
   ping 192.168.50.1
   
   # Проверка доступности порта (Windows)
   Test-NetConnection -ComputerName 192.168.50.1 -Port 1234
   
   # Проверка доступности порта (Linux/Mac)
   nc -zv 192.168.50.1 1234
   
   # Проверка HTTP эндпоинта
   curl http://192.168.50.1:1234/v1/models
   ```

## Конфигурация адаптера

### Вариант 1: YAML конфигурация

Создайте файл `config.yaml`:

```yaml
adapters:
  - name: lm-studio-remote
    type: openai-compatible
    baseUrl: http://192.168.50.1:1234/v1
    defaultModel: local-model
    timeout: 120000  # 2 минуты (для медленных моделей)
    headers:
      User-Agent: workflow-orchestrator/1.0

workflow:
  name: my-workflow
  steps:
    - name: generate-text
      role: lm-studio-remote
      prompt: "Ваш промпт здесь"
      temperature: 0.7
      maxTokens: 500
```

### Вариант 2: Программная конфигурация

```javascript
import { OpenAICompatibleAdapter } from './dist/adapters/openai-compatible-adapter.js';

const adapter = new OpenAICompatibleAdapter({
  name: 'lm-studio-remote',
  baseUrl: 'http://192.168.50.1:1234/v1',
  timeout: 120000
});

// Проверка доступности
const isAvailable = await adapter.isAvailable();
console.log('Сервер доступен:', isAvailable);

// Выполнение запроса
const response = await adapter.execute({
  prompt: 'Привет! Как дела?',
  temperature: 0.7,
  maxTokens: 100
});

console.log('Ответ:', response.content);
```

## Тестирование подключения

### Быстрый тест

```bash
# Сборка проекта
npm run build

# Запуск тестового скрипта
node test-lm-studio-remote.js
```

### Ручная проверка через curl

```bash
# Проверка доступности эндпоинта /models
curl http://192.168.50.1:1234/v1/models

# Тестовый запрос к chat/completions
curl http://192.168.50.1:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local-model",
    "messages": [
      {"role": "user", "content": "Привет!"}
    ],
    "temperature": 0.7,
    "max_tokens": 50
  }'
```

## Устранение неполадок

### Проблема: "Сервер недоступен"

**Возможные причины:**

1. **LM Studio не запущен**
   - Решение: Запустите LM Studio и включите сервер

2. **Сервер слушает только localhost**
   - Решение: В настройках LM Studio измените адрес с `127.0.0.1` на `0.0.0.0`

3. **Файрвол блокирует соединение**
   - Решение: Добавьте правило для порта 1234

4. **Неверный IP адрес**
   - Решение: Проверьте IP адрес машины с LM Studio:
     - Windows: `ipconfig`
     - Linux/Mac: `ifconfig` или `ip addr`

### Проблема: "Таймаут запроса"

**Возможные причины:**

1. **Модель слишком медленная**
   - Решение: Увеличьте `timeout` в конфигурации (например, до 300000 = 5 минут)

2. **Сетевая задержка**
   - Решение: Проверьте пинг до сервера, используйте проводное подключение

3. **Модель не загружена**
   - Решение: Убедитесь, что модель загружена в LM Studio

### Проблема: "Ошибка 404"

**Возможные причины:**

1. **Неверный baseUrl**
   - Решение: Убедитесь, что URL заканчивается на `/v1` (не `/v1/`)

2. **LM Studio использует другой путь**
   - Решение: Проверьте документацию вашей версии LM Studio

### Проблема: "Медленные ответы"

**Оптимизация:**

1. **Используйте меньшую модель** (например, 7B вместо 13B)
2. **Уменьшите `maxTokens`** в запросах
3. **Используйте проводное подключение** вместо Wi-Fi
4. **Включите GPU ускорение** в LM Studio (если доступно)
5. **Увеличьте `context_length`** в настройках модели

## Рекомендации по производительности

### Оптимальные настройки для локальной сети

```yaml
adapters:
  - name: lm-studio-remote
    type: openai-compatible
    baseUrl: http://192.168.50.1:1234/v1
    timeout: 120000
    headers:
      Connection: keep-alive  # Переиспользование соединений
      User-Agent: workflow-orchestrator/1.0
```

### Параметры запросов

```javascript
const response = await adapter.execute({
  prompt: 'Ваш промпт',
  temperature: 0.7,        // Креативность (0.0 - 2.0)
  maxTokens: 500,          // Ограничение длины ответа
  // Опционально:
  // systemPrompt: 'Ты полезный ассистент',
  // model: 'llama-2-7b'   // Если нужна конкретная модель
});
```

## Безопасность

### Для локальной сети

- ✅ Используйте HTTP (без SSL) для локальной сети
- ✅ Не требуется API ключ для LM Studio
- ⚠️ Не открывайте порт 1234 в интернет без аутентификации

### Для публичного доступа

Если вам нужен доступ через интернет:

1. **Используйте VPN** (WireGuard, OpenVPN)
2. **Настройте reverse proxy** с SSL (nginx, Caddy)
3. **Добавьте аутентификацию** (Basic Auth, API ключи)
4. **Ограничьте доступ по IP** в файрволе

## Мониторинг

### Проверка статуса

```javascript
// Периодическая проверка доступности
setInterval(async () => {
  const isAvailable = await adapter.isAvailable();
  console.log(`[${new Date().toISOString()}] LM Studio: ${isAvailable ? '✅' : '❌'}`);
}, 60000); // Каждую минуту
```

### Логирование запросов

```javascript
const response = await adapter.execute({
  prompt: 'Тест',
  temperature: 0.7,
  maxTokens: 100
});

console.log({
  timestamp: new Date().toISOString(),
  model: response.model,
  tokens: response.tokensUsed,
  duration: response.executionTime,
  success: true
});
```

## Дополнительные ресурсы

- [LM Studio Documentation](https://lmstudio.ai/docs)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Workflow Orchestrator Documentation](../README.md)

## Поддержка

Если у вас возникли проблемы:

1. Проверьте логи LM Studio
2. Запустите тестовый скрипт: `node test-lm-studio-remote.js`
3. Проверьте сетевую доступность: `curl http://192.168.50.1:1234/v1/models`
4. Создайте issue в репозитории с подробным описанием проблемы
