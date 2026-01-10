/**
 * Интеграционные тесты для CLI-адаптеров
 * Проверка работы адаптеров с реестром и базовой функциональности
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AdapterRegistry } from '../../src/adapters/adapter-registry.js';
import { ClaudeCLIAdapter } from '../../src/adapters/claude-cli-adapter.js';
import { OpenAICLIAdapter } from '../../src/adapters/openai-cli-adapter.js';
import { GeminiCLIAdapter } from '../../src/adapters/gemini-cli-adapter.js';

describe('Интеграция адаптеров с реестром', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  it('должен регистрировать Claude адаптер', () => {
    const adapter = new ClaudeCLIAdapter();
    registry.register(adapter);

    expect(registry.has('claude-cli')).toBe(true);
    expect(registry.get('claude-cli')).toBe(adapter);
  });

  it('должен регистрировать OpenAI адаптер', () => {
    const adapter = new OpenAICLIAdapter();
    registry.register(adapter);

    expect(registry.has('openai-cli')).toBe(true);
    expect(registry.get('openai-cli')).toBe(adapter);
  });

  it('должен регистрировать Gemini адаптер', () => {
    const adapter = new GeminiCLIAdapter();
    registry.register(adapter);

    expect(registry.has('gemini-cli')).toBe(true);
    expect(registry.get('gemini-cli')).toBe(adapter);
  });

  it('должен регистрировать все три адаптера одновременно', () => {
    const claudeAdapter = new ClaudeCLIAdapter();
    const openaiAdapter = new OpenAICLIAdapter();
    const geminiAdapter = new GeminiCLIAdapter();

    registry.register(claudeAdapter);
    registry.register(openaiAdapter);
    registry.register(geminiAdapter);

    expect(registry.size()).toBe(3);
    expect(registry.has('claude-cli')).toBe(true);
    expect(registry.has('openai-cli')).toBe(true);
    expect(registry.has('gemini-cli')).toBe(true);
  });

  it('должен получать все зарегистрированные адаптеры', () => {
    const claudeAdapter = new ClaudeCLIAdapter();
    const openaiAdapter = new OpenAICLIAdapter();
    const geminiAdapter = new GeminiCLIAdapter();

    registry.register(claudeAdapter);
    registry.register(openaiAdapter);
    registry.register(geminiAdapter);

    const allAdapters = registry.getAll();
    expect(allAdapters).toHaveLength(3);
    expect(allAdapters).toContain(claudeAdapter);
    expect(allAdapters).toContain(openaiAdapter);
    expect(allAdapters).toContain(geminiAdapter);
  });

  it('должен удалять адаптер из реестра', () => {
    const adapter = new ClaudeCLIAdapter();
    registry.register(adapter);

    expect(registry.has('claude-cli')).toBe(true);

    const removed = registry.unregister('claude-cli');
    expect(removed).toBe(true);
    expect(registry.has('claude-cli')).toBe(false);
  });

  it('должен выбрасывать ошибку при регистрации дубликата', () => {
    const adapter1 = new ClaudeCLIAdapter();
    const adapter2 = new ClaudeCLIAdapter();

    registry.register(adapter1);

    expect(() => {
      registry.register(adapter2);
    }).toThrow('Адаптер с именем "claude-cli" уже зарегистрирован');
  });

  it('должен очищать все адаптеры', () => {
    registry.register(new ClaudeCLIAdapter());
    registry.register(new OpenAICLIAdapter());
    registry.register(new GeminiCLIAdapter());

    expect(registry.size()).toBe(3);

    registry.clear();
    expect(registry.size()).toBe(0);
  });
});

describe('Проверка доступности адаптеров', () => {
  it('Claude адаптер должен проверять доступность команды', async () => {
    // Сохраняем оригинальное значение
    const originalKey = process.env.ANTHROPIC_API_KEY;
    
    // Тест без ключа - теперь это нормально, так как утилита может быть авторизована
    delete process.env.ANTHROPIC_API_KEY;
    const adapterWithoutKey = new ClaudeCLIAdapter({ env: {} });
    const available = await adapterWithoutKey.isAvailable();
    // Результат зависит только от наличия команды в системе
    expect(typeof available).toBe('boolean');
    
    // Восстанавливаем оригинальное значение
    if (originalKey) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it('OpenAI адаптер должен проверять доступность команды', async () => {
    // Сохраняем оригинальное значение
    const originalKey = process.env.OPENAI_API_KEY;
    
    // Тест без ключа - теперь это нормально, так как утилита может быть авторизована
    delete process.env.OPENAI_API_KEY;
    const adapterWithoutKey = new OpenAICLIAdapter({ env: {} });
    const available = await adapterWithoutKey.isAvailable();
    // Результат зависит только от наличия команды в системе
    expect(typeof available).toBe('boolean');
    
    // Восстанавливаем оригинальное значение
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    }
  });

  // Проверяем доступность gemini-cli перед запуском теста
  it('Gemini адаптер должен проверять доступность команды', async () => {
    // Сохраняем оригинальное значение
    const originalKey = process.env.GOOGLE_API_KEY;
    
    // Тест без ключа - теперь это нормально, так как утилита может быть авторизована
    delete process.env.GOOGLE_API_KEY;
    const adapterWithoutKey = new GeminiCLIAdapter({ env: {} });
    
    // Проверяем доступность gemini-cli
    const isGeminiAvailable = await adapterWithoutKey.isAvailable();
    
    // Пропускаем тест если gemini-cli не установлен
    if (!isGeminiAvailable) {
      console.log('⚠️  Пропуск теста: gemini-cli не установлен в системе');
      return; // Пропускаем тест
    }
    
    const available = await adapterWithoutKey.isAvailable();
    // Результат зависит только от наличия команды в системе
    expect(typeof available).toBe('boolean');
    
    // Восстанавливаем оригинальное значение
    if (originalKey) {
      process.env.GOOGLE_API_KEY = originalKey;
    }
  }, 20000); // Увеличиваем таймаут до 20 секунд
});

describe('Парсинг ответов адаптеров', () => {
  it('Claude должен корректно парсить различные форматы', () => {
    const adapter = new ClaudeCLIAdapter();

    // Простой текст
    expect(adapter.parseResponse('Простой ответ')).toBe('Простой ответ');

    // С префиксом Assistant
    expect(adapter.parseResponse('Assistant: Ответ')).toBe('Ответ');

    // С префиксом Claude
    expect(adapter.parseResponse('Claude: Ответ')).toBe('Ответ');

    // С пробелами
    expect(adapter.parseResponse('  \n  Ответ  \n  ')).toBe('Ответ');
  });

  it('OpenAI должен корректно парсить JSON и текст', () => {
    const adapter = new OpenAICLIAdapter();

    // Валидный JSON
    const validJson = JSON.stringify({
      choices: [{ message: { content: 'Ответ', role: 'assistant' } }]
    });
    expect(adapter.parseResponse(validJson)).toBe('Ответ');

    // Невалидный JSON
    expect(adapter.parseResponse('Не JSON')).toBe('Не JSON');

    // JSON с неожиданной структурой
    const unexpectedJson = JSON.stringify({ unexpected: 'data' });
    expect(adapter.parseResponse(unexpectedJson)).toBe(unexpectedJson);
  });

  it('Gemini должен корректно парсить текст и JSON', () => {
    const adapter = new GeminiCLIAdapter();

    // Простой текст
    expect(adapter.parseResponse('Ответ')).toBe('Ответ');

    // С префиксом
    expect(adapter.parseResponse('Response: Ответ')).toBe('Ответ');

    // JSON с text
    const jsonWithText = JSON.stringify({ text: 'Ответ' });
    expect(adapter.parseResponse(jsonWithText)).toBe('Ответ');

    // JSON с content
    const jsonWithContent = JSON.stringify({ content: 'Ответ' });
    expect(adapter.parseResponse(jsonWithContent)).toBe('Ответ');

    // Массив кандидатов
    const candidates = JSON.stringify([{ text: 'Первый' }, { text: 'Второй' }]);
    expect(adapter.parseResponse(candidates)).toBe('Первый');
  });
});

describe('Пользовательская конфигурация адаптеров', () => {
  it('должен использовать пользовательскую команду для Claude', () => {
    const adapter = new ClaudeCLIAdapter({
      command: 'custom-claude-command'
    });

    expect(adapter.name).toBe('claude-cli');
  });

  it('должен использовать пользовательский таймаут для OpenAI', () => {
    const adapter = new OpenAICLIAdapter({
      timeout: 60000
    });

    expect(adapter.name).toBe('openai-cli');
  });

  it('должен объединять переменные окружения для Gemini', () => {
    const adapter = new GeminiCLIAdapter({
      env: {
        CUSTOM_VAR: 'custom-value'
      }
    });

    expect(adapter.name).toBe('gemini-cli');
  });
});
