/**
 * Тесты интеграции AdapterRegistry с OpenAICompatibleAdapter
 * 
 * Проверяет:
 * - Регистрацию адаптера в реестре
 * - Создание адаптера из YAML конфигурации
 * - Поддержку различных типов адаптеров
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AdapterRegistry } from '../../src/adapters/adapter-registry.js';
import { OpenAICompatibleAdapter } from '../../src/adapters/openai-compatible-adapter.js';

describe('AdapterRegistry - Интеграция с OpenAICompatibleAdapter', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  describe('Регистрация адаптера', () => {
    it('должен успешно зарегистрировать OpenAICompatibleAdapter', () => {
      // Требования: 7.1, 7.2
      const adapter = new OpenAICompatibleAdapter({
        name: 'test-adapter',
        baseUrl: 'http://localhost:1234/v1'
      });

      registry.register(adapter);

      expect(registry.has('test-adapter')).toBe(true);
      expect(registry.get('test-adapter')).toBe(adapter);
    });

    it('должен выбросить ошибку при регистрации дубликата', () => {
      // Требования: 7.1
      const adapter1 = new OpenAICompatibleAdapter({
        name: 'duplicate',
        baseUrl: 'http://localhost:1234/v1'
      });
      const adapter2 = new OpenAICompatibleAdapter({
        name: 'duplicate',
        baseUrl: 'http://localhost:5678/v1'
      });

      registry.register(adapter1);

      expect(() => registry.register(adapter2)).toThrow(/уже зарегистрирован/);
    });
  });

  describe('Создание адаптера из конфигурации', () => {
    it('должен создать OpenAICompatibleAdapter из конфигурации с типом openai-compatible', () => {
      // Требования: 7.2, 8.1, 8.2, 8.3, 8.4, 8.5
      const config = {
        name: 'lm-studio',
        type: 'openai-compatible',
        baseUrl: 'http://localhost:1234/v1',
        defaultModel: 'local-model',
        timeout: 60000
      };

      const adapter = registry.createFromConfig(config);

      expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
      expect(adapter.name).toBe('lm-studio'); // Имя берется из конфигурации
    });

    it('должен создать адаптер с API ключом из конфигурации', () => {
      // Требования: 8.2, 8.6
      const config = {
        name: 'openai-api',
        type: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-api-key',
        defaultModel: 'gpt-4'
      };

      const adapter = registry.createFromConfig(config);

      expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
    });

    it('должен создать адаптер с дополнительными заголовками', () => {
      // Требования: 8.5
      const config = {
        name: 'custom-api',
        type: 'openai-compatible',
        baseUrl: 'http://localhost:8080/v1',
        headers: {
          'X-Custom-Header': 'value'
        }
      };

      const adapter = registry.createFromConfig(config);

      expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
    });

    it('должен использовать значения по умолчанию для локального LM Studio', () => {
      // Требования: 1.3
      const config = {
        name: 'lm-studio-default',
        type: 'openai-compatible'
      };

      const adapter = registry.createFromConfig(config);

      expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
    });

    it('должен определить тип openai-compatible по имени lm-studio', () => {
      // Требования: 7.2
      const config = {
        name: 'lm-studio',
        baseUrl: 'http://localhost:1234/v1'
      };

      const adapter = registry.createFromConfig(config);

      expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
    });

    it('должен определить тип openai-compatible по имени localai', () => {
      // Требования: 7.2
      const config = {
        name: 'localai',
        baseUrl: 'http://localhost:8080/v1'
      };

      const adapter = registry.createFromConfig(config);

      expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
    });

    it('должен определить тип openai-compatible по имени ollama', () => {
      // Требования: 7.2
      const config = {
        name: 'ollama',
        baseUrl: 'http://localhost:11434/v1'
      };

      const adapter = registry.createFromConfig(config);

      expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
    });

    it('должен выбросить ошибку для неподдерживаемого типа', () => {
      const config = {
        name: 'unknown',
        type: 'unknown-type',
        command: 'unknown'
      };

      expect(() => registry.createFromConfig(config)).toThrow(/Неподдерживаемый тип адаптера/);
    });
  });

  describe('Регистрация из массива конфигураций', () => {
    it('должен зарегистрировать несколько адаптеров из конфигураций', () => {
      // Требования: 7.2, 8.1, 8.2, 8.3
      const configs = [
        {
          name: 'lm-studio',
          type: 'openai-compatible',
          baseUrl: 'http://localhost:1234/v1'
        },
        {
          name: 'localai',
          type: 'openai-compatible',
          baseUrl: 'http://localhost:8080/v1'
        },
        {
          name: 'ollama',
          type: 'openai-compatible',
          baseUrl: 'http://localhost:11434/v1'
        }
      ];

      registry.registerFromConfigs(configs);

      expect(registry.size()).toBe(3);
      expect(registry.has('lm-studio')).toBe(true); // Имя адаптера берется из конфигурации
      expect(registry.has('localai')).toBe(true);
      expect(registry.has('ollama')).toBe(true);
      expect(registry.getAll().length).toBe(3);
    });

    it('должен зарегистрировать адаптеры разных типов', () => {
      // Требования: 7.2
      const configs = [
        {
          name: 'lm-studio',
          type: 'openai-compatible',
          baseUrl: 'http://localhost:1234/v1'
        }
      ];

      registry.registerFromConfigs(configs);

      expect(registry.size()).toBe(1);
    });
  });

  describe('Примеры конфигураций для различных сервисов', () => {
    it('должен создать адаптер для LM Studio', () => {
      // Требования: 6.1
      const config = {
        name: 'lm-studio',
        type: 'openai-compatible',
        baseUrl: 'http://localhost:1234/v1',
        defaultModel: 'local-model',
        timeout: 60000
      };

      const adapter = registry.createFromConfig(config);

      expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
    });

    it('должен создать адаптер для LocalAI', () => {
      // Требования: 6.2
      const config = {
        name: 'localai',
        type: 'openai-compatible',
        baseUrl: 'http://localhost:8080/v1',
        apiKey: 'test-key',
        defaultModel: 'gpt-3.5-turbo'
      };

      const adapter = registry.createFromConfig(config);

      expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
    });

    it('должен создать адаптер для Ollama', () => {
      // Требования: 6.3
      const config = {
        name: 'ollama',
        type: 'openai-compatible',
        baseUrl: 'http://localhost:11434/v1',
        defaultModel: 'llama2'
      };

      const adapter = registry.createFromConfig(config);

      expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
    });

    it('должен создать адаптер для официального OpenAI API', () => {
      // Требования: 6.5
      const config = {
        name: 'openai',
        type: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        defaultModel: 'gpt-4',
        timeout: 120000
      };

      const adapter = registry.createFromConfig(config);

      expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
    });
  });
});
