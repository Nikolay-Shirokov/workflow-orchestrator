/**
 * Claude CLI-адаптер
 * Адаптер для взаимодействия с Anthropic Claude через claude-cli
 */

import { spawn } from 'child_process';
import { BaseCLIAdapter } from './base-cli-adapter.js';
import {
  AdapterConfig,
  AdapterRequest,
  StepPermissions,
  AdapterResponse,
  StepCapabilities,
  CapabilitySupport
} from '../core/types.js';

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
   * ВАЖНО: Промпт передаётся через stdin, а не как аргумент командной строки,
   * чтобы корректно обрабатывать многострочные промпты.
   *
   * @param request - Запрос к адаптеру
   * @returns string[] - Массив аргументов (без промпта)
   */
  protected prepareArguments(request: AdapterRequest): string[] {
    const claudeRequest = request as ClaudeAdapterRequest;
    const args: string[] = ['--print'];

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

    // Промпт НЕ добавляется в args - он передаётся через stdin в executeCommand

    return args;
  }

  /**
   * Подготовка промпта для передачи через stdin
   * @param request - Запрос к адаптеру
   * @returns string - Подготовленный промпт
   */
  protected preparePrompt(request: AdapterRequest): string {
    let prompt = request.prompt;

    // Добавляем инструкцию записи в файл если outputFile указан
    if (request.outputFile && request.permissions?.write?.length) {
      prompt = this.appendFileWriteInstruction(prompt, request.outputFile, 'Write');
    }

    return prompt;
  }

  /**
   * Маппинг разрешений шага на аргументы командной строки Claude CLI
   *
   * Правила маппинга:
   * - Базовые инструменты чтения: Read, Grep, Glob (всегда доступны)
   * - permissions.write -> добавляем Write в --tools и --allowedTools
   * - permissions.execute -> добавляем Bash в --tools и --allowedTools
   * - permissions.fullAccess -> добавляем --dangerously-skip-permissions
   * - permissions.capabilities -> добавляем соответствующие инструменты
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

    // Валидируем permissions если указаны
    if (permissions) {
      this.validatePermissions(permissions);

      // fullAccess - полный доступ без ограничений
      if (permissions.fullAccess) {
        args.push('--dangerously-skip-permissions');
        return args;
      }
    }

    // Формируем списки инструментов на основе permissions и capabilities
    // Если tools уже указаны явно, не добавляем автоматически
    if (!claudeRequest?.tools || claudeRequest.tools.length === 0) {
      const tools: string[] = ['Read', 'Grep', 'Glob']; // Базовые инструменты чтения
      const allowedTools: string[] = [];

      // permissions.write - разрешаем инструмент Write
      if (permissions?.write && permissions.write.length > 0) {
        tools.push('Write');
        allowedTools.push('Write');
      }

      // permissions.execute - разрешаем инструмент Bash
      if (permissions?.execute) {
        tools.push('Bash');
        allowedTools.push('Bash');
      }

      // Добавляем инструменты из capabilities (обрабатываем независимо от permissions)
      const capabilities = claudeRequest ? this.mergeCapabilities(claudeRequest) : undefined;
      if (capabilities) {
        const capabilityResult = this.mapCapabilitiesToToolsAndFlags(capabilities);

        // Добавляем tools из capabilities (без дубликатов)
        for (const tool of capabilityResult.tools) {
          if (!tools.includes(tool)) {
            tools.push(tool);
          }
        }

        // Добавляем allowedTools из capabilities (без дубликатов)
        for (const tool of capabilityResult.allowedTools) {
          if (!allowedTools.includes(tool)) {
            allowedTools.push(tool);
          }
        }

        // Добавляем флаги из capabilities (--chrome и т.д.)
        args.push(...capabilityResult.flags);
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
   * Переопределяем executeCommand для передачи промпта через stdin
   * Claude CLI принимает промпт через stdin при использовании --print
   */
  protected executeCommandWithStdin(
    command: string,
    args: string[],
    env: Record<string, string>,
    timeout: number,
    stdinData: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Запуск процесса с shell: true для корректной работы на Windows
      const child = spawn(command, args, {
        env,
        shell: true,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Передаём промпт через stdin и закрываем поток
      if (child.stdin) {
        child.stdin.write(stdinData);
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

    // Очищаем markdown code blocks если есть
    content = this.stripMarkdownCodeBlocks(content);

    return content;
  }

  // ============================================================================
  // Методы для работы с capabilities
  // ============================================================================

  /**
   * Получение информации о поддержке capabilities для Claude CLI
   *
   * Claude CLI поддерживает:
   * - web_search: через инструмент WebSearch
   * - web_fetch: через инструмент WebFetch
   * - mcp_tools: через --tools и --allowedTools
   * - browser: через флаг --chrome
   *
   * @returns Record<keyof StepCapabilities, CapabilitySupport>
   */
  override getCapabilitySupport(): Record<keyof StepCapabilities, CapabilitySupport> {
    return {
      web_search: {
        supported: true,
        flags: ['--tools', 'WebSearch', '--allowedTools', 'WebSearch'],
        note: 'Добавляет инструмент WebSearch для поиска в интернете'
      },
      web_fetch: {
        supported: true,
        flags: ['--tools', 'WebFetch', '--allowedTools', 'WebFetch'],
        note: 'Добавляет инструмент WebFetch для загрузки веб-страниц'
      },
      mcp_tools: {
        supported: true,
        flags: ['--tools', '--allowedTools'],
        note: 'MCP-серверы настраиваются через --mcp-config или глобальную конфигурацию'
      },
      browser: {
        supported: true,
        flags: ['--chrome'],
        note: 'Включает интеграцию с Chrome для взаимодействия с веб-страницами'
      }
    };
  }

  /**
   * Преобразование capabilities в аргументы командной строки Claude CLI
   *
   * Маппинг:
   * - web_search: true → WebSearch в tools/allowedTools
   * - web_fetch: true → WebFetch в tools/allowedTools
   * - browser: true → --chrome
   * - mcp_tools: true → не ограничивать MCP-инструменты
   * - mcp_tools: ["tool1"] → добавить в allowedTools
   *
   * @param capabilities - Capabilities для преобразования
   * @returns { tools: string[], allowedTools: string[], flags: string[] }
   */
  protected mapCapabilitiesToToolsAndFlags(capabilities: StepCapabilities): {
    tools: string[];
    allowedTools: string[];
    flags: string[];
  } {
    const tools: string[] = [];
    const allowedTools: string[] = [];
    const flags: string[] = [];

    // web_search → WebSearch инструмент
    if (capabilities.web_search) {
      tools.push('WebSearch');
      allowedTools.push('WebSearch');
      console.log(`[${this.name}] Включен веб-поиск (WebSearch)`);
    }

    // web_fetch → WebFetch инструмент
    if (capabilities.web_fetch) {
      tools.push('WebFetch');
      allowedTools.push('WebFetch');
      console.log(`[${this.name}] Включена загрузка веб-страниц (WebFetch)`);
    }

    // browser → --chrome
    if (capabilities.browser) {
      flags.push('--chrome');
      console.log(`[${this.name}] Включена интеграция с браузером (--chrome)`);
    }

    // mcp_tools обрабатывается особым образом
    if (capabilities.mcp_tools) {
      if (Array.isArray(capabilities.mcp_tools)) {
        // Конкретный список MCP-инструментов → добавляем в allowedTools
        allowedTools.push(...capabilities.mcp_tools);
        console.log(`[${this.name}] Разрешены MCP-инструменты: ${capabilities.mcp_tools.join(', ')}`);
      } else {
        // mcp_tools: true → все MCP-инструменты разрешены (не добавляем ограничения)
        console.log(`[${this.name}] Все MCP-инструменты разрешены`);
      }
    }

    return { tools, allowedTools, flags };
  }

  /**
   * Переопределение базового mapCapabilitiesToArgs
   * Возвращает только флаги (--chrome), tools обрабатываются в mapPermissionsToArgs
   */
  protected override mapCapabilitiesToArgs(capabilities: StepCapabilities): string[] {
    const { flags } = this.mapCapabilitiesToToolsAndFlags(capabilities);
    return flags;
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
      // Подготавливаем аргументы (без промпта - он передаётся через stdin)
      const args = this.prepareArguments(request);

      // Подготавливаем промпт для передачи через stdin
      const prompt = this.preparePrompt(request);

      // Подготавливаем переменные окружения
      const env = this.prepareEnvironment(request);

      // Определяем таймаут
      const timeout = request.timeout || this.config.timeout || 300000;

      // DEBUG: Log the command
      console.log('[claude-cli] Command:', this.config.command, args.join(' '));
      console.log('[claude-cli] Prompt length:', prompt.length, 'chars');

      // Выполняем команду с передачей промпта через stdin
      const result = await this.executeCommandWithStdin(
        this.config.command,
        args,
        env,
        timeout,
        prompt
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
