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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 секунд таймаут

      const response = await fetch(url, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
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
   * @param request - Запрос к адаптеру
   * @returns Promise<AdapterResponse> - Ответ от модели
   */
  async execute(request: AdapterRequest): Promise<AdapterResponse> {
    const startTime = Date.now();
    
    try {
      // Построение запроса
      const chatRequest = this.buildChatCompletionRequest(request);
      
      // Выполнение HTTP запроса
      const url = `${this.baseUrl}/chat/completions`;
      const controller = new AbortController();
      const timeout = request.timeout || this.timeout;
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(chatRequest),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Обработка ответа
      const responseText = await response.text();
      
      if (!response.ok) {
        throw this.createHttpError(response.status, responseText);
      }

      // Парсинг ответа
      const chatResponse: OpenAIChatResponse = JSON.parse(responseText);
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
    
    // Формируем запрос
    const chatRequest: OpenAIChatRequest = {
      model: request.model || this.defaultModel || 'gpt-3.5-turbo',
      messages
    };
    
    // Добавляем опциональные параметры
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
   * @param error - Ошибка выполнения
   * @returns AdapterError - Структурированная ошибка
   */
  handleError(error: Error): AdapterError {
    const errorWithStatus = error as Error & { status?: number };
    const status = errorWithStatus.status;
    
    // Определяем код ошибки и retryable флаг
    let code = 'ADAPTER_UNKNOWN_ERROR';
    let retryable = false;
    
    // Сетевые ошибки
    if (error.name === 'AbortError' || error.message.includes('aborted')) {
      code = 'ADAPTER_TIMEOUT';
      retryable = true;
    } else if (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('fetch failed')
    ) {
      code = 'ADAPTER_NETWORK_ERROR';
      retryable = true;
    }
    // HTTP статусы
    else if (status === 401 || status === 403) {
      code = 'ADAPTER_AUTH_ERROR';
      retryable = false;
    } else if (status === 404) {
      code = 'ADAPTER_NOT_FOUND';
      retryable = false;
    } else if (status === 429) {
      code = 'ADAPTER_RATE_LIMIT';
      retryable = true;
    } else if (status && status >= 500) {
      code = 'ADAPTER_SERVER_ERROR';
      retryable = true;
    } else if (status && status >= 400 && status < 500) {
      code = 'ADAPTER_INVALID_REQUEST';
      retryable = false;
    }
    
    return {
      code,
      message: error.message,
      retryable,
      originalError: error
    };
  }
}
