/**
 * Реестр CLI-адаптеров
 * Управляет регистрацией и доступом к CLI-адаптерам
 */

import { CLIAdapter, AdapterRegistry as IAdapterRegistry, AdapterConfig } from '../core/types.js';
import { OpenAICompatibleAdapter, OpenAICompatibleConfig } from './openai-compatible-adapter.js';
import { ClaudeCLIAdapter } from './claude-cli-adapter.js';
import { OpenAICLIAdapter } from './openai-cli-adapter.js';
import { GeminiCLIAdapter } from './gemini-cli-adapter.js';
import { CodexCLIAdapter } from './codex-cli-adapter.js';

/**
 * Реализация реестра адаптеров
 */
export class AdapterRegistry implements IAdapterRegistry {
  /** Хранилище адаптеров: имя -> адаптер */
  private adapters: Map<string, CLIAdapter> = new Map();

  /**
   * Регистрация адаптера в реестре
   * @param adapter - CLI-адаптер для регистрации
   * @throws Error если адаптер с таким именем уже зарегистрирован
   */
  register(adapter: CLIAdapter): void {
    if (this.adapters.has(adapter.name)) {
      throw new Error(
        `Адаптер с именем "${adapter.name}" уже зарегистрирован. ` +
        `Используйте другое имя или удалите существующий адаптер.`
      );
    }
    
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Получение адаптера по имени
   * @param name - Имя адаптера
   * @returns CLIAdapter | undefined - Адаптер или undefined если не найден
   */
  get(name: string): CLIAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Проверка наличия адаптера в реестре
   * @param name - Имя адаптера
   * @returns boolean - true если адаптер зарегистрирован
   */
  has(name: string): boolean {
    return this.adapters.has(name);
  }

  /**
   * Получение всех зарегистрированных адаптеров
   * @returns CLIAdapter[] - Массив всех адаптеров
   */
  getAll(): CLIAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Удаление адаптера из реестра
   * @param name - Имя адаптера для удаления
   * @returns boolean - true если адаптер был удален
   */
  unregister(name: string): boolean {
    return this.adapters.delete(name);
  }

  /**
   * Очистка всех адаптеров из реестра
   */
  clear(): void {
    this.adapters.clear();
  }

  /**
   * Получение количества зарегистрированных адаптеров
   * @returns number - Количество адаптеров
   */
  size(): number {
    return this.adapters.size;
  }

  /**
   * Создание адаптера из конфигурации
   * @param config - Конфигурация адаптера из YAML
   * @returns CLIAdapter - Созданный адаптер
   * @throws Error если тип адаптера не поддерживается
   */
  createFromConfig(config: Partial<AdapterConfig> & { name: string; type?: string; baseUrl?: string; apiKey?: string; defaultModel?: string; headers?: Record<string, string> }): CLIAdapter {
    const type = config.type || this.inferTypeFromName(config.name);

    switch (type) {
      case 'openai-compatible': {
        // Создание OpenAI-совместимого адаптера
        const openaiConfig: Partial<OpenAICompatibleConfig> = {
          name: config.name,
          baseUrl: config.baseUrl || 'http://localhost:1234/v1',
          apiKey: config.apiKey,
          defaultModel: config.defaultModel,
          timeout: config.timeout,
          headers: config.headers
        };
        return new OpenAICompatibleAdapter(openaiConfig);
      }

      case 'claude-cli': {
        // Создание Claude CLI адаптера
        return new ClaudeCLIAdapter({
          command: config.command,
          args: config.args,
          env: config.env,
          timeout: config.timeout
        });
      }

      case 'openai-cli': {
        // Создание OpenAI CLI адаптера
        return new OpenAICLIAdapter({
          command: config.command,
          args: config.args,
          env: config.env,
          timeout: config.timeout
        });
      }

      case 'gemini-cli': {
        // Создание Gemini CLI адаптера
        return new GeminiCLIAdapter({
          command: config.command,
          args: config.args,
          env: config.env,
          timeout: config.timeout
        });
      }

      case 'codex-cli': {
        // Создание Codex CLI адаптера
        return new CodexCLIAdapter({
          command: config.command,
          args: config.args,
          env: config.env,
          timeout: config.timeout
        });
      }

      default:
        throw new Error(
          `Неподдерживаемый тип адаптера: "${type}". ` +
          `Поддерживаемые типы: openai-compatible, claude-cli, openai-cli, gemini-cli, codex-cli`
        );
    }
  }

  /**
   * Определение типа адаптера по имени (для обратной совместимости)
   * @param name - Имя адаптера
   * @returns string - Тип адаптера
   */
  private inferTypeFromName(name: string): string {
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('claude')) {
      return 'claude-cli';
    }
    if (lowerName.includes('openai') && !lowerName.includes('compatible')) {
      return 'openai-cli';
    }
    if (lowerName.includes('gemini')) {
      return 'gemini-cli';
    }
    if (lowerName.includes('codex')) {
      return 'codex-cli';
    }
    if (lowerName.includes('lm-studio') || lowerName.includes('localai') || lowerName.includes('ollama')) {
      return 'openai-compatible';
    }
    
    // По умолчанию предполагаем OpenAI-совместимый адаптер
    return 'openai-compatible';
  }

  /**
   * Регистрация адаптеров из массива конфигураций
   * @param configs - Массив конфигураций адаптеров
   */
  registerFromConfigs(configs: Array<Partial<AdapterConfig> & { name: string; type?: string; baseUrl?: string; apiKey?: string; defaultModel?: string; headers?: Record<string, string> }>): void {
    for (const config of configs) {
      const adapter = this.createFromConfig(config);
      this.register(adapter);
    }
  }
}
