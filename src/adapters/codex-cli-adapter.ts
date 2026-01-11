/**
 * Codex CLI-адаптер
 * Адаптер для взаимодействия с OpenAI через утилиту codex-cli
 */

import { BaseCLIAdapter } from './base-cli-adapter.js';
import { AdapterConfig } from '../core/types.js';

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
}
