/**
 * Claude CLI-адаптер
 * Адаптер для взаимодействия с Anthropic Claude через claude-cli
 */

import { BaseCLIAdapter } from './base-cli-adapter.js';
import { AdapterConfig, AdapterRequest, StepPermissions, AdapterResponse } from '../core/types.js';

/**
 * Расширенный запрос для Claude CLI с дополнительными опциями
 */
export interface ClaudeAdapterRequest extends AdapterRequest {
  // Специфичные для Claude CLI опции
  tools?: string[];            // Флаг --tools (список инструментов)
  allowedTools?: string[];     // Флаг --allowedTools (разрешенные без подтверждения)
  disabledTools?: string[];    // Флаг --disabledTools
  skipPermissions?: boolean;   // Флаг --dangerously-skip-permissions
  outputFormat?: 'text' | 'json' | 'stream-json'; // Флаг --output-format
}

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
   *
   * Логика работы с permissions:
   * - Без permissions - базовый режим (только чтение)
   * - permissions.write - добавляем Write в --tools и --allowedTools
   * - permissions.execute - добавляем Bash в --tools и --allowedTools
   * - permissions.fullAccess - добавляем --dangerously-skip-permissions
   *
   * @param request - Запрос к адаптеру
   * @returns string[] - Массив аргументов
   */
  protected prepareArguments(request: AdapterRequest): string[] {
    const claudeRequest = request as ClaudeAdapterRequest;
    const args: string[] = ['-p'];

    // Добавляем флаг --model если модель указана
    if (request.model) {
      args.push('--model', request.model);
    }

    // Добавляем флаг --output-format если указан
    if (claudeRequest.outputFormat) {
      args.push('--output-format', claudeRequest.outputFormat);
    }

    // Обрабатываем permissions если указаны
    const permissionArgs = this.mapPermissionsToArgs(request.permissions, claudeRequest);
    args.push(...permissionArgs);

    // Добавляем инструкцию записи в файл если outputFile указан
    let prompt = request.prompt;
    if (request.outputFile && request.permissions?.write?.length) {
      prompt = this.appendFileWriteInstruction(prompt, request.outputFile, 'Write');
    }

    // Добавляем промпт в конце
    args.push(prompt);

    return args;
  }

  /**
   * Маппинг разрешений шага на аргументы командной строки Claude CLI
   *
   * Правила маппинга:
   * - Базовые инструменты чтения: Read, Grep, Glob (всегда доступны)
   * - permissions.write -> добавляем Write в --tools и --allowedTools
   * - permissions.execute -> добавляем Bash в --tools и --allowedTools
   * - permissions.fullAccess -> добавляем --dangerously-skip-permissions
   *
   * ВАЖНО: --dangerously-skip-permissions никогда не используется по умолчанию
   *
   * @param permissions - Разрешения из конфигурации шага
   * @param claudeRequest - Расширенный запрос с явными опциями
   * @returns string[] - Массив аргументов для tools/permissions
   */
  protected mapPermissionsToArgs(
    permissions?: StepPermissions,
    claudeRequest?: ClaudeAdapterRequest
  ): string[] {
    const args: string[] = [];

    // Если явно указаны tools в запросе, используем их
    if (claudeRequest?.tools && claudeRequest.tools.length > 0) {
      args.push('--tools', claudeRequest.tools.join(','));
    }

    // Если явно указаны allowedTools в запросе, используем их
    if (claudeRequest?.allowedTools && claudeRequest.allowedTools.length > 0) {
      args.push('--allowedTools', claudeRequest.allowedTools.join(','));
    }

    // Если явно указаны disabledTools в запросе, используем их
    if (claudeRequest?.disabledTools && claudeRequest.disabledTools.length > 0) {
      args.push('--disabledTools', claudeRequest.disabledTools.join(','));
    }

    // Если явно указан skipPermissions, добавляем флаг
    if (claudeRequest?.skipPermissions) {
      args.push('--dangerously-skip-permissions');
      return args;
    }

    // Если permissions не указаны и нет явных tools, возвращаем пустой массив
    if (!permissions) {
      return args;
    }

    // Валидируем permissions
    this.validatePermissions(permissions);

    // fullAccess - полный доступ без ограничений
    if (permissions.fullAccess) {
      args.push('--dangerously-skip-permissions');
      return args;
    }

    // Формируем списки инструментов на основе permissions
    // Если tools уже указаны явно, не добавляем автоматически
    if (!claudeRequest?.tools || claudeRequest.tools.length === 0) {
      const tools: string[] = ['Read', 'Grep', 'Glob']; // Базовые инструменты чтения
      const allowedTools: string[] = [];

      // permissions.write - разрешаем инструмент Write
      if (permissions.write && permissions.write.length > 0) {
        tools.push('Write');
        allowedTools.push('Write');
      }

      // permissions.execute - разрешаем инструмент Bash
      if (permissions.execute) {
        tools.push('Bash');
        allowedTools.push('Bash');
      }

      // Добавляем --tools если есть инструменты
      if (tools.length > 0) {
        args.push('--tools', tools.join(','));
      }

      // Добавляем --allowedTools если есть разрешенные без подтверждения
      if (allowedTools.length > 0) {
        args.push('--allowedTools', allowedTools.join(','));
      }
    }

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

  /**
   * Выполнение запроса к Claude CLI
   * Переопределяет базовый метод для поддержки файлового вывода
   *
   * При указании outputFile и permissions.write:
   * 1. Добавляется инструкция записи в промпт
   * 2. Модель использует инструмент Write для сохранения результата
   * 3. После выполнения читается содержимое файла
   * 4. При неудаче чтения файла используется stdout как fallback
   *
   * @param request - Запрос к адаптеру
   * @returns Promise<AdapterResponse> - Ответ от модели
   */
  async execute(request: AdapterRequest): Promise<AdapterResponse> {
    const claudeRequest = request as ClaudeAdapterRequest;
    const startTime = Date.now();

    try {
      // Подготавливаем аргументы (включая инструкцию записи в файл)
      const args = this.prepareArguments(request);

      // Подготавливаем переменные окружения
      const env = this.prepareEnvironment(request);

      // Определяем таймаут
      const timeout = request.timeout || this.config.timeout || 300000;

      // Выполняем команду
      const result = await this.executeCommand(
        this.config.command,
        args,
        env,
        timeout
      );

      // Проверяем код выхода
      if (result.exitCode !== 0) {
        throw new Error(`Команда завершилась с кодом ${result.exitCode}. stderr: ${result.stderr}`);
      }

      const executionTime = Date.now() - startTime;

      // Определяем путь к файлу с результатом
      const outputFile = request.outputFile;

      // Если указан outputFile и есть разрешение на запись, пытаемся прочитать из файла
      let content: string;
      let resultSource: 'file' | 'stdout' = 'stdout';

      if (outputFile && request.permissions?.write?.length) {
        const fileResult = await this.readResultFromFile(outputFile, result.stdout, {
          maxWaitTime: 5000,
          pollInterval: 200
        });
        content = fileResult.content;
        resultSource = fileResult.source;

        // Если контент пустой после чтения файла, используем парсинг stdout
        if (!content || content.trim().length === 0) {
          content = this.parseResponse(result.stdout);
          resultSource = 'stdout';
        }
      } else {
        // Парсим ответ из stdout
        content = this.parseResponse(result.stdout);
      }

      // Определяем режим permissions для metadata
      let permissionsMode: string;
      if (claudeRequest.skipPermissions || request.permissions?.fullAccess) {
        permissionsMode = 'skip-permissions';
      } else if (request.permissions?.execute) {
        permissionsMode = 'execute';
      } else if (request.permissions?.write?.length) {
        permissionsMode = 'write';
      } else {
        permissionsMode = 'read-only';
      }

      return {
        content,
        model: request.model || 'unknown',
        executionTime,
        metadata: {
          exitCode: result.exitCode,
          stderr: result.stderr,
          outputFile: outputFile,
          resultSource: resultSource,
          permissionsMode: permissionsMode
        }
      };

    } catch (error) {
      throw this.handleError(error as Error);
    }
  }
}
