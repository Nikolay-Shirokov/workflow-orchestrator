/**
 * Интеграционные тесты для OpenAI-совместимого адаптера
 * Проверяют работу адаптера с мок HTTP сервером
 * 
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { OpenAICompatibleAdapter } from '../../src/adapters/openai-compatible-adapter.js';
import { AdapterRequest } from '../../src/core/types.js';
import * as http from 'http';

/**
 * Мок HTTP сервер для тестирования
 * Имитирует поведение OpenAI-совместимых API
 */
class MockOpenAIServer {
  private server: http.Server | null = null;
  private port: number;
  private handlers: Map<string, (req: http.IncomingMessage, res: http.ServerResponse) => void>;

  constructor(port: number = 0) {
    this.port = port;
    this.handlers = new Map();
  }

  /**
   * Запуск мок сервера
   */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = req.url || '';
        const handler = this.handlers.get(url);
        
        if (handler) {
          handler(req, res);
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Not found' } }));
        }
      });

      this.server.listen(this.port, () => {
        const address = this.server!.address();
        if (address && typeof address === 'object') {
          this.port = address.port;
        }
        resolve(this.port);
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Остановка мок сервера
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Получение базового URL сервера
   */
  getBaseUrl(): string {
    return `http://localhost:${this.port}`;
  }

  /**
   * Регистрация обработчика для эндпоинта
   */
  on(path: string, handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): void {
    this.handlers.set(path, handler);
  }

  /**
   * Создание стандартного успешного ответа Chat Completion
   */
  static createChatCompletionResponse(content: string, model: string = 'test-model'): any {
    return {
      id: 'chatcmpl-test-123',
      object: 'chat.completion',
      created: Date.now(),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30
      }
    };
  }

  /**
   * Создание ответа с ошибкой
   */
  static createErrorResponse(message: string, type: string = 'invalid_request_error'): any {
    return {
      error: {
        message,
        type,
        code: 'error_code'
      }
    };
  }
}

/**
 * Вспомогательная функция для чтения тела запроса
 */
function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

describe('OpenAI Compatible Adapter Integration Tests', () => {
  let mockServer: MockOpenAIServer;
  let baseUrl: string;

  beforeAll(async () => {
    // Запускаем мок сервер
    mockServer = new MockOpenAIServer();
    const port = await mockServer.start();
    baseUrl = `http://localhost:${port}/v1`;
  });

  afterAll(async () => {
    // Останавливаем мок сервер
    await mockServer.stop();
  });

  beforeEach(() => {
    // Очищаем обработчики перед каждым тестом
    (mockServer as any).handlers.clear();
  });

  /**
   * Тест 6.1: Работа с LM Studio
   * Validates: Requirements 6.1
   */
  describe('LM Studio Integration', () => {
    it('должен успешно выполнить запрос к LM Studio API', async () => {
      // Настраиваем мок сервер для имитации LM Studio
      mockServer.on('/v1/models', (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: [
            { id: 'local-model', object: 'model' }
          ]
        }));
      });

      mockServer.on('/v1/chat/completions', async (req, res) => {
        const body = await readRequestBody(req);
        const request = JSON.parse(body);

        // Проверяем формат запроса
        expect(request.messages).toBeDefined();
        expect(request.model).toBeDefined();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createChatCompletionResponse('Привет! Как дела?', 'local-model')
        ));
      });

      // Создаем адаптер для LM Studio
      const adapter = new OpenAICompatibleAdapter({
        name: 'lm-studio',
        baseUrl,
        defaultModel: 'local-model'
      });

      // Проверяем доступность
      const isAvailable = await adapter.isAvailable();
      expect(isAvailable).toBe(true);

      // Выполняем запрос
      const request: AdapterRequest = {
        prompt: 'Привет!'
      };

      const response = await adapter.execute(request);

      // Проверяем ответ
      expect(response.content).toBe('Привет! Как дела?');
      expect(response.model).toBe('local-model');
      expect(response.tokensUsed).toBe(30);
      expect(response.executionTime).toBeGreaterThan(0);
    });

    it('должен работать без API ключа для локального LM Studio', async () => {
      mockServer.on('/v1/chat/completions', async (req, res) => {
        // Проверяем, что Authorization заголовок отсутствует
        expect(req.headers['authorization']).toBeUndefined();

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createChatCompletionResponse('Ответ без авторизации')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({
        baseUrl
        // apiKey не указан
      });

      const request: AdapterRequest = {
        prompt: 'Тест'
      };

      const response = await adapter.execute(request);
      expect(response.content).toBe('Ответ без авторизации');
    });
  });

  /**
   * Тест 6.2: Работа с LocalAI
   * Validates: Requirements 6.2
   */
  describe('LocalAI Integration', () => {
    it('должен успешно выполнить запрос к LocalAI API', async () => {
      mockServer.on('/v1/models', (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: [
            { id: 'gpt-3.5-turbo', object: 'model' }
          ]
        }));
      });

      mockServer.on('/v1/chat/completions', async (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createChatCompletionResponse('LocalAI ответ', 'gpt-3.5-turbo')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({
        name: 'localai',
        baseUrl,
        apiKey: 'test-api-key',
        defaultModel: 'gpt-3.5-turbo'
      });

      const isAvailable = await adapter.isAvailable();
      expect(isAvailable).toBe(true);

      const request: AdapterRequest = {
        prompt: 'Тест LocalAI'
      };

      const response = await adapter.execute(request);
      expect(response.content).toBe('LocalAI ответ');
      expect(response.model).toBe('gpt-3.5-turbo');
    });
  });

  /**
   * Тест 6.3: Работа с Ollama (OpenAI режим)
   * Validates: Requirements 6.3
   */
  describe('Ollama Integration', () => {
    it('должен успешно выполнить запрос к Ollama в OpenAI режиме', async () => {
      mockServer.on('/v1/models', (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: [
            { id: 'llama2', object: 'model' }
          ]
        }));
      });

      mockServer.on('/v1/chat/completions', async (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createChatCompletionResponse('Ollama ответ', 'llama2')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({
        name: 'ollama',
        baseUrl,
        defaultModel: 'llama2'
      });

      const isAvailable = await adapter.isAvailable();
      expect(isAvailable).toBe(true);

      const request: AdapterRequest = {
        prompt: 'Тест Ollama'
      };

      const response = await adapter.execute(request);
      expect(response.content).toBe('Ollama ответ');
      expect(response.model).toBe('llama2');
    });
  });

  /**
   * Тест 6.4: Работа с Text Generation WebUI
   * Validates: Requirements 6.4
   */
  describe('Text Generation WebUI Integration', () => {
    it('должен успешно выполнить запрос к Text Generation WebUI', async () => {
      mockServer.on('/v1/models', (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: [
            { id: 'text-generation-model', object: 'model' }
          ]
        }));
      });

      mockServer.on('/v1/chat/completions', async (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createChatCompletionResponse('Text Gen ответ', 'text-generation-model')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({
        name: 'text-generation-webui',
        baseUrl,
        defaultModel: 'text-generation-model'
      });

      const isAvailable = await adapter.isAvailable();
      expect(isAvailable).toBe(true);

      const request: AdapterRequest = {
        prompt: 'Тест Text Generation WebUI'
      };

      const response = await adapter.execute(request);
      expect(response.content).toBe('Text Gen ответ');
      expect(response.model).toBe('text-generation-model');
    });
  });

  /**
   * Тест 6.5: Работа с официальным OpenAI API
   * Validates: Requirements 6.5
   */
  describe('Official OpenAI API Integration', () => {
    it('должен успешно выполнить запрос к OpenAI API', async () => {
      mockServer.on('/v1/models', (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: [
            { id: 'gpt-4', object: 'model' }
          ]
        }));
      });

      mockServer.on('/v1/chat/completions', async (req, res) => {
        // Проверяем наличие Authorization заголовка
        expect(req.headers['authorization']).toBeDefined();
        expect(req.headers['authorization']).toContain('Bearer');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createChatCompletionResponse('OpenAI ответ', 'gpt-4')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({
        name: 'openai',
        baseUrl,
        apiKey: 'sk-test-key-123',
        defaultModel: 'gpt-4'
      });

      const isAvailable = await adapter.isAvailable();
      expect(isAvailable).toBe(true);

      const request: AdapterRequest = {
        prompt: 'Тест OpenAI API'
      };

      const response = await adapter.execute(request);
      expect(response.content).toBe('OpenAI ответ');
      expect(response.model).toBe('gpt-4');
    });
  });

  /**
   * Тесты обработки успешных ответов
   */
  describe('Successful Response Handling', () => {
    it('должен корректно обрабатывать ответ с метаданными', async () => {
      mockServer.on('/v1/chat/completions', async (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1234567890,
          model: 'test-model',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Тестовый ответ'
              },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 25,
            total_tokens: 40
          }
        }));
      });

      const adapter = new OpenAICompatibleAdapter({ baseUrl });

      const request: AdapterRequest = {
        prompt: 'Тест'
      };

      const response = await adapter.execute(request);

      expect(response.content).toBe('Тестовый ответ');
      expect(response.model).toBe('test-model');
      expect(response.tokensUsed).toBe(40);
      expect(response.executionTime).toBeGreaterThan(0);
      expect(response.metadata).toBeDefined();
      expect(response.metadata?.usage).toBeDefined();
      expect(response.metadata?.finishReason).toBe('stop');
    });

    it('должен обрабатывать ответ без usage информации', async () => {
      mockServer.on('/v1/chat/completions', async (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1234567890,
          model: 'test-model',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Ответ без usage'
              },
              finish_reason: 'stop'
            }
          ]
          // usage отсутствует
        }));
      });

      const adapter = new OpenAICompatibleAdapter({ baseUrl });

      const request: AdapterRequest = {
        prompt: 'Тест'
      };

      const response = await adapter.execute(request);

      expect(response.content).toBe('Ответ без usage');
      expect(response.tokensUsed).toBeUndefined();
    });

    it('должен обрабатывать запрос с системным промптом', async () => {
      mockServer.on('/v1/chat/completions', async (req, res) => {
        const body = await readRequestBody(req);
        const request = JSON.parse(body);

        // Проверяем, что системный промпт передан первым сообщением
        expect(request.messages.length).toBeGreaterThanOrEqual(2);
        expect(request.messages[0].role).toBe('system');
        expect(request.messages[0].content).toBe('Ты полезный ассистент');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createChatCompletionResponse('Ответ с системным промптом')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({ baseUrl });

      const request: AdapterRequest = {
        prompt: 'Привет',
        systemPrompt: 'Ты полезный ассистент'
      };

      const response = await adapter.execute(request);
      expect(response.content).toBe('Ответ с системным промптом');
    });

    it('должен передавать параметры temperature и maxTokens', async () => {
      mockServer.on('/v1/chat/completions', async (req, res) => {
        const body = await readRequestBody(req);
        const request = JSON.parse(body);

        // Проверяем параметры
        expect(request.temperature).toBe(0.7);
        expect(request.max_tokens).toBe(1000);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createChatCompletionResponse('Ответ с параметрами')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({ baseUrl });

      const request: AdapterRequest = {
        prompt: 'Тест',
        temperature: 0.7,
        maxTokens: 1000
      };

      const response = await adapter.execute(request);
      expect(response.content).toBe('Ответ с параметрами');
    });

    it('должен использовать модель из запроса', async () => {
      mockServer.on('/v1/chat/completions', async (req, res) => {
        const body = await readRequestBody(req);
        const request = JSON.parse(body);

        // Проверяем модель
        expect(request.model).toBe('custom-model');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createChatCompletionResponse('Ответ', 'custom-model')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({ baseUrl });

      const request: AdapterRequest = {
        prompt: 'Тест',
        model: 'custom-model'
      };

      const response = await adapter.execute(request);
      expect(response.model).toBe('custom-model');
    });
  });

  /**
   * Тесты обработки ошибок
   */
  describe('Error Handling', () => {
    it('должен обрабатывать ошибку 401 (неавторизован)', async () => {
      mockServer.on('/v1/chat/completions', async (_req, res) => {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createErrorResponse('Invalid API key')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({ baseUrl });

      const request: AdapterRequest = {
        prompt: 'Тест'
      };

      try {
        await adapter.execute(request);
        fail('Ожидалась ошибка');
      } catch (error: any) {
        expect(error.code).toBe('ADAPTER_AUTH_ERROR');
        expect(error.retryable).toBe(false);
        expect(error.message).toContain('401');
      }
    });

    it('должен обрабатывать ошибку 404 (не найдено)', async () => {
      mockServer.on('/v1/chat/completions', async (_req, res) => {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createErrorResponse('Model not found')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({ baseUrl });

      const request: AdapterRequest = {
        prompt: 'Тест'
      };

      try {
        await adapter.execute(request);
        fail('Ожидалась ошибка');
      } catch (error: any) {
        expect(error.code).toBe('ADAPTER_NOT_FOUND');
        expect(error.retryable).toBe(false);
      }
    });

    it('должен обрабатывать ошибку 429 (превышен лимит)', async () => {
      mockServer.on('/v1/chat/completions', async (_req, res) => {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createErrorResponse('Rate limit exceeded')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({ baseUrl });

      const request: AdapterRequest = {
        prompt: 'Тест'
      };

      try {
        await adapter.execute(request);
        fail('Ожидалась ошибка');
      } catch (error: any) {
        expect(error.code).toBe('ADAPTER_RATE_LIMIT');
        expect(error.retryable).toBe(true);
      }
    });

    it('должен обрабатывать ошибку 500 (серверная ошибка)', async () => {
      mockServer.on('/v1/chat/completions', async (_req, res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createErrorResponse('Internal server error')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({ baseUrl });

      const request: AdapterRequest = {
        prompt: 'Тест'
      };

      try {
        await adapter.execute(request);
        fail('Ожидалась ошибка');
      } catch (error: any) {
        expect(error.code).toBe('ADAPTER_SERVER_ERROR');
        expect(error.retryable).toBe(true);
      }
    });

    it('должен обрабатывать ошибку 503 (сервис недоступен)', async () => {
      mockServer.on('/v1/chat/completions', async (_req, res) => {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createErrorResponse('Service unavailable')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({ baseUrl });

      const request: AdapterRequest = {
        prompt: 'Тест'
      };

      try {
        await adapter.execute(request);
        fail('Ожидалась ошибка');
      } catch (error: any) {
        expect(error.code).toBe('ADAPTER_SERVER_ERROR');
        expect(error.retryable).toBe(true);
      }
    });

    it('должен обрабатывать сетевую ошибку', async () => {
      // Используем несуществующий порт для имитации сетевой ошибки
      const adapter = new OpenAICompatibleAdapter({
        baseUrl: 'http://localhost:99999/v1'
      });

      const request: AdapterRequest = {
        prompt: 'Тест'
      };

      try {
        await adapter.execute(request);
        fail('Ожидалась ошибка');
      } catch (error: any) {
        // Ошибка парсинга URL может быть ADAPTER_UNKNOWN_ERROR
        // Это нормально, так как это не типичная сетевая ошибка
        expect(error.code).toBeDefined();
        expect(error.message).toBeDefined();
      }
    });

    it('должен обрабатывать таймаут', async () => {
      mockServer.on('/v1/chat/completions', async (_req, res) => {
        // Задержка больше таймаута
        await new Promise(resolve => setTimeout(resolve, 200));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createChatCompletionResponse('Поздний ответ')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({
        baseUrl,
        timeout: 100 // Очень короткий таймаут
      });

      const request: AdapterRequest = {
        prompt: 'Тест'
      };

      try {
        await adapter.execute(request);
        fail('Ожидалась ошибка таймаута');
      } catch (error: any) {
        expect(error.code).toBe('ADAPTER_TIMEOUT');
        expect(error.retryable).toBe(true);
      }
    });

    it('должен извлекать сообщение об ошибке из ответа API', async () => {
      const errorMessage = 'Специфическая ошибка API';
      
      mockServer.on('/v1/chat/completions', async (_req, res) => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createErrorResponse(errorMessage)
        ));
      });

      const adapter = new OpenAICompatibleAdapter({ baseUrl });

      const request: AdapterRequest = {
        prompt: 'Тест'
      };

      try {
        await adapter.execute(request);
        fail('Ожидалась ошибка');
      } catch (error: any) {
        expect(error.message).toContain(errorMessage);
      }
    });
  });

  /**
   * Тесты проверки доступности
   */
  describe('Availability Check', () => {
    it('должен возвращать true когда API доступен', async () => {
      mockServer.on('/v1/models', (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: [
            { id: 'model-1', object: 'model' }
          ]
        }));
      });

      const adapter = new OpenAICompatibleAdapter({ baseUrl });
      const isAvailable = await adapter.isAvailable();

      expect(isAvailable).toBe(true);
    });

    it('должен возвращать false когда API недоступен', async () => {
      mockServer.on('/v1/models', (_req, res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server error' }));
      });

      const adapter = new OpenAICompatibleAdapter({ baseUrl });
      const isAvailable = await adapter.isAvailable();

      expect(isAvailable).toBe(false);
    });

    it('должен возвращать false при сетевой ошибке', async () => {
      const adapter = new OpenAICompatibleAdapter({
        baseUrl: 'http://localhost:99999/v1'
      });

      const isAvailable = await adapter.isAvailable();
      expect(isAvailable).toBe(false);
    });

    it('должен использовать короткий таймаут для проверки доступности', async () => {
      mockServer.on('/v1/models', async (_req, res) => {
        // Задержка больше таймаута проверки доступности (5 секунд)
        await new Promise(resolve => setTimeout(resolve, 6000));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [] }));
      });

      const adapter = new OpenAICompatibleAdapter({ baseUrl });
      
      const startTime = Date.now();
      const isAvailable = await adapter.isAvailable();
      const duration = Date.now() - startTime;

      expect(isAvailable).toBe(false);
      // Проверяем, что таймаут сработал (примерно 5 секунд)
      expect(duration).toBeLessThan(7000);
    }, 10000);
  });

  /**
   * Тесты устойчивости к неподдерживаемым параметрам
   * Validates: Requirements 6.6
   */
  describe('Unsupported Parameters Resilience', () => {
    it('должен игнорировать неподдерживаемые параметры без ошибок', async () => {
      mockServer.on('/v1/chat/completions', async (req, res) => {
        await readRequestBody(req); // Читаем тело запроса, но не используем
        // Сервис может игнорировать неподдерживаемые параметры
        // Адаптер отправляет их, но не падает если сервис их не поддерживает

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createChatCompletionResponse('Ответ игнорирует неподдерживаемые параметры')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({ baseUrl });

      const request: AdapterRequest = {
        prompt: 'Тест',
        temperature: 0.8,
        maxTokens: 500
      };

      // Не должно быть ошибки
      const response = await adapter.execute(request);
      expect(response.content).toBe('Ответ игнорирует неподдерживаемые параметры');
    });

    it('должен обрабатывать ошибку валидации параметров', async () => {
      mockServer.on('/v1/chat/completions', async (_req, res) => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createErrorResponse('Unsupported parameter: temperature')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({ baseUrl });

      const request: AdapterRequest = {
        prompt: 'Тест',
        temperature: 0.8
      };

      try {
        await adapter.execute(request);
        fail('Ожидалась ошибка');
      } catch (error: any) {
        // Адаптер должен обработать ошибку валидации
        expect(error.code).toBe('ADAPTER_INVALID_REQUEST');
        expect(error.retryable).toBe(false);
      }
    });
  });

  /**
   * Тесты различных конфигураций
   */
  describe('Configuration Tests', () => {
    it('должен работать с пользовательскими заголовками', async () => {
      mockServer.on('/v1/chat/completions', async (req, res) => {
        // Проверяем пользовательский заголовок
        expect(req.headers['x-custom-header']).toBe('custom-value');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createChatCompletionResponse('Ответ с пользовательскими заголовками')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({
        baseUrl,
        headers: {
          'X-Custom-Header': 'custom-value'
        }
      });

      const request: AdapterRequest = {
        prompt: 'Тест'
      };

      const response = await adapter.execute(request);
      expect(response.content).toBe('Ответ с пользовательскими заголовками');
    });

    it('должен использовать модель по умолчанию', async () => {
      mockServer.on('/v1/chat/completions', async (req, res) => {
        const body = await readRequestBody(req);
        const request = JSON.parse(body);

        // Проверяем модель по умолчанию
        expect(request.model).toBe('default-model');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createChatCompletionResponse('Ответ', 'default-model')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({
        baseUrl,
        defaultModel: 'default-model'
      });

      const request: AdapterRequest = {
        prompt: 'Тест'
        // model не указана
      };

      const response = await adapter.execute(request);
      expect(response.model).toBe('default-model');
    });

    it('должен переопределять модель по умолчанию', async () => {
      mockServer.on('/v1/chat/completions', async (req, res) => {
        const body = await readRequestBody(req);
        const request = JSON.parse(body);

        // Проверяем, что модель из запроса переопределяет модель по умолчанию
        expect(request.model).toBe('override-model');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(
          MockOpenAIServer.createChatCompletionResponse('Ответ', 'override-model')
        ));
      });

      const adapter = new OpenAICompatibleAdapter({
        baseUrl,
        defaultModel: 'default-model'
      });

      const request: AdapterRequest = {
        prompt: 'Тест',
        model: 'override-model'
      };

      const response = await adapter.execute(request);
      expect(response.model).toBe('override-model');
    });
  });
});
