/**
 * OpenAI CLI-адаптер
 * Адаптер для взаимодействия с OpenAI через openai-cli
 */

import { BaseCLIAdapter } from './base-cli-adapter.js';
import { AdapterConfig } from '../core/types.js';

/**
 * Адаптер для OpenAI CLI
 * Поддерживает взаимодействие с моделями GPT через консольную утилиту openai-cli
 */
export class OpenAICLIAdapter extends BaseCLIAdapter {
  name: string = 'openai-cli';
  version: string = '1.0.0';

  constructor(config?: Partial<AdapterConfig>) {
    // Конфигурация по умолчанию для OpenAI CLI
    const defaultConfig: AdapterConfig = {
      name: 'openai-cli',
      command: 'openai',
      args: [
        'api',
        'chat.completions.create',
        '-m',
        '${model}',
        '-g',
        'user',
        '${prompt}'
      ],
      env: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || ''
      },
      parser: 'json',
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
   * Парсинг ответа от OpenAI CLI
   * OpenAI CLI возвращает ответ в формате JSON
   * @param rawOutput - Сырой вывод от CLI
   * @returns string - Распарсенный контент
   */
  parseResponse(rawOutput: string): string {
    try {
      // OpenAI CLI возвращает JSON с структурой:
      // {
      //   "choices": [
      //     {
      //       "message": {
      //         "content": "текст ответа",
      //         "role": "assistant"
      //       }
      //     }
      //   ]
      // }
      
      const trimmedOutput = rawOutput.trim();
      
      // Пытаемся распарсить JSON
      const response = JSON.parse(trimmedOutput);
      
      // Извлекаем контент из структуры ответа
      if (response.choices && 
          Array.isArray(response.choices) && 
          response.choices.length > 0) {
        const firstChoice = response.choices[0];
        
        if (firstChoice.message && firstChoice.message.content) {
          return firstChoice.message.content.trim();
        }
      }
      
      // Если структура не соответствует ожидаемой, возвращаем как есть
      console.warn('Неожиданная структура ответа от OpenAI CLI');
      return trimmedOutput;
      
    } catch (error) {
      // Если не удалось распарсить JSON, возвращаем как есть
      console.warn('Не удалось распарсить JSON ответ от OpenAI CLI:', error);
      return rawOutput.trim();
    }
  }

  /**
   * Проверка доступности OpenAI CLI
   * Проверяет наличие утилиты и валидность API ключа
   * @returns Promise<boolean> - true если утилита доступна
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Проверяем наличие API ключа
      const apiKey = this.config.env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.warn('OPENAI_API_KEY не установлен в переменных окружения');
        return false;
      }

      // Проверяем доступность команды
      return await super.isAvailable();
    } catch (error) {
      return false;
    }
  }
}
