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
}
