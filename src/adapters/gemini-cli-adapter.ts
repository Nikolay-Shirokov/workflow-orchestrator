/**
 * Gemini CLI-адаптер
 * Адаптер для взаимодействия с Google Gemini через gemini-cli
 */

import { BaseCLIAdapter } from './base-cli-adapter.js';
import {
  AdapterConfig,
  AdapterRequest,
  AdapterResponse,
  StepPermissions,
  StepCapabilities,
  CapabilitySupport
} from '../core/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Расширенный запрос для Gemini CLI с дополнительными опциями
 */
export interface GeminiAdapterRequest extends AdapterRequest {
  // Специфичные для Gemini CLI опции
  allowedTools?: string[];     // Флаг --allowed-tools (список инструментов)
  yolo?: boolean;              // Флаг --yolo (автоподтверждение)
  sandbox?: 'none' | 'functions-only' | 'limited'; // Режим sandbox
}

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
   *
   * Логика работы с permissions:
   * - Без permissions - только чтение (без --yolo и --allowed-tools)
   * - permissions.write - добавляем write_file в --allowed-tools и --yolo
   * - permissions.execute - добавляем shell в --allowed-tools и --yolo
   * - permissions.fullAccess - полный --yolo без ограничений
   *
   * @param request - Запрос к адаптеру
   * @returns string[] - Массив аргументов
   */
  protected prepareArguments(request: AdapterRequest): string[] {
    const geminiRequest = request as GeminiAdapterRequest;
    const args: string[] = [];

    // Добавляем флаг --model если модель указана
    if (request.model) {
      args.push('--model', request.model);
    }

    // Обрабатываем permissions или явные опции
    const permissionArgs = this.mapPermissionsToArgs(request.permissions, geminiRequest);
    args.push(...permissionArgs);

    // Промпт НЕ добавляем в аргументы - он передается через временный файл

    return args;
  }

  /**
   * Маппинг разрешений шага на аргументы командной строки Gemini CLI
   *
   * Правила маппинга:
   * - Без permissions - режим только чтения (без инструментов)
   * - permissions.write -> добавляем write_file в --allowed-tools + --yolo
   * - permissions.execute -> добавляем shell в --allowed-tools + --yolo
   * - permissions.fullAccess -> --yolo без ограничения инструментов
   * - permissions.capabilities -> добавляем соответствующие инструменты
   *
   * ВАЖНО: --yolo никогда не используется по умолчанию для безопасности
   *
   * @param permissions - Разрешения из конфигурации шага
   * @param geminiRequest - Расширенный запрос с явными опциями
   * @returns string[] - Массив аргументов для tools/yolo
   */
  protected mapPermissionsToArgs(
    permissions?: StepPermissions,
    geminiRequest?: GeminiAdapterRequest
  ): string[] {
    const args: string[] = [];

    // Если явно указаны allowedTools в запросе, используем их
    if (geminiRequest?.allowedTools && geminiRequest.allowedTools.length > 0) {
      args.push('--allowed-tools', geminiRequest.allowedTools.join(','));
    }

    // Если явно указан yolo, добавляем флаг
    if (geminiRequest?.yolo) {
      args.push('--yolo');
      return args;
    }

    // Если permissions не указаны и нет capabilities, проверяем только capabilities из запроса
    if (!permissions) {
      // Проверяем capabilities из запроса напрямую
      const capabilities = geminiRequest ? this.mergeCapabilities(geminiRequest) : undefined;
      if (capabilities) {
        const capabilityTools = this.mapCapabilitiesToTools(capabilities);
        if (capabilityTools.length > 0 && (!geminiRequest?.allowedTools || geminiRequest.allowedTools.length === 0)) {
          args.push('--allowed-tools', capabilityTools.join(','));
          args.push('--yolo');
        }
      }
      return args;
    }

    // Валидируем permissions
    this.validatePermissions(permissions);

    // fullAccess - полный доступ без ограничений
    if (permissions.fullAccess) {
      args.push('--yolo');
      return args;
    }

    // Формируем список инструментов на основе permissions и capabilities
    // Если allowedTools уже указаны явно, не добавляем автоматически
    if (!geminiRequest?.allowedTools || geminiRequest.allowedTools.length === 0) {
      const tools: string[] = [];

      // permissions.write - разрешаем инструмент write_file
      if (permissions.write && permissions.write.length > 0) {
        tools.push('write_file');
      }

      // permissions.execute - разрешаем инструмент shell
      if (permissions.execute) {
        tools.push('shell');
      }

      // Добавляем инструменты из capabilities
      const capabilities = geminiRequest ? this.mergeCapabilities(geminiRequest) : undefined;
      if (capabilities) {
        const capabilityTools = this.mapCapabilitiesToTools(capabilities);
        for (const tool of capabilityTools) {
          if (!tools.includes(tool)) {
            tools.push(tool);
          }
        }
      }

      // Добавляем --allowed-tools и --yolo если есть инструменты
      if (tools.length > 0) {
        args.push('--allowed-tools', tools.join(','));
        args.push('--yolo'); // Автоподтверждение только для разрешенных инструментов
      }
    }

    return args;
  }

  /**
   * Выполнение запроса к модели через временный файл для ввода
   * Переопределяем базовый метод для использования временного файла для ввода
   * Если Gemini создает файл через write_file, читаем результат из него
   *
   * При указании outputFile и permissions.write:
   * 1. Добавляется инструкция записи в промпт через appendFileWriteInstruction()
   * 2. Модель использует инструмент write_file для сохранения результата
   * 3. После выполнения читается содержимое файла через readResultFromFile()
   * 4. При неудаче чтения файла используется stdout как fallback
   *
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

      // Определяем путь к выходному файлу
      // Приоритет: явно указанный outputFile > парсинг из промпта (для обратной совместимости)
      let outputFilePath = request.outputFile;

      if (!outputFilePath) {
        // Для обратной совместимости: пытаемся извлечь путь из промпта
        const outputFileMatch = request.prompt.match(/(?:to )?file path:\s*([^\s\n]+\.md)/i);
        if (outputFileMatch) {
          outputFilePath = outputFileMatch[1].replace(/['"]/g, '');
          console.log(`[DEBUG] Обнаружен путь к выходному файлу в промпте: ${outputFilePath}`);
        }
      }

      // Формируем промпт с инструкцией записи если нужно
      let prompt = request.prompt;
      if (outputFilePath && request.permissions?.write?.length) {
        // Добавляем инструкцию записи через метод базового класса
        prompt = this.appendFileWriteInstruction(prompt, outputFilePath, 'write_file');
      }

      // Записываем промпт во входной файл
      await fs.writeFile(tempInputPath, prompt, { encoding: 'utf-8' });

      // Подготовка аргументов команды
      const args = this.prepareArguments(request);

      // Подготовка переменных окружения
      const env = this.prepareEnvironment(request);

      // Определение таймаута
      const timeout = request.timeout || this.config.timeout || 300000;

      // Используем cmd.exe для перенаправления ввода, но читаем stdout напрямую
      // cmd /c "type input.txt | gemini --allowed-tools write_file --yolo"
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

      const executionTime = Date.now() - startTime;

      // Если указан путь к выходному файлу, используем readResultFromFile из базового класса
      let content: string;
      let resultSource: 'file' | 'stdout' = 'stdout';

      if (outputFilePath) {
        const fileResult = await this.readResultFromFile(outputFilePath, result.stdout, {
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
        // Парсинг ответа из stdout
        content = this.parseResponse(result.stdout);
      }

      // Определяем режим permissions для metadata
      let permissionsMode: string;
      if (request.permissions?.fullAccess) {
        permissionsMode = 'yolo';
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
          outputFile: outputFilePath,
          resultSource: resultSource,
          permissionsMode: permissionsMode
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
    if (rawOutput.includes('\n{') || rawOutput.trim().startsWith('{') || rawOutput.trim().startsWith('[')) {
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
            // Формат JSON: { "text": "..." }
            else if (parsed.text) {
              fullContent += parsed.text;
            }
            // Массив кандидатов: [{ "text": "..." }, ...]
            else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].text) {
              fullContent += parsed[0].text;
            }
            // Массив кандидатов: [{ "content": "..." }, ...]
            else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].content) {
              fullContent += parsed[0].content;
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

  // ============================================================================
  // Методы для работы с capabilities
  // ============================================================================

  /**
   * Получение информации о поддержке capabilities для Gemini CLI
   *
   * Gemini CLI поддерживает:
   * - web_search: через инструмент google_web_search
   * - web_fetch: через инструмент web_fetch
   * - mcp_tools: через mcpServers в settings.json, includeTools/excludeTools
   *
   * Не поддерживает:
   * - browser
   *
   * @returns Record<keyof StepCapabilities, CapabilitySupport>
   */
  override getCapabilitySupport(): Record<keyof StepCapabilities, CapabilitySupport> {
    return {
      web_search: {
        supported: true,
        flags: ['--allowed-tools', 'google_web_search'],
        note: 'Добавляет инструмент google_web_search для поиска в интернете'
      },
      web_fetch: {
        supported: true,
        flags: ['--allowed-tools', 'web_fetch'],
        note: 'Добавляет инструмент web_fetch для загрузки веб-страниц'
      },
      mcp_tools: {
        supported: true,
        note: 'MCP настраивается через mcpServers в settings.json или `gemini mcp add`. Контроль через includeTools/excludeTools на уровне сервера'
      },
      browser: {
        supported: false,
        note: 'Gemini CLI не поддерживает интеграцию с браузером'
      }
    };
  }

  /**
   * Преобразование capabilities в список инструментов для Gemini CLI
   *
   * Маппинг:
   * - web_search: true → google_web_search
   * - web_fetch: true → web_fetch
   * - mcp_tools: логируем информацию (настройка через settings.json)
   * - browser: warning (не поддерживается)
   *
   * @param capabilities - Capabilities для преобразования
   * @returns string[] - Список инструментов для --allowed-tools
   */
  protected mapCapabilitiesToTools(capabilities: StepCapabilities): string[] {
    const tools: string[] = [];

    // web_search → google_web_search
    if (capabilities.web_search) {
      tools.push('google_web_search');
      console.log(`[${this.name}] Включен веб-поиск (google_web_search)`);
    }

    // web_fetch → web_fetch
    if (capabilities.web_fetch) {
      tools.push('web_fetch');
      console.log(`[${this.name}] Включена загрузка веб-страниц (web_fetch)`);
    }

    // mcp_tools - просто логируем информацию
    if (capabilities.mcp_tools) {
      if (Array.isArray(capabilities.mcp_tools)) {
        console.log(`[${this.name}] Информация: MCP-инструменты [${capabilities.mcp_tools.join(', ')}] должны быть настроены в settings.json через includeTools/excludeTools`);
      } else {
        console.log(`[${this.name}] Информация: Все MCP-инструменты будут доступны если настроены в settings.json`);
      }
    }

    // browser - предупреждение
    if (capabilities.browser) {
      console.warn(`[${this.name}] Предупреждение: browser не поддерживается Gemini CLI`);
    }

    return tools;
  }

  /**
   * Переопределение базового mapCapabilitiesToArgs
   * Для Gemini мы не возвращаем аргументы напрямую - они объединяются в mapPermissionsToArgs
   */
  protected override mapCapabilitiesToArgs(_capabilities: StepCapabilities): string[] {
    // Возвращаем пустой массив - инструменты добавляются через mapPermissionsToArgs
    return [];
  }
}
