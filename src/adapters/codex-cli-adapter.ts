/**
 * Codex CLI-адаптер
 * Адаптер для взаимодействия с OpenAI через утилиту codex-cli
 */

import { BaseCLIAdapter } from './base-cli-adapter.js';
import {
  AdapterConfig,
  AdapterRequest,
  StepPermissions,
  AdapterResponse,
  StepCapabilities,
  CapabilitySupport
} from '../core/types.js';
import { spawn } from 'child_process';

/**
 * Расширенный запрос для Codex CLI с дополнительными опциями
 */
export interface CodexAdapterRequest extends AdapterRequest {
  // Специфичные для Codex CLI опции
  fullAuto?: boolean;        // Флаг --full-auto
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  workingDirectory?: string; // Флаг --cd
  profile?: string;          // Флаг -p
  enableSearch?: boolean;    // Флаг --search
  jsonOutput?: boolean;      // Флаг --json
  outputFile?: string;       // Флаг --output-last-message
  colorMode?: 'always' | 'never' | 'auto'; // Флаг --color
  configOverrides?: Record<string, string>; // Флаг -c
  
  // Для возобновления сессий
  resumeSession?: string;    // ID сессии для возобновления
  resumeLast?: boolean;      // Флаг --last
}

/**
 * Структура события в JSONL-выводе Codex CLI
 */
interface JSONLEvent {
  type: 'status' | 'tool_use' | 'message' | 'error';
  message?: string;
  role?: 'user' | 'assistant';
  content?: string;
  tool?: string;
  input?: unknown;
  timestamp?: string;
}

/**
 * Адаптер для Codex CLI
 * Поддерживает взаимодействие с моделями OpenAI через консольную утилиту codex-cli
 * Использует неинтерактивный режим exec для выполнения запросов
 */
export class CodexCLIAdapter extends BaseCLIAdapter {
  name: string = 'codex-cli';
  version: string = '1.0.0';

  constructor(config?: Partial<AdapterConfig>) {
    // Конфигурация по умолчанию для Codex CLI
    // Используем команду exec для неинтерактивного выполнения
    // Промпт будет передан как аргумент командной строки
    const defaultConfig: AdapterConfig = {
      name: 'codex-cli',
      command: 'codex',
      args: ['exec'], // Базовая команда, промпт добавится динамически
      env: {},
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
   * Подготовка аргументов команды для Codex CLI
   * Формирует массив аргументов с учетом всех опций запроса
   * ВАЖНО: Промпт НЕ добавляется в аргументы, он будет передан через stdin
   * @param request - Запрос к адаптеру
   * @returns string[] - Массив аргументов для команды codex
   */
  protected prepareArguments(request: AdapterRequest): string[] {
    const codexRequest = request as CodexAdapterRequest;
    
    // Начинаем с базовой команды exec
    const args: string[] = ['exec'];
    
    // Если указан resumeSession или resumeLast, формируем команду resume
    if (codexRequest.resumeSession || codexRequest.resumeLast) {
      args.push('resume');
      
      // Если указан ID сессии, добавляем его
      if (codexRequest.resumeSession) {
        args.push(codexRequest.resumeSession);
      }
      
      // Если указан флаг --last, добавляем его
      if (codexRequest.resumeLast) {
        args.push('--last');
      }
    }
    
    // Если указана модель, добавляем флаг -m
    if (codexRequest.model) {
      args.push('-m', codexRequest.model);
    }
    
    // Добавляем флаг --full-auto для автоматического выполнения
    if (codexRequest.fullAuto) {
      args.push('--full-auto');
    }

    // Добавляем флаг --sandbox для управления политикой песочницы
    // Приоритет: явно указанный sandbox > permissions > read-only по умолчанию
    if (codexRequest.sandbox) {
      // Явно указанный sandbox имеет приоритет
      args.push('--sandbox', codexRequest.sandbox);
    } else if (codexRequest.permissions) {
      // Используем permissions для определения режима sandbox
      const permissionArgs = this.mapPermissionsToArgs(codexRequest.permissions);
      args.push(...permissionArgs);
    } else {
      // По умолчанию - безопасный режим read-only
      args.push('--sandbox', 'read-only');
    }
    
    // Добавляем флаг --cd для установки рабочей директории
    if (codexRequest.workingDirectory) {
      args.push('--cd', codexRequest.workingDirectory);
    }
    
    // Добавляем флаг -p для выбора профиля
    if (codexRequest.profile) {
      args.push('-p', codexRequest.profile);
    }
    
    // Добавляем флаг --color для управления ANSI-цветами
    if (codexRequest.colorMode) {
      args.push('--color', codexRequest.colorMode);
    }
    
    // --search не поддерживается в exec режиме
    if (codexRequest.enableSearch) {
      console.warn(`[${this.name}] Предупреждение: enableSearch не работает в режиме exec (--search только для интерактивного режима)`);
    }

    // Добавляем аргументы из capabilities
    const capabilities = this.mergeCapabilities(codexRequest);
    if (capabilities) {
      const capabilityArgs = this.mapCapabilitiesToArgs(capabilities);
      // Добавляем только если --search ещё не добавлен
      for (const arg of capabilityArgs) {
        if (!args.includes(arg)) {
          args.push(arg);
        }
      }
    }
    
    // Добавляем флаг --json для получения вывода в формате JSONL
    if (codexRequest.jsonOutput) {
      args.push('--json');
    }
    
    // Добавляем флаг --output-last-message для сохранения финального сообщения
    if (codexRequest.outputFile) {
      args.push('--output-last-message', codexRequest.outputFile);
    }
    
    // Добавляем конфигурационные переопределения через флаг -c
    if (codexRequest.configOverrides) {
      for (const [key, value] of Object.entries(codexRequest.configOverrides)) {
        args.push('-c', `${key}=${value}`);
      }
    }
    
    // Добавляем "-" для чтения промпта из stdin
    // Это решает проблему с кириллицей в аргументах командной строки
    args.push('-');
    
    return args;
  }

  /**
   * Выполнение запроса к Codex CLI
   * Переопределяет базовый метод для передачи промпта через stdin
   * Это решает проблему с кириллицей в аргументах командной строки Windows
   *
   * При указании outputFile:
   * 1. Добавляется флаг --output-last-message для сохранения результата в файл
   * 2. После выполнения читается содержимое файла
   * 3. При неудаче чтения файла используется stdout как fallback
   *
   * @param request - Запрос к адаптеру
   * @returns Promise<AdapterResponse> - Ответ от модели
   */
  async execute(request: AdapterRequest): Promise<AdapterResponse> {
    const codexRequest = request as CodexAdapterRequest;
    const startTime = Date.now();

    try {
      // Подготавливаем аргументы (включая "-" для stdin)
      const args = this.prepareArguments(request);

      // Подготавливаем переменные окружения
      const env = this.prepareEnvironment(request);

      // Определяем таймаут
      const timeout = request.timeout || this.config.timeout || 300000;

      // Выполняем команду с передачей промпта через stdin
      const result = await this.executeCommandWithStdin(
        this.config.command,
        args,
        env,
        timeout,
        codexRequest.prompt
      );

      // Проверяем код выхода
      if (result.exitCode !== 0) {
        throw new Error(`Команда завершилась с кодом ${result.exitCode}. stderr: ${result.stderr}`);
      }

      const executionTime = Date.now() - startTime;

      // Определяем путь к файлу с результатом
      const outputFile = codexRequest.outputFile || request.outputFile;

      // Если указан outputFile, пытаемся прочитать результат из файла
      let content: string;
      let resultSource: 'file' | 'stdout' = 'stdout';

      if (outputFile) {
        const fileResult = await this.readOutputFile(outputFile, result.stdout);
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

      // Определяем sandbox режим для metadata
      let sandboxMode: string | undefined;
      if (codexRequest.sandbox) {
        sandboxMode = codexRequest.sandbox;
      } else if (codexRequest.permissions?.fullAccess) {
        sandboxMode = 'full-access';
      } else if (codexRequest.permissions?.execute) {
        sandboxMode = 'workspace-write';
      } else if (codexRequest.permissions?.write?.length) {
        sandboxMode = 'workspace-write';
      } else {
        sandboxMode = 'read-only';
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
          sandboxMode: sandboxMode
        }
      };

    } catch (error) {
      // Обрабатываем ошибку через handleError
      throw this.handleError(error as Error);
    }
  }

  /**
   * Выполнение команды с передачей данных через stdin
   * @param command - Команда для выполнения
   * @param args - Аргументы команды
   * @param env - Переменные окружения
   * @param timeout - Таймаут в миллисекундах
   * @param stdinData - Данные для передачи через stdin
   * @returns Promise<CommandResult> - Результат выполнения
   */
  private executeCommandWithStdin(
    command: string,
    args: string[],
    env: Record<string, string>,
    timeout: number,
    stdinData: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number; executionTime: number }> {
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

      // Передаем данные через stdin
      child.stdin.write(stdinData, 'utf8');
      child.stdin.end();

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
   * Парсинг ответа от Codex CLI
   * Поддерживает два режима: JSON (JSONL) и текстовый
   * @param rawOutput - Сырой вывод от CLI
   * @returns string - Распарсенный контент ответа ассистента
   */
  parseResponse(rawOutput: string): string {
    // Пытаемся распарсить как JSON (JSONL формат)
    try {
      return this.parseJSONResponse(rawOutput);
    } catch (jsonError) {
      // Если не получилось распарсить как JSON, пробуем текстовый режим
      return this.parseTextResponse(rawOutput);
    }
  }

  /**
   * Парсинг JSON-вывода (JSONL формат)
   * Извлекает финальное сообщение ассистента из потока событий
   * @param rawOutput - Сырой вывод в формате JSONL
   * @returns string - Контент последнего сообщения ассистента
   */
  private parseJSONResponse(rawOutput: string): string {
    // Разбиваем вывод по строкам
    const lines = rawOutput.trim().split('\n');
    
    // Собираем все сообщения ассистента
    const assistantMessages: string[] = [];
    
    for (const line of lines) {
      // Пропускаем пустые строки
      if (!line.trim()) {
        continue;
      }
      
      try {
        // Парсим строку как JSON
        const event = JSON.parse(line) as JSONLEvent;
        
        // Фильтруем события типа 'message' с ролью 'assistant'
        if (event.type === 'message' && event.role === 'assistant' && event.content) {
          assistantMessages.push(event.content);
        }
      } catch (parseError) {
        // Если строка не является валидным JSON, пропускаем её
        continue;
      }
    }
    
    // Если нашли сообщения ассистента, возвращаем последнее
    if (assistantMessages.length > 0) {
      return assistantMessages[assistantMessages.length - 1];
    }
    
    // Если не нашли сообщений ассистента, выбрасываем ошибку
    throw new Error('Не найдено сообщений ассистента в JSON-выводе');
  }

  /**
   * Парсинг текстового вывода
   * Извлекает финальное сообщение ассистента из форматированного текста
   * @param rawOutput - Сырой текстовый вывод
   * @returns string - Чистый текст ответа ассистента
   */
  private parseTextResponse(rawOutput: string): string {
    // Удаляем ANSI escape-коды
    let cleanOutput = this.removeANSICodes(rawOutput);
    
    // Ищем финальное сообщение ассистента
    // Обычно оно идет после маркеров типа "Assistant response:", "Assistant:", или просто в конце
    const assistantMarkers = [
      'Assistant response:',
      'Assistant:',
      'Response:',
      '---' // Разделитель в некоторых форматах
    ];
    
    let lastMarkerIndex = -1;
    let usedMarker = '';
    
    for (const marker of assistantMarkers) {
      const index = cleanOutput.lastIndexOf(marker);
      if (index > lastMarkerIndex) {
        lastMarkerIndex = index;
        usedMarker = marker;
      }
    }
    
    // Если нашли маркер, извлекаем текст после него
    if (lastMarkerIndex !== -1) {
      cleanOutput = cleanOutput.substring(lastMarkerIndex + usedMarker.length);
    }
    
    // Удаляем служебные префиксы и метаданные
    // Например, строки вида "[Tool: bash]", "[Status: ...]", и т.д.
    // Но только если они в начале строки и содержат двоеточие
    cleanOutput = cleanOutput.replace(/^\[.*?:.*?\].*$/gm, '');
    
    // Удаляем лишние пустые строки
    cleanOutput = cleanOutput.replace(/\n{3,}/g, '\n\n');
    
    // Возвращаем очищенный текст
    return cleanOutput.trim();
  }

  /**
   * Удаление ANSI escape-кодов из текста
   * @param text - Текст с ANSI-кодами
   * @returns string - Текст без ANSI-кодов
   */
  private removeANSICodes(text: string): string {
    // Регулярное выражение для удаления ANSI escape-кодов
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }

  /**
   * Обработка ошибок выполнения
   * Переопределяет базовый метод для специфичной обработки ошибок Codex CLI
   * @param error - Ошибка выполнения
   * @returns AdapterError - Структурированная ошибка с кодом и флагом retryable
   */
  handleError(error: Error): import('../core/types.js').AdapterError {
    const message = error.message.toLowerCase();
    
    // Определяем тип ошибки по сообщению
    let code: string;
    let retryable: boolean;
    
    // Проверяем на ошибку "не найдено" (утилита не установлена)
    if (message.includes('not found') || message.includes('enoent')) {
      code = 'ADAPTER_NOT_FOUND';
      retryable = false;
    } 
    // Проверяем на ошибку аутентификации
    else if (message.includes('authentication') || 
             message.includes('unauthorized') || 
             message.includes('auth') ||
             message.includes('api key')) {
      code = 'ADAPTER_AUTH_ERROR';
      retryable = false;
    } 
    // Проверяем на ошибку таймаута
    else if (message.includes('timeout') || 
             message.includes('timed out')) {
      code = 'ADAPTER_TIMEOUT';
      retryable = true;
    } 
    // Проверяем на ошибку валидации
    else if (message.includes('invalid')) {
      code = 'ADAPTER_INVALID_REQUEST';
      retryable = false;
    } 
    // Все остальные ошибки
    else {
      code = 'ADAPTER_UNKNOWN_ERROR';
      retryable = false;
    }
    
    // Извлекаем stderr из сообщения об ошибке, если он там есть
    // Базовый класс уже включает stderr в сообщение при ошибке выполнения
    // Если в сообщении есть stderr, он уже включен базовым классом
    // Мы просто возвращаем полное сообщение
    
    return {
      code,
      message: error.message,
      retryable,
      originalError: error
    };
  }

  /**
   * Проверка доступности Codex CLI
   * Выполняет команду `codex --version` с таймаутом 5 секунд
   * @returns Promise<boolean> - true если утилита доступна, false в противном случае
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Выполняем команду codex --version с таймаутом 5 секунд
      const result = await this.executeCommand(
        this.config.command,
        ['--version'],
        {},
        5000 // 5 секунд таймаут для проверки
      );

      // Возвращаем true если команда выполнилась успешно (exitCode = 0)
      return result.exitCode === 0;
    } catch (error) {
      // Если произошла любая ошибка (команда не найдена, таймаут, и т.д.),
      // возвращаем false
      return false;
    }
  }

  // ============================================================================
  // Методы для работы с разрешениями и файловым выводом
  // ============================================================================

  /**
   * Маппинг разрешений шага на аргументы командной строки Codex CLI
   *
   * Правила маппинга:
   * - Без permissions или пустые permissions -> --sandbox read-only (безопасный режим)
   * - permissions.write указан -> --sandbox workspace-write (ограниченная запись)
   * - permissions.execute=true -> --full-auto (выполнение shell-команд)
   * - permissions.fullAccess=true -> (без --sandbox, полный доступ, только при явном указании)
   *
   * ВАЖНО: --yolo никогда не используется по умолчанию для безопасности
   *
   * @param permissions - Разрешения из конфигурации шага
   * @returns string[] - Массив аргументов для sandbox/execution режима
   */
  protected mapPermissionsToArgs(permissions?: StepPermissions): string[] {
    // Если permissions не указаны, используем безопасный режим read-only
    if (!permissions) {
      return ['--sandbox', 'read-only'];
    }

    // Валидируем permissions перед использованием
    this.validatePermissions(permissions);

    const args: string[] = [];

    // fullAccess - полный доступ (не добавляем --sandbox, но требует явного указания)
    // ВАЖНО: fullAccess=true означает отсутствие sandbox, но НЕ означает --yolo
    if (permissions.fullAccess) {
      // Не добавляем --sandbox, модель работает без ограничений
      // Но --yolo НЕ добавляется для безопасности
      return args;
    }

    // execute=true - разрешено выполнение shell-команд
    if (permissions.execute) {
      args.push('--full-auto');
      // При execute=true также нужен workspace-write для записи файлов
      args.push('--sandbox', 'workspace-write');
      return args;
    }

    // write указан - разрешена запись в указанные паттерны
    if (permissions.write && permissions.write.length > 0) {
      args.push('--sandbox', 'workspace-write');
      return args;
    }

    // read-only по умолчанию (только чтение)
    args.push('--sandbox', 'read-only');
    return args;
  }

  /**
   * Чтение результата из файла --output-last-message
   * Использует polling с таймаутом для ожидания создания файла
   *
   * @param outputPath - Путь к файлу с результатом
   * @param stdout - Вывод stdout (fallback)
   * @returns Promise<{ content: string; source: 'file' | 'stdout' }>
   */
  protected async readOutputFile(
    outputPath: string,
    stdout: string
  ): Promise<{ content: string; source: 'file' | 'stdout' }> {
    // Используем метод из базового класса с настройками по умолчанию
    return this.readResultFromFile(outputPath, stdout, {
      maxWaitTime: 5000,
      pollInterval: 200
    });
  }

  // ============================================================================
  // Методы для работы с capabilities
  // ============================================================================

  /**
   * Получение информации о поддержке capabilities для Codex CLI
   *
   * Codex CLI поддерживает:
   * - web_search: через флаг --search
   * - mcp_tools: автоматически доступны если настроены через `codex mcp add`
   *
   * Не поддерживает:
   * - web_fetch
   * - browser
   *
   * @returns Record<keyof StepCapabilities, CapabilitySupport>
   */
  override getCapabilitySupport(): Record<keyof StepCapabilities, CapabilitySupport> {
    return {
      web_search: {
        supported: false,
        flags: [],
        note: 'Codex exec не поддерживает --search (только интерактивный режим)'
      },
      web_fetch: {
        supported: false,
        note: 'Codex CLI не поддерживает загрузку веб-страниц'
      },
      mcp_tools: {
        supported: true,
        note: 'MCP доступен автоматически если настроен через `codex mcp add`. Нет возможности ограничить инструменты во время exec'
      },
      browser: {
        supported: false,
        note: 'Codex CLI не поддерживает интеграцию с браузером'
      }
    };
  }

  /**
   * Преобразование capabilities в аргументы командной строки Codex CLI
   *
   * Маппинг:
   * - web_search: warning (не поддерживается в exec режиме)
   * - mcp_tools: true → логируем что MCP доступен (настройка через codex mcp)
   * - web_fetch: warning (не поддерживается)
   * - browser: warning (не поддерживается)
   *
   * @param capabilities - Capabilities для преобразования
   * @returns string[] - Массив аргументов командной строки
   */
  protected override mapCapabilitiesToArgs(capabilities: StepCapabilities): string[] {
    const args: string[] = [];

    // web_search - не поддерживается в exec режиме
    if (capabilities.web_search) {
      console.warn(`[${this.name}] Предупреждение: web_search не поддерживается в режиме exec (--search работает только в интерактивном режиме)`);
    }

    // mcp_tools - просто логируем информацию
    if (capabilities.mcp_tools) {
      if (Array.isArray(capabilities.mcp_tools)) {
        console.log(`[${this.name}] Информация: MCP-инструменты [${capabilities.mcp_tools.join(', ')}] будут доступны если настроены через 'codex mcp add'. Codex CLI не позволяет ограничить инструменты во время exec`);
      } else {
        console.log(`[${this.name}] Информация: Все MCP-инструменты будут доступны если настроены через 'codex mcp add'`);
      }
    }

    // web_fetch - предупреждение
    if (capabilities.web_fetch) {
      console.warn(`[${this.name}] Предупреждение: web_fetch не поддерживается Codex CLI`);
    }

    // browser - предупреждение
    if (capabilities.browser) {
      console.warn(`[${this.name}] Предупреждение: browser не поддерживается Codex CLI`);
    }

    return args;
  }
}
