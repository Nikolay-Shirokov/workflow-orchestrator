/**
 * Gemini CLI-адаптер
 * Адаптер для взаимодействия с Google Gemini через gemini-cli
 */

import { BaseCLIAdapter } from './base-cli-adapter.js';
import { AdapterConfig, AdapterRequest } from '../core/types.js';

/**
 * Адаптер для Gemini CLI
 * Поддерживает взаимодействие с моделями Gemini через консольную утилиту gemini-cli
 */
export class GeminiCLIAdapter extends BaseCLIAdapter {
  name: string = 'gemini-cli';
  version: string = '1.0.0';

  constructor(config?: Partial<AdapterConfig>) {
    // Конфигурация по умолчанию для Gemini CLI
    // Используем stdin для передачи промпта
    const defaultConfig: AdapterConfig = {
      name: 'gemini-cli',
      command: 'gemini',
      args: [], // Без дополнительных флагов
      env: {
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || ''
      },
      parser: 'text',
      timeout: 300000, // 5 минут
      useStdin: true // Используем stdin для передачи промпта
    };

    // Объединяем конфигурацию по умолчанию с переданной
    const mergedConfig: AdapterConfig = {
      ...defaultConfig,
      ...config,
      env: {
        ...defaultConfig.env,
        ...config?.env
      }
    };

    super(mergedConfig);
  }

  /**
   * Подготовка аргументов команды с подстановкой параметров
   * Переопределяем для добавления флага --model если модель указана
   * Промпт НЕ добавляется в аргументы - он передается через stdin
   * @param request - Запрос к адаптеру
   * @returns string[] - Массив аргументов
   */
  protected prepareArguments(request: AdapterRequest): string[] {
    const args: string[] = []; // Без флагов - чистый текстовый режим
    
    // Добавляем флаг --model если модель указана
    if (request.model) {
      args.push('--model', request.model);
    }
    
    // Промпт НЕ добавляем в аргументы - он передается через stdin
    
    return args;
  }

  /**
   * Парсинг ответа от Gemini CLI
   * Gemini CLI возвращает ответ в текстовом или JSON формате
   * @param rawOutput - Сырой вывод от CLI
   * @returns string - Распарсенный контент
   */
  parseResponse(rawOutput: string): string {
    // Пытаемся распарсить как JSON (если используется --output-format json)
    if (rawOutput.trim().startsWith('{') || rawOutput.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(rawOutput);
        
        // Формат JSON от Gemini CLI: { "content": "...", "model": "...", ... }
        if (parsed.content) {
          return parsed.content.trim();
        }
        
        // Если это массив сообщений
        if (Array.isArray(parsed) && parsed.length > 0) {
          const lastMessage = parsed[parsed.length - 1];
          if (lastMessage.content) {
            return lastMessage.content.trim();
          }
        }
        
        // Если структура не распознана, возвращаем как есть
        return rawOutput.trim();
      } catch (error) {
        // Если не удалось распарсить JSON, обрабатываем как текст
      }
    }
    
    // Обработка текстового формата
    let content = rawOutput.trim();

    // Удаляем возможные служебные префиксы
    const prefixes = [
      'Response:',
      'Output:',
      'Generated:',
      'Gemini:'
    ];

    for (const prefix of prefixes) {
      if (content.startsWith(prefix)) {
        content = content.substring(prefix.length).trim();
        break;
      }
    }

    return content;
  }

  /**
   * Проверка доступности Gemini CLI
   * Проверяет наличие утилиты через выполнение команды --version
   * Примечание: API ключ не обязателен, так как gemini-cli может быть
   * авторизован на уровне машины/пользователя
   * @returns Promise<boolean> - true если утилита доступна
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Проверяем доступность команды
      // Не требуем обязательного наличия API ключа, так как
      // gemini-cli может использовать авторизацию на уровне системы
      return await super.isAvailable();
    } catch (error) {
      return false;
    }
  }
}
