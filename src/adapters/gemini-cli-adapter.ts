/**
 * Gemini CLI-адаптер
 * Адаптер для взаимодействия с Google Gemini через gemini-cli
 */

import { BaseCLIAdapter } from './base-cli-adapter.js';
import { AdapterConfig } from '../core/types.js';

/**
 * Адаптер для Gemini CLI
 * Поддерживает взаимодействие с моделями Gemini через консольную утилиту gemini-cli
 */
export class GeminiCLIAdapter extends BaseCLIAdapter {
  name: string = 'gemini-cli';
  version: string = '1.0.0';

  constructor(config?: Partial<AdapterConfig>) {
    // Конфигурация по умолчанию для Gemini CLI
    const defaultConfig: AdapterConfig = {
      name: 'gemini-cli',
      command: 'gemini',
      args: [
        'generate',
        '--model=${model}',
        '--prompt=${prompt}'
      ],
      env: {
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || ''
      },
      parser: 'text',
      timeout: 300000 // 5 минут
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
   * Парсинг ответа от Gemini CLI
   * Gemini CLI возвращает ответ в текстовом формате
   * @param rawOutput - Сырой вывод от CLI
   * @returns string - Распарсенный контент
   */
  parseResponse(rawOutput: string): string {
    // Gemini CLI обычно возвращает чистый текст ответа
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

    // Gemini CLI может возвращать JSON в некоторых случаях
    // Пытаемся распарсить, если это JSON
    if (content.startsWith('{') || content.startsWith('[')) {
      try {
        const parsed = JSON.parse(content);
        
        // Если это объект с полем text или content, извлекаем его
        if (parsed.text) {
          return parsed.text.trim();
        }
        if (parsed.content) {
          return parsed.content.trim();
        }
        
        // Если это массив кандидатов (candidates), берем первый
        if (Array.isArray(parsed) && parsed.length > 0) {
          const first = parsed[0];
          if (first.text) {
            return first.text.trim();
          }
          if (first.content) {
            return first.content.trim();
          }
        }
        
        // Если структура не распознана, возвращаем как есть
        return content;
      } catch (error) {
        // Если не удалось распарсить, возвращаем как текст
        return content;
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
