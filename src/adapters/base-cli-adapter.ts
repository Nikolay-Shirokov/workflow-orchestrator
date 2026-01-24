/**
 * Базовый CLI-адаптер
 * Предоставляет общую функциональность для выполнения команд через child_process
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import {
  CLIAdapter,
  AdapterRequest,
  AdapterResponse,
  AdapterError,
  AdapterConfig,
  StepPermissions,
  StepCapabilities,
  CapabilitySupport
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
      
      // Выполнение команды (с stdin если useStdin=true)
      const result = await this.executeCommand(
        this.config.command,
        args,
        env,
        timeout,
        this.config.useStdin ? request.prompt : undefined
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
    const args: string[] = [];

    if (this.config.args) {
      // Создаем контекст для подстановки
      const context: Record<string, string> = {
        prompt: request.prompt,
        model: request.model || '',
        temperature: request.temperature?.toString() || '',
        maxTokens: request.maxTokens?.toString() || '',
        systemPrompt: request.systemPrompt || ''
      };

      // Подставляем значения в аргументы
      args.push(...this.config.args.map(arg => this.substituteVariables(arg, context)));
    }

    // Добавляем аргументы из capabilities
    const capabilities = this.mergeCapabilities(request);
    if (capabilities) {
      const capabilityArgs = this.mapCapabilitiesToArgs(capabilities);
      args.push(...capabilityArgs);
    }

    return args;
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
   * @param stdinData - Данные для передачи через stdin (опционально)
   * @returns Promise<CommandResult> - Результат выполнения
   */
  protected executeCommand(
    command: string,
    args: string[],
    env: Record<string, string>,
    timeout: number,
    stdinData?: string
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

      // Устанавливаем кодировку для потоков
      if (child.stdout) {
        child.stdout.setEncoding('utf8');
      }
      if (child.stderr) {
        child.stderr.setEncoding('utf8');
      }

      // Если нужно передать данные через stdin
      if (stdinData && child.stdin) {
        child.stdin.write(stdinData, 'utf8');
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
      child.stdout?.on('data', (data: string) => {
        stdout += data;
      });

      // Захват stderr
      child.stderr?.on('data', (data: string) => {
        stderr += data;
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

        // Логируем размер полученного вывода для отладки
        if (stdout.length > 0) {
          console.log(`[DEBUG] Получено ${stdout.length} байт из stdout`);
        }
        if (stderr.length > 0) {
          console.log(`[DEBUG] Получено ${stderr.length} байт из stderr`);
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

  // ============================================================================
  // Методы для работы с файловым выводом и разрешениями
  // ============================================================================

  /**
   * Добавление инструкции записи в файл в конец промпта
   * @param prompt - Исходный промпт
   * @param outputPath - Путь к выходному файлу
   * @param toolName - Имя инструмента записи (write_file для Gemini, Write для Claude)
   * @returns string - Промпт с добавленной инструкцией
   */
  protected appendFileWriteInstruction(
    prompt: string,
    outputPath: string,
    toolName?: string
  ): string {
    const instruction = toolName
      ? `\n\nCRITICAL: Save your complete response to file: ${outputPath}
Use the ${toolName} tool to write the file.
If the ${toolName} tool is not available, output the full response to console.
Note: The file path is relative to the current working directory.`
      : `\n\nCRITICAL: Save your complete response to file: ${outputPath}
If you cannot write to file, output the full response to console.
Note: The file path is relative to the current working directory.`;

    return prompt + instruction;
  }

  /**
   * Чтение результата из файла с fallback на stdout
   * Использует polling с таймаутом для ожидания создания файла
   * @param outputPath - Путь к выходному файлу
   * @param stdout - Вывод из stdout (fallback)
   * @param options - Опции чтения
   * @returns Promise<{ content: string; source: 'file' | 'stdout' }>
   */
  protected async readResultFromFile(
    outputPath: string,
    stdout: string,
    options: { maxWaitTime?: number; pollInterval?: number } = {}
  ): Promise<{ content: string; source: 'file' | 'stdout' }> {
    const maxWaitTime = options.maxWaitTime ?? 5000;
    const pollInterval = options.pollInterval ?? 200;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const stat = await fs.stat(outputPath);
        if (stat.size > 0) {
          const content = await fs.readFile(outputPath, 'utf-8');
          if (content.trim().length > 0) {
            console.log(`[DEBUG] Прочитано ${content.length} байт из файла ${outputPath}`);
            return { content: content.trim(), source: 'file' };
          }
        }
      } catch {
        // Файл еще не создан, продолжаем polling
      }

      await new Promise(r => setTimeout(r, pollInterval));
    }

    // Fallback на stdout
    console.log(`[DEBUG] Файл ${outputPath} не найден или пуст, используем stdout`);
    return { content: stdout.trim(), source: 'stdout' };
  }

  /**
   * Валидация разрешений
   * Проверяет корректность конфигурации permissions
   * @param permissions - Разрешения для валидации
   * @throws Error если permissions некорректны
   */
  protected validatePermissions(permissions: StepPermissions): void {
    // fullAccess нельзя комбинировать с read/write
    if (permissions.fullAccess && (permissions.read?.length || permissions.write?.length)) {
      throw new Error('fullAccess нельзя комбинировать с read/write. Используйте либо fullAccess, либо явные разрешения.');
    }

    // Проверка паттернов на path traversal
    const allPatterns = [...(permissions.read || []), ...(permissions.write || [])];
    for (const pattern of allPatterns) {
      if (pattern.includes('..')) {
        throw new Error(`Недопустимый паттерн "${pattern}": path traversal (..) запрещен`);
      }
    }
  }

  // ============================================================================
  // Методы для работы с capabilities
  // ============================================================================

  /**
   * Получение информации о поддержке capabilities данным адаптером
   * Базовая реализация возвращает все capabilities как неподдерживаемые
   * Переопределите в подклассах для реальной поддержки
   * @returns Record<keyof StepCapabilities, CapabilitySupport>
   */
  getCapabilitySupport(): Record<keyof StepCapabilities, CapabilitySupport> {
    return {
      web_search: { supported: false, note: 'Не поддерживается данным адаптером' },
      web_fetch: { supported: false, note: 'Не поддерживается данным адаптером' },
      mcp_tools: { supported: false, note: 'Не поддерживается данным адаптером' },
      browser: { supported: false, note: 'Не поддерживается данным адаптером' }
    };
  }

  /**
   * Преобразование capabilities в аргументы командной строки
   * Базовая реализация логирует предупреждения о неподдерживаемых capabilities
   * Переопределите в подклассах для реального маппинга
   * @param capabilities - Capabilities для преобразования
   * @returns string[] - Массив аргументов командной строки
   */
  protected mapCapabilitiesToArgs(capabilities: StepCapabilities): string[] {
    const support = this.getCapabilitySupport();
    const args: string[] = [];

    // Логируем предупреждения о неподдерживаемых capabilities
    if (capabilities.web_search && !support.web_search.supported) {
      console.warn(`[${this.name}] Предупреждение: web_search не поддерживается данным адаптером`);
    }
    if (capabilities.web_fetch && !support.web_fetch.supported) {
      console.warn(`[${this.name}] Предупреждение: web_fetch не поддерживается данным адаптером`);
    }
    if (capabilities.mcp_tools && !support.mcp_tools.supported) {
      console.warn(`[${this.name}] Предупреждение: mcp_tools не поддерживается данным адаптером`);
    }
    if (capabilities.browser && !support.browser.supported) {
      console.warn(`[${this.name}] Предупреждение: browser не поддерживается данным адаптером`);
    }

    return args;
  }

  /**
   * Объединение capabilities из разных источников
   * Приоритет: request.capabilities > request.permissions.capabilities
   * @param request - Запрос к адаптеру
   * @returns StepCapabilities | undefined
   */
  protected mergeCapabilities(request: AdapterRequest): StepCapabilities | undefined {
    const fromPermissions = request.permissions?.capabilities;
    const fromRequest = request.capabilities;

    if (!fromPermissions && !fromRequest) {
      return undefined;
    }

    // Merge с приоритетом request.capabilities
    return {
      ...fromPermissions,
      ...fromRequest
    };
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
