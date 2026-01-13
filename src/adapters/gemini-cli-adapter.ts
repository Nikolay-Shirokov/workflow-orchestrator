/**
 * Gemini CLI-адаптер
 * Адаптер для взаимодействия с Google Gemini через gemini-cli
 */

import { BaseCLIAdapter } from './base-cli-adapter.js';
import { AdapterConfig, AdapterRequest, AdapterResponse } from '../core/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Адаптер для Gemini CLI
 * Поддерживает взаимодействие с моделями Gemini через консольную утилиту gemini-cli
 */
export class GeminiCLIAdapter extends BaseCLIAdapter {
  name: string = 'gemini-cli';
  version: string = '1.0.0';

  constructor(config?: Partial<AdapterConfig>) {
    // Конфигурация по умолчанию для Gemini CLI
    // НЕ используем stdin из-за проблем с обрезанием вывода в Windows
    const defaultConfig: AdapterConfig = {
      name: 'gemini-cli',
      command: 'gemini',
      args: [],
      env: {
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || ''
      },
      parser: 'text',
      timeout: 300000, // 5 минут
      useStdin: false // НЕ используем stdin - будем передавать через аргументы
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
   * Промпт НЕ добавляется в аргументы - он передается через временный файл
   * @param request - Запрос к адаптеру
   * @returns string[] - Массив аргументов
   */
  protected prepareArguments(request: AdapterRequest): string[] {
    const args: string[] = [];
    
    // Добавляем флаг --model если модель указана
    if (request.model) {
      args.push('--model', request.model);
    }
    
    // Промпт НЕ добавляем в аргументы - он передается через временный файл
    
    return args;
  }

  /**
   * Выполнение запроса к модели через временный файл
   * Переопределяем базовый метод для использования временного файла вместо stdin
   * Это решает проблему с обрезанием длинных ответов в Windows
   * @param request - Запрос к адаптеру
   * @returns Promise<AdapterResponse> - Ответ от модели
   */
  async execute(request: AdapterRequest): Promise<AdapterResponse> {
    const startTime = Date.now();
    let tempFilePath: string | undefined;
    
    try {
      // Создаем временный файл с промптом
      const tmpDir = os.tmpdir();
      tempFilePath = path.join(tmpDir, `gemini-prompt-${Date.now()}.txt`);
      await fs.writeFile(tempFilePath, request.prompt, { encoding: 'utf-8' });
      
      // Подготовка аргументов команды
      const args = this.prepareArguments(request);
      
      // Подготовка переменных окружения
      const env = this.prepareEnvironment(request);
      
      // Определение таймаута
      const timeout = request.timeout || this.config.timeout || 300000;
      
      // Выполнение команды с перенаправлением из файла
      // Используем PowerShell для перенаправления: Get-Content file | gemini
      // Добавляем --yolo для отключения интерактивности и инструментов
      const command = process.platform === 'win32' 
        ? `powershell -Command "Get-Content '${tempFilePath}' | ${this.config.command} --yolo ${args.join(' ')}"`
        : `cat "${tempFilePath}" | ${this.config.command} --yolo ${args.join(' ')}`;
      
      const result = await this.executeCommand(
        command,
        [],
        env,
        timeout
      );
      
      // Удаляем временный файл
      try {
        await fs.unlink(tempFilePath);
      } catch (cleanupError) {
        // Игнорируем ошибки удаления
      }
      
      // Проверка на ошибки
      if (result.exitCode !== 0) {
        throw new Error(
          `Команда завершилась с кодом ${result.exitCode}. ` +
          `stderr: ${result.stderr}`
        );
      }
      
      // Парсинг ответа
      const content = this.parseResponse(result.stdout);
      
      const executionTime = Date.now() - startTime;
      
      return {
        content,
        model: request.model || 'unknown',
        executionTime,
        metadata: {
          exitCode: result.exitCode,
          stderr: result.stderr
        }
      };
    } catch (error) {
      // Удаляем временный файл в случае ошибки
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
        } catch (cleanupError) {
          // Игнорируем ошибки удаления
        }
      }
      throw this.handleError(error as Error);
    }
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
