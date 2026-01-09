/**
 * Базовый CLI-адаптер
 * Предоставляет общую функциональность для выполнения команд через child_process
 */

import { spawn } from 'child_process';
import {
  CLIAdapter,
  AdapterRequest,
  AdapterResponse,
  AdapterError,
  AdapterConfig
} from '../core/types.js';

/**
 * Результат выполнения команды
 */
interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
}

/**
 * Базовый класс для CLI-адаптеров
 * Предоставляет общую логику выполнения команд и обработки ошибок
 */
export abstract class BaseCLIAdapter implements CLIAdapter {
  abstract name: string;
  abstract version: string;
  
  protected config: AdapterConfig;

  constructor(config: AdapterConfig) {
    this.config = config;
  }

  /**
   * Проверка доступности CLI-утилиты
   * @returns Promise<boolean> - true если утилита доступна
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Пытаемся выполнить команду с флагом --version или --help
      const result = await this.executeCommand(
        this.config.command,
        ['--version'],
        {},
        5000 // 5 секунд таймаут для проверки
      );
      return result.exitCode === 0;
    } catch (error) {
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
      // Подготовка аргументов команды с подстановкой параметров
      const args = this.prepareArguments(request);
      
      // Подготовка переменных окружения
      const env = this.prepareEnvironment(request);
      
      // Определение таймаута
      const timeout = request.timeout || this.config.timeout || 300000; // 5 минут по умолчанию
      
      // Выполнение команды
      const result = await this.executeCommand(
        this.config.command,
        args,
        env,
        timeout
      );
      
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
      throw this.handleError(error as Error);
    }
  }

  /**
   * Парсинг ответа модели
   * Базовая реализация возвращает stdout как есть
   * Переопределите в подклассах для специфичного парсинга
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
    // Определяем, можно ли повторить операцию
    const retryable = this.isRetryableError(error);
    
    return {
      code: this.getErrorCode(error),
      message: error.message,
      retryable,
      originalError: error
    };
  }

  /**
   * Подготовка аргументов команды с подстановкой параметров
   * @param request - Запрос к адаптеру
   * @returns string[] - Массив аргументов
   */
  protected prepareArguments(request: AdapterRequest): string[] {
    if (!this.config.args) {
      return [];
    }
    
    // Создаем контекст для подстановки
    const context: Record<string, string> = {
      prompt: request.prompt,
      model: request.model || '',
      temperature: request.temperature?.toString() || '',
      maxTokens: request.maxTokens?.toString() || '',
      systemPrompt: request.systemPrompt || ''
    };
    
    // Подставляем значения в аргументы
    return this.config.args.map(arg => this.substituteVariables(arg, context));
  }

  /**
   * Подстановка переменных в строку
   * Поддерживает синтаксис ${variable}
   * @param template - Строка с переменными
   * @param context - Контекст для подстановки
   * @returns string - Строка с подставленными значениями
   */
  protected substituteVariables(
    template: string,
    context: Record<string, string>
  ): string {
    return template.replace(/\$\{(\w+)\}/g, (match, varName) => {
      return context[varName] || match;
    });
  }

  /**
   * Подготовка переменных окружения
   * @param request - Запрос к адаптеру
   * @returns Record<string, string> - Переменные окружения
   */
  protected prepareEnvironment(
    request: AdapterRequest
  ): Record<string, string> {
    return {
      ...process.env,
      ...this.config.env,
      ...request.env
    } as Record<string, string>;
  }

  /**
   * Выполнение команды через child_process
   * @param command - Команда для выполнения
   * @param args - Аргументы команды
   * @param env - Переменные окружения
   * @param timeout - Таймаут в миллисекундах
   * @returns Promise<CommandResult> - Результат выполнения
   */
  protected executeCommand(
    command: string,
    args: string[],
    env: Record<string, string>,
    timeout: number
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Запуск процесса
      const child = spawn(command, args, {
        env,
        shell: true,
        windowsHide: true
      });

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
   * Определение, можно ли повторить операцию после ошибки
   * @param error - Ошибка
   * @returns boolean - true если можно повторить
   */
  protected isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    
    // Ошибки сети и таймауты можно повторить
    if (
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('etimedout')
    ) {
      return true;
    }
    
    // Ошибки аутентификации и валидации нельзя повторить
    if (
      message.includes('authentication') ||
      message.includes('unauthorized') ||
      message.includes('invalid')
    ) {
      return false;
    }
    
    return false;
  }

  /**
   * Получение кода ошибки
   * @param error - Ошибка
   * @returns string - Код ошибки
   */
  protected getErrorCode(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout')) {
      return 'ADAPTER_TIMEOUT';
    }
    if (message.includes('not found') || message.includes('enoent')) {
      return 'ADAPTER_NOT_FOUND';
    }
    if (message.includes('authentication') || message.includes('unauthorized')) {
      return 'ADAPTER_AUTH_ERROR';
    }
    if (message.includes('invalid')) {
      return 'ADAPTER_INVALID_REQUEST';
    }
    
    return 'ADAPTER_UNKNOWN_ERROR';
  }
}
