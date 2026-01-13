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
      useStdin: false // НЕ используем stdin - будем передавать через временный файл
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
    // Используем stream-json формат для получения полного вывода
    const args: string[] = ['--output-format', 'stream-json'];
    
    // Добавляем флаг --model если модель указана
    if (request.model) {
      args.push('--model', request.model);
    }
    
    // Промпт НЕ добавляем в аргументы - он передается через временный файл
    
    return args;
  }

  /**
   * Выполнение запроса к модели через временный файл для ввода
   * Переопределяем базовый метод для использования временного файла для ввода
   * Вывод читаем напрямую из stdout процесса
   * @param request - Запрос к адаптеру
   * @returns Promise<AdapterResponse> - Ответ от модели
   */
  async execute(request: AdapterRequest): Promise<AdapterResponse> {
    const startTime = Date.now();
    let tempInputPath: string | undefined;
    
    try {
      // Создаем временный файл для ввода
      const tmpDir = os.tmpdir();
      const timestamp = Date.now();
      tempInputPath = path.join(tmpDir, `gemini-prompt-${timestamp}.txt`);
      
      // Записываем промпт во входной файл
      await fs.writeFile(tempInputPath, request.prompt, { encoding: 'utf-8' });
      
      // Подготовка аргументов команды
      const args = this.prepareArguments(request);
      
      // Подготовка переменных окружения
      const env = this.prepareEnvironment(request);
      
      // Определение таймаута
      const timeout = request.timeout || this.config.timeout || 300000;
      
      // Используем cmd.exe для перенаправления ввода, но читаем stdout напрямую
      // cmd /c "type input.txt | gemini --output-format stream-json"
      const command = process.platform === 'win32'
        ? `cmd /c "type "${tempInputPath}" | ${this.config.command} ${args.join(' ')}"`
        : `cat "${tempInputPath}" | ${this.config.command} ${args.join(' ')}`;
      
      const result = await this.executeCommand(
        command,
        [],
        env,
        timeout
      );
      
      // Удаляем временный файл
      try {
        await fs.unlink(tempInputPath);
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
      if (tempInputPath) {
        try {
          await fs.unlink(tempInputPath);
        } catch (cleanupError) {
          // Игнорируем ошибки удаления
        }
      }
      throw this.handleError(error as Error);
    }
  }

  /**
   * Парсинг ответа от Gemini CLI
   * Gemini CLI возвращает ответ в текстовом, JSON или stream-json формате
   * @param rawOutput - Сырой вывод от CLI
   * @returns string - Распарсенный контент
   */
  parseResponse(rawOutput: string): string {
    // Обработка stream-json формата (несколько JSON объектов построчно)
    if (rawOutput.includes('\n{') || rawOutput.trim().startsWith('{')) {
      try {
        // Разбиваем на строки и парсим каждую как JSON
        const lines = rawOutput.trim().split('\n');
        let fullContent = '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const parsed = JSON.parse(line);
            
            // Формат stream-json: { "type": "content", "content": "..." }
            if (parsed.type === 'content' && parsed.content) {
              fullContent += parsed.content;
            }
            // Формат JSON: { "content": "...", "model": "...", ... }
            else if (parsed.content) {
              fullContent += parsed.content;
            }
          } catch (lineError) {
            // Пропускаем строки, которые не являются JSON
            continue;
          }
        }
        
        if (fullContent) {
          return fullContent.trim();
        }
      } catch (error) {
        // Если не удалось распарсить, обрабатываем как текст
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
