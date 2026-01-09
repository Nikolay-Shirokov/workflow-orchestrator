/**
 * Mock CLI-адаптер для тестирования
 * Симулирует поведение реального CLI-адаптера без выполнения внешних команд
 */

import {
  CLIAdapter,
  AdapterRequest,
  AdapterResponse,
  AdapterError
} from '../core/types.js';

/**
 * Конфигурация ответа для мока
 */
export interface MockResponse {
  /** Паттерн для сопоставления с промптом (регулярное выражение или строка) */
  pattern: string | RegExp;
  
  /** Ответ, который нужно вернуть */
  response: string;
  
  /** Задержка перед ответом в миллисекундах (опционально) */
  delay?: number;
  
  /** Должен ли этот ответ вызвать ошибку */
  shouldError?: boolean;
  
  /** Код ошибки (если shouldError = true) */
  errorCode?: string;
  
  /** Сообщение об ошибке (если shouldError = true) */
  errorMessage?: string;
}

/**
 * Mock CLI-адаптер для тестирования
 * Позволяет настраивать ответы на различные промпты
 */
export class MockCLIAdapter implements CLIAdapter {
  name: string;
  version: string;
  
  /** Хранилище настроенных ответов */
  private responses: MockResponse[] = [];
  
  /** Ответ по умолчанию, если не найдено совпадение */
  private defaultResponse: string = 'Mock response';
  
  /** Флаг доступности адаптера */
  private available: boolean = true;
  
  /** История выполненных запросов */
  private requestHistory: AdapterRequest[] = [];

  constructor(name: string = 'mock-adapter', version: string = '1.0.0') {
    this.name = name;
    this.version = version;
  }

  /**
   * Проверка доступности утилиты
   * @returns Promise<boolean> - true если утилита доступна
   */
  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  /**
   * Установка доступности адаптера (для тестирования)
   * @param available - Флаг доступности
   */
  setAvailable(available: boolean): void {
    this.available = available;
  }

  /**
   * Выполнение запроса к модели
   * @param request - Запрос к адаптеру
   * @returns Promise<AdapterResponse> - Ответ от модели
   */
  async execute(request: AdapterRequest): Promise<AdapterResponse> {
    const startTime = Date.now();
    
    // Сохраняем запрос в историю
    this.requestHistory.push(request);
    
    // Ищем подходящий ответ
    const mockResponse = this.findMatchingResponse(request.prompt);
    
    // Симулируем задержку если указана
    if (mockResponse?.delay) {
      await this.sleep(mockResponse.delay);
    }
    
    // Симулируем ошибку если указано
    if (mockResponse?.shouldError) {
      const error = new Error(mockResponse.errorMessage || 'Mock error');
      throw this.handleError(error);
    }
    
    const executionTime = Date.now() - startTime;
    
    return {
      content: mockResponse?.response || this.defaultResponse,
      model: request.model || 'mock-model',
      executionTime,
      metadata: {
        mockAdapter: true,
        requestCount: this.requestHistory.length
      }
    };
  }

  /**
   * Парсинг ответа модели
   * @param rawOutput - Сырой вывод от CLI
   * @returns string - Распарсенный контент
   */
  parseResponse(rawOutput: string): string {
    return rawOutput.trim();
  }

  /**
   * Обработка ошибок
   * @param error - Ошибка выполнения
   * @returns AdapterError - Структурированная ошибка
   */
  handleError(error: Error): AdapterError {
    return {
      code: 'MOCK_ERROR',
      message: error.message,
      retryable: true,
      originalError: error
    };
  }

  /**
   * Настройка ответа для определенного паттерна промпта
   * @param pattern - Паттерн для сопоставления (строка или RegExp)
   * @param response - Ответ, который нужно вернуть
   * @param options - Дополнительные опции
   */
  setResponse(
    pattern: string | RegExp,
    response: string,
    options?: {
      delay?: number;
      shouldError?: boolean;
      errorCode?: string;
      errorMessage?: string;
    }
  ): void {
    this.responses.push({
      pattern,
      response,
      ...options
    });
  }

  /**
   * Установка ответа по умолчанию
   * @param response - Ответ по умолчанию
   */
  setDefaultResponse(response: string): void {
    this.defaultResponse = response;
  }

  /**
   * Очистка всех настроенных ответов
   */
  clearResponses(): void {
    this.responses = [];
  }

  /**
   * Получение истории запросов
   * @returns AdapterRequest[] - Массив всех выполненных запросов
   */
  getRequestHistory(): AdapterRequest[] {
    return [...this.requestHistory];
  }

  /**
   * Очистка истории запросов
   */
  clearHistory(): void {
    this.requestHistory = [];
  }

  /**
   * Получение количества выполненных запросов
   * @returns number - Количество запросов
   */
  getRequestCount(): number {
    return this.requestHistory.length;
  }

  /**
   * Поиск подходящего ответа для промпта
   * @param prompt - Промпт для поиска
   * @returns MockResponse | undefined - Найденный ответ или undefined
   */
  private findMatchingResponse(prompt: string): MockResponse | undefined {
    for (const mockResponse of this.responses) {
      if (this.matchesPattern(prompt, mockResponse.pattern)) {
        return mockResponse;
      }
    }
    return undefined;
  }

  /**
   * Проверка соответствия промпта паттерну
   * @param prompt - Промпт для проверки
   * @param pattern - Паттерн (строка или RegExp)
   * @returns boolean - true если соответствует
   */
  private matchesPattern(prompt: string, pattern: string | RegExp): boolean {
    if (typeof pattern === 'string') {
      return prompt.includes(pattern);
    }
    return pattern.test(prompt);
  }

  /**
   * Вспомогательная функция для задержки
   * @param ms - Миллисекунды
   * @returns Promise<void>
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
