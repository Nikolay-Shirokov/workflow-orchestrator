/**
 * OpenAI-совместимый HTTP API адаптер
 * Адаптер для работы с OpenAI-совместимыми HTTP API (LM Studio, LocalAI, Ollama, и др.)
 */

import {
  CLIAdapter,
  AdapterRequest,
  AdapterResponse,
  AdapterError
} from '../core/types.js';

/**
 * Конфигурация OpenAI-совместимого адаптера
 */
export interface OpenAICompatibleConfig {
  /** Имя адаптера */
  name: string;
  
  /** Базовый URL API (например, http://localhost:1234/v1) */
  baseUrl: string;
  
  /** API ключ для аутентификации (опционально) */
  apiKey?: string;
  
  /** Модель по умолчанию */
  defaultModel?: string;
  
  /** Таймаут запросов в миллисекундах */
  timeout?: number;
  
  /** Дополнительные HTTP заголовки */
  headers?: Record<string, string>;
}

/**
 * Сообщение в формате OpenAI Chat API
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Запрос к OpenAI Chat Completion API
 */
interface OpenAIChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

/**
 * Ответ от OpenAI Chat Completion API
 */
interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Ответ с ошибкой от OpenAI API
 */
interface OpenAIErrorResponse {
  error: {
    message: string;
    type?: string;
    code?: string;
  };
}

/**
 * Опции для HTTP запроса
 */
interface RequestOptions {
  /** HTTP заголовки */
  headers?: Record<string, string>;
  /** Таймаут в миллисекундах */
  timeout?: number;
  /** AbortSignal для отмены запроса */
  signal?: AbortSignal;
}

/**
 * HTTP ответ
 */
interface HTTPResponse {
  /** HTTP статус код */
  status: number;
  /** HTTP статус текст */
  statusText: string;
  /** HTTP заголовки ответа */
  headers: Record<string, string>;
  /** Тело ответа */
  body: string;
}

/**
 * Внутренний HTTP клиент для выполнения запросов
 * Инкапсулирует логику HTTP запросов с поддержкой таймаутов и заголовков
 */
class HTTPClient {
  /**
   * Выполнение GET запроса
   * @param url - URL для запроса
   * @param options - Опции запроса
   * @returns Promise<HTTPResponse> - HTTP ответ
   */
  async get(url: string, options: RequestOptions = {}): Promise<HTTPResponse> {
    return this.request(url, 'GET', undefined, options);
  }

  /**
   * Выполнение POST запроса
   * @param url - URL для запроса
   * @param body - Тело запроса (будет сериализовано в JSON)
   * @param options - Опции запроса
   * @returns Promise<HTTPResponse> - HTTP ответ
   */
  async post(
    url: string,
    body: unknown,
    options: RequestOptions = {}
  ): Promise<HTTPResponse> {
    return this.request(url, 'POST', body, options);
  }

  /**
   * Внутренний метод для выполнения HTTP запроса
   * @param url - URL для запроса
   * @param method - HTTP метод
   * @param body - Тело запроса (опционально)
   * @param options - Опции запроса
   * @returns Promise<HTTPResponse> - HTTP ответ
   */
  private async request(
    url: string,
    method: string,
    body?: unknown,
    options: RequestOptions = {}
  ): Promise<HTTPResponse> {
    // Создаем AbortController для таймаута если не передан signal
    let controller: AbortController | undefined;
    let timeoutId: NodeJS.Timeout | undefined;
    
    if (options.timeout && !options.signal) {
      controller = new AbortController();
      timeoutId = setTimeout(() => controller!.abort(), options.timeout);
    }

    try {
      // Формируем параметры fetch
      const fetchOptions: RequestInit = {
        method,
        headers: options.headers,
        signal: options.signal || controller?.signal
      };

      // Добавляем тело для POST запросов
      if (body !== undefined) {
        fetchOptions.body = JSON.stringify(body);
      }

      // Выполняем запрос
      const response = await fetch(url, fetchOptions);

      // Очищаем таймаут
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Читаем тело ответа
      const responseBody = await response.text();

      // Преобразуем заголовки в объект
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers,
        body: responseBody
      };
    } catch (error) {
      // Очищаем таймаут в случае ошибки
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      throw error;
    }
  }
}

/**
 * Адаптер для OpenAI-совместимых HTTP API
 * Поддерживает LM Studio, LocalAI, Ollama, Text Generation WebUI и другие
 */
export class OpenAICompatibleAdapter implements CLIAdapter {
  name: string;
  version: string = '1.0.0';
  
  private baseUrl: string;
  private apiKey?: string;
  private defaultModel?: string;
  private timeout: number;
  private headers: Record<string, string>;
  private httpClient: HTTPClient;

  /**
   * Создание адаптера с конфигурацией
   * @param config - Конфигурация адаптера (опционально)
   */
  constructor(config?: Partial<OpenAICompatibleConfig>) {
    // Конфигурация по умолчанию для локального LM Studio
    this.name = config?.name || 'openai-compatible';
    this.baseUrl = this.resolveEnvVariables(
      config?.baseUrl || 'http://localhost:1234/v1'
    );
    this.apiKey = config?.apiKey 
      ? this.resolveEnvVariables(config.apiKey)
      : undefined;
    this.defaultModel = config?.defaultModel;
    this.timeout = config?.timeout || 300000; // 5 минут по умолчанию
    this.headers = config?.headers || {};
    
    // Создаем HTTP клиент
    this.httpClient = new HTTPClient();
  }

  /**
   * Подстановка переменных окружения в строку
   * Поддерживает синтаксис ${VAR_NAME}
   * @param value - Строка с возможными переменными окружения
   * @returns string - Строка с подставленными значениями
   */
  private resolveEnvVariables(value: string): string {
    return value.replace(/\$\{(\w+)\}/g, (match, varName) => {
      return process.env[varName] || match;
    });
  }

  /**
   * Проверка доступности API
   * Отправляет GET запрос к эндпоинту /models
   * @returns Promise<boolean> - true если API доступен
   */
  async isAvailable(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/models`;
      
      // Используем HTTP клиент с коротким таймаутом
      const response = await this.httpClient.get(url, {
        headers: this.buildHeaders(),
        timeout: 5000 // 5 секунд таймаут
      });
      
      if (response.status === 200) {
        return true;
      }
      
      console.warn(
        `[${this.name}] API недоступен. Статус: ${response.status}`
      );
      return false;
    } catch (error) {
      console.warn(
        `[${this.name}] Ошибка проверки доступности: ${(error as Error).message}`
      );
      return false;
    }
  }

  /**
   * Выполнение запроса к модели
   * Устойчив к неподдерживаемым параметрам и ошибкам парсинга
   * 
   * @param request - Запрос к адаптеру
   * @returns Promise<AdapterResponse> - Ответ от модели
   */
  async execute(request: AdapterRequest): Promise<AdapterResponse> {
    const startTime = Date.now();
    
    try {
      // Построение запроса
      const chatRequest = this.buildChatCompletionRequest(request);
      
      // Выполнение HTTP запроса через HTTP клиент
      const url = `${this.baseUrl}/chat/completions`;
      const timeout = request.timeout || this.timeout;

      const response = await this.httpClient.post(url, chatRequest, {
        headers: this.buildHeaders(),
        timeout
      });

      // Обработка ответа
      if (response.status !== 200) {
        throw this.createHttpError(response.status, response.body);
      }

      // Парсинг ответа с защитой от ошибок
      let chatResponse: OpenAIChatResponse;
      try {
        chatResponse = JSON.parse(response.body);
      } catch (parseError) {
        // Если не удалось распарсить ответ, это может быть из-за неподдерживаемого формата
        console.warn(
          `[${this.name}] Не удалось распарсить ответ API. Возможно, сервис вернул нестандартный формат.`
        );
        throw new Error(`Ошибка парсинга ответа: ${(parseError as Error).message}`);
      }
      
      const content = this.parseChatCompletion(chatResponse);
      
      const executionTime = Date.now() - startTime;

      return {
        content,
        model: chatResponse.model,
        tokensUsed: chatResponse.usage?.total_tokens,
        executionTime,
        metadata: {
          usage: chatResponse.usage,
          finishReason: chatResponse.choices[0]?.finish_reason
        }
      };
    } catch (error) {
      throw this.handleError(error as Error);
    }
  }

  /**
   * Построение запроса к Chat Completion API
   * Устойчив к неподдерживаемым параметрам - отправляет только стандартные параметры OpenAI API
   * Если сервис не поддерживает какие-то параметры, он их просто игнорирует
   * 
   * @param request - Запрос к адаптеру
   * @returns OpenAIChatRequest - Запрос в формате OpenAI
   */
  private buildChatCompletionRequest(request: AdapterRequest): OpenAIChatRequest {
    const messages: ChatMessage[] = [];
    
    // Добавляем системный промпт если указан
    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt
      });
    }
    
    // Добавляем пользовательский промпт
    messages.push({
      role: 'user',
      content: request.prompt
    });
    
    // Формируем запрос с обязательными параметрами
    const chatRequest: OpenAIChatRequest = {
      model: request.model || this.defaultModel || 'gpt-3.5-turbo',
      messages
    };
    
    // Добавляем опциональные параметры только если они указаны
    // Это обеспечивает устойчивость - если сервис не поддерживает параметр,
    // он просто игнорирует его без ошибки
    if (request.temperature !== undefined) {
      chatRequest.temperature = request.temperature;
    }
    
    if (request.maxTokens !== undefined) {
      chatRequest.max_tokens = request.maxTokens;
    }
    
    return chatRequest;
  }

  /**
   * Парсинг ответа от Chat Completion API
   * @param response - Ответ от API
   * @returns string - Извлеченный контент
   */
  private parseChatCompletion(response: OpenAIChatResponse): string {
    // Извлекаем контент из первого варианта ответа
    if (!response.choices || response.choices.length === 0) {
      throw new Error('Ответ API не содержит вариантов (choices)');
    }
    
    const content = response.choices[0].message.content;
    
    if (!content) {
      throw new Error('Ответ API не содержит контента');
    }
    
    return content;
  }

  /**
   * Построение HTTP заголовков
   * @returns Record<string, string> - Заголовки запроса
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.headers
    };
    
    // Добавляем Authorization заголовок если API ключ указан
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    
    return headers;
  }

  /**
   * Создание ошибки из HTTP ответа
   * @param status - HTTP статус код
   * @param responseText - Тело ответа
   * @returns Error - Ошибка с информацией
   */
  private createHttpError(status: number, responseText: string): Error {
    let errorMessage = `HTTP ${status}`;
    
    // Пытаемся извлечь сообщение об ошибке из тела ответа
    try {
      const errorResponse: OpenAIErrorResponse = JSON.parse(responseText);
      if (errorResponse.error?.message) {
        errorMessage = errorResponse.error.message;
      }
    } catch {
      // Если не удалось распарсить JSON, используем текст ответа
      if (responseText) {
        errorMessage = `HTTP ${status}: ${responseText.substring(0, 200)}`;
      }
    }
    
    const error = new Error(errorMessage) as Error & { status: number };
    error.status = status;
    return error;
  }

  /**
   * Парсинг ответа модели (для совместимости с интерфейсом)
   * @param rawOutput - Сырой вывод
   * @returns string - Распарсенный контент
   */
  parseResponse(rawOutput: string): string {
    // Этот метод не используется в HTTP адаптере,
    // но требуется интерфейсом CLIAdapter
    return rawOutput.trim();
  }

  /**
   * Обработка ошибок
   * Маппит различные типы ошибок на коды AdapterError с правильными флагами retryable
   * Извлекает сообщения об ошибках из тела ответа API
   * Обеспечивает устойчивость к неподдерживаемым параметрам - не падает при ошибках валидации
   * 
   * @param error - Ошибка выполнения
   * @returns AdapterError - Структурированная ошибка
   * 
   * Маппинг ошибок:
   * - Сетевые ошибки (ECONNREFUSED, ETIMEDOUT, etc.) → ADAPTER_NETWORK_ERROR (retryable)
   * - Таймауты (AbortError) → ADAPTER_TIMEOUT (retryable)
   * - HTTP 401/403 → ADAPTER_AUTH_ERROR (не retryable)
   * - HTTP 404 → ADAPTER_NOT_FOUND (не retryable)
   * - HTTP 429 → ADAPTER_RATE_LIMIT (retryable)
   * - HTTP 500/503 → ADAPTER_SERVER_ERROR (retryable)
   * - HTTP 400-499 → ADAPTER_INVALID_REQUEST (не retryable)
   * 
   * Устойчивость к неподдерживаемым параметрам:
   * - Ошибки валидации параметров обрабатываются как ADAPTER_INVALID_REQUEST
   * - Логируются предупреждения о неподдерживаемых параметрах
   * - Адаптер не падает, а возвращает структурированную ошибку
   */
  handleError(error: Error): AdapterError {
    const errorWithStatus = error as Error & { status?: number };
    const status = errorWithStatus.status;
    
    // Определяем код ошибки и retryable флаг
    let code = 'ADAPTER_UNKNOWN_ERROR';
    let retryable = false;
    let message = error.message;
    
    // Сетевые ошибки и таймауты
    if (error.name === 'AbortError' || error.message.includes('aborted')) {
      // Таймаут запроса
      code = 'ADAPTER_TIMEOUT';
      retryable = true;
      message = `Запрос превысил таймаут: ${error.message}`;
    } else if (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('fetch failed') ||
      error.message.includes('network')
    ) {
      // Сетевые ошибки (невозможно подключиться, DNS ошибки, и т.д.)
      code = 'ADAPTER_NETWORK_ERROR';
      retryable = true;
      message = `Ошибка сети: ${error.message}`;
    }
    // HTTP статусы
    else if (status === 401 || status === 403) {
      // Ошибки аутентификации
      code = 'ADAPTER_AUTH_ERROR';
      retryable = false;
      message = `Ошибка аутентификации (${status}): ${error.message}`;
    } else if (status === 404) {
      // Ресурс не найден
      code = 'ADAPTER_NOT_FOUND';
      retryable = false;
      message = `Ресурс не найден (404): ${error.message}`;
    } else if (status === 429) {
      // Превышен rate limit
      code = 'ADAPTER_RATE_LIMIT';
      retryable = true;
      message = `Превышен лимит запросов (429): ${error.message}`;
    } else if (status === 500 || status === 503) {
      // Серверные ошибки (500, 503)
      code = 'ADAPTER_SERVER_ERROR';
      retryable = true;
      message = `Ошибка сервера (${status}): ${error.message}`;
    } else if (status && status >= 500) {
      // Другие серверные ошибки (5xx)
      code = 'ADAPTER_SERVER_ERROR';
      retryable = true;
      message = `Ошибка сервера (${status}): ${error.message}`;
    } else if (status && status >= 400 && status < 500) {
      // Ошибки клиента (4xx, кроме уже обработанных)
      // Включает ошибки валидации параметров (например, неподдерживаемые параметры)
      code = 'ADAPTER_INVALID_REQUEST';
      retryable = false;
      
      // Логируем предупреждение о возможных неподдерживаемых параметрах
      if (error.message.includes('parameter') || error.message.includes('field')) {
        console.warn(
          `[${this.name}] Возможно, сервис не поддерживает некоторые параметры: ${error.message}`
        );
      }
      
      message = `Неверный запрос (${status}): ${error.message}`;
    }
    
    return {
      code,
      message,
      retryable,
      originalError: error
    };
  }
}
