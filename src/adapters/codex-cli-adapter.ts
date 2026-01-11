/**
 * Codex CLI-адаптер
 * Адаптер для взаимодействия с OpenAI через утилиту codex-cli
 */

import { BaseCLIAdapter } from './base-cli-adapter.js';
import { AdapterConfig, AdapterRequest } from '../core/types.js';

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
  input?: any;
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
    // Флаг '-' указывает на чтение промпта из stdin
    const defaultConfig: AdapterConfig = {
      name: 'codex-cli',
      command: 'codex',
      args: [
        'exec',
        '-'
      ],
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
   * @param request - Запрос к адаптеру
   * @returns string[] - Массив аргументов для команды codex
   */
  protected prepareArguments(request: AdapterRequest): string[] {
    const codexRequest = request as CodexAdapterRequest;
    
    // Начинаем с базовой команды exec
    const args: string[] = ['exec'];
    
    // Если указана модель, добавляем флаг -m
    if (codexRequest.model) {
      args.push('-m', codexRequest.model);
    }
    
    // Добавляем флаг --full-auto для автоматического выполнения
    if (codexRequest.fullAuto) {
      args.push('--full-auto');
    }
    
    // Добавляем флаг --sandbox для управления политикой песочницы
    if (codexRequest.sandbox) {
      args.push('--sandbox', codexRequest.sandbox);
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
    
    // Добавляем флаг --search для включения веб-поиска
    if (codexRequest.enableSearch) {
      args.push('--search');
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
    
    // Добавляем флаг '-' для чтения промпта из stdin
    // Это позволяет передавать многострочные промпты безопасно
    args.push('-');
    
    return args;
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
}
