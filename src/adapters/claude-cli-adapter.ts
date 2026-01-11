/**
 * Claude CLI-адаптер
 * Адаптер для взаимодействия с Anthropic Claude через claude-cli
 */

import { BaseCLIAdapter } from './base-cli-adapter.js';
import { AdapterConfig, AdapterRequest } from '../core/types.js';

/**
 * Адаптер для Claude CLI
 * Поддерживает взаимодействие с моделями Claude через консольную утилиту claude-cli
 */
export class ClaudeCLIAdapter extends BaseCLIAdapter {
  name: string = 'claude-cli';
  version: string = '1.0.0';

  constructor(config?: Partial<AdapterConfig>) {
    // Конфигурация по умолчанию для Claude CLI
    // Используем режим печати (-p) для неинтерактивного выполнения
    const defaultConfig: AdapterConfig = {
      name: 'claude-cli',
      command: 'claude',
      args: [
        '-p',
        '${prompt}'
      ],
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || ''
      },
      parser: 'markdown',
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
   * Подготовка аргументов команды с подстановкой параметров
   * Переопределяем для добавления флага --model если модель указана
   * @param request - Запрос к адаптеру
   * @returns string[] - Массив аргументов
   */
  protected prepareArguments(request: AdapterRequest): string[] {
    const args: string[] = ['-p'];
    
    // Добавляем флаг --model если модель указана
    if (request.model) {
      args.push('--model', request.model);
    }
    
    // Добавляем промпт в конце
    args.push(request.prompt);
    
    return args;
  }

  /**
   * Переопределяем executeCommand для закрытия stdin
   * Claude CLI может ждать ввода, если stdin открыт
   */
  protected executeCommand(
    command: string,
    args: string[],
    env: Record<string, string>,
    timeout: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Импортируем spawn
      const { spawn } = require('child_process');

      // Запуск процесса
      const child = spawn(command, args, {
        env,
        shell: true,
        windowsHide: true
      });

      // ВАЖНО: Закрываем stdin сразу после запуска
      // Это предотвращает ожидание ввода от Claude CLI
      if (child.stdin) {
        child.stdin.end();
      }

      // Таймер для таймаута
      const timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        
        // Если процесс не завершился через 5 секунд, убиваем принудительно
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      // Захват stdout
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      // Захват stderr
      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Обработка завершения процесса
      child.on('close', (exitCode: number | null) => {
        clearTimeout(timeoutId);
        const executionTime = Date.now() - startTime;

        if (timedOut) {
          reject(new Error(
            `Команда превысила таймаут ${timeout}мс. ` +
            `stdout: ${stdout.substring(0, 500)}, ` +
            `stderr: ${stderr.substring(0, 500)}`
          ));
          return;
        }

        resolve({
          stdout,
          stderr,
          exitCode: exitCode ?? -1,
          executionTime
        });
      });

      // Обработка ошибок запуска процесса
      child.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        reject(new Error(
          `Не удалось запустить команду "${command}": ${error.message}`
        ));
      });
    });
  }

  /**
   * Парсинг ответа от Claude CLI
   * Claude CLI возвращает ответ в формате Markdown
   * @param rawOutput - Сырой вывод от CLI
   * @returns string - Распарсенный контент
   */
  parseResponse(rawOutput: string): string {
    // Claude CLI обычно возвращает чистый текст ответа
    // Удаляем лишние пробелы и переносы строк в начале и конце
    let content = rawOutput.trim();

    // Если вывод содержит метаданные или служебную информацию,
    // пытаемся извлечь только контент ответа
    // Claude CLI может добавлять префиксы типа "Assistant:" или подобные
    const assistantPrefixes = [
      'Assistant:',
      'Claude:',
      'Response:',
      'Output:'
    ];

    for (const prefix of assistantPrefixes) {
      if (content.startsWith(prefix)) {
        content = content.substring(prefix.length).trim();
        break;
      }
    }

    return content;
  }

  /**
   * Проверка доступности Claude CLI
   * Проверяет наличие утилиты через выполнение команды --version
   * Примечание: API ключ не обязателен, так как claude-cli может быть
   * авторизован на уровне машины/пользователя
   * @returns Promise<boolean> - true если утилита доступна
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Проверяем доступность команды
      // Не требуем обязательного наличия API ключа, так как
      // claude-cli может использовать авторизацию на уровне системы
      return await super.isAvailable();
    } catch (error) {
      return false;
    }
  }
}
