/**
 * Unit-тесты для конкретных CLI-адаптеров
 * Тестирование Claude, OpenAI и Gemini адаптеров
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ClaudeCLIAdapter } from '../../src/adapters/claude-cli-adapter.js';
import { OpenAICLIAdapter } from '../../src/adapters/openai-cli-adapter.js';
import { GeminiCLIAdapter } from '../../src/adapters/gemini-cli-adapter.js';

describe('ClaudeCLIAdapter', () => {
  let adapter: ClaudeCLIAdapter;

  beforeEach(() => {
    adapter = new ClaudeCLIAdapter();
  });

  it('должен иметь правильное имя и версию', () => {
    expect(adapter.name).toBe('claude-cli');
    expect(adapter.version).toBe('1.0.0');
  });

  it('должен парсить простой текстовый ответ', () => {
    const rawOutput = 'Это ответ от Claude';
    const parsed = adapter.parseResponse(rawOutput);
    expect(parsed).toBe('Это ответ от Claude');
  });

  it('должен удалять префикс "Assistant:"', () => {
    const rawOutput = 'Assistant: Это ответ от Claude';
    const parsed = adapter.parseResponse(rawOutput);
    expect(parsed).toBe('Это ответ от Claude');
  });

  it('должен удалять префикс "Claude:"', () => {
    const rawOutput = 'Claude: Привет, как дела?';
    const parsed = adapter.parseResponse(rawOutput);
    expect(parsed).toBe('Привет, как дела?');
  });

  it('должен удалять лишние пробелы', () => {
    const rawOutput = '  \n  Ответ с пробелами  \n  ';
    const parsed = adapter.parseResponse(rawOutput);
    expect(parsed).toBe('Ответ с пробелами');
  });

  it('должен возвращать false для isAvailable без API ключа', async () => {
    // Сохраняем оригинальное значение
    const originalKey = process.env.ANTHROPIC_API_KEY;
    
    // Удаляем ключ
    delete process.env.ANTHROPIC_API_KEY;
    
    const adapterWithoutKey = new ClaudeCLIAdapter({
      env: {}
    });
    
    const available = await adapterWithoutKey.isAvailable();
    expect(available).toBe(false);
    
    // Восстанавливаем оригинальное значение
    if (originalKey) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it('должен использовать пользовательскую конфигурацию', () => {
    const customAdapter = new ClaudeCLIAdapter({
      command: 'custom-claude',
      timeout: 60000
    });
    
    expect(customAdapter.name).toBe('claude-cli');
  });
});

describe('OpenAICLIAdapter', () => {
  let adapter: OpenAICLIAdapter;

  beforeEach(() => {
    adapter = new OpenAICLIAdapter();
  });

  it('должен иметь правильное имя и версию', () => {
    expect(adapter.name).toBe('openai-cli');
    expect(adapter.version).toBe('1.0.0');
  });

  it('должен парсить JSON ответ с правильной структурой', () => {
    const rawOutput = JSON.stringify({
      choices: [
        {
          message: {
            content: 'Ответ от GPT',
            role: 'assistant'
          }
        }
      ]
    });
    
    const parsed = adapter.parseResponse(rawOutput);
    expect(parsed).toBe('Ответ от GPT');
  });

  it('должен обрабатывать множественные choices', () => {
    const rawOutput = JSON.stringify({
      choices: [
        {
          message: {
            content: 'Первый ответ',
            role: 'assistant'
          }
        },
        {
          message: {
            content: 'Второй ответ',
            role: 'assistant'
          }
        }
      ]
    });
    
    const parsed = adapter.parseResponse(rawOutput);
    // Должен вернуть первый ответ
    expect(parsed).toBe('Первый ответ');
  });

  it('должен обрабатывать невалидный JSON', () => {
    const rawOutput = 'Это не JSON';
    const parsed = adapter.parseResponse(rawOutput);
    expect(parsed).toBe('Это не JSON');
  });

  it('должен обрабатывать JSON с неожиданной структурой', () => {
    const rawOutput = JSON.stringify({
      unexpected: 'structure'
    });
    
    const parsed = adapter.parseResponse(rawOutput);
    expect(parsed).toBe(rawOutput.trim());
  });

  it('должен удалять лишние пробелы из контента', () => {
    const rawOutput = JSON.stringify({
      choices: [
        {
          message: {
            content: '  Ответ с пробелами  ',
            role: 'assistant'
          }
        }
      ]
    });
    
    const parsed = adapter.parseResponse(rawOutput);
    expect(parsed).toBe('Ответ с пробелами');
  });

  it('должен возвращать false для isAvailable без API ключа', async () => {
    // Сохраняем оригинальное значение
    const originalKey = process.env.OPENAI_API_KEY;
    
    // Удаляем ключ
    delete process.env.OPENAI_API_KEY;
    
    const adapterWithoutKey = new OpenAICLIAdapter({
      env: {}
    });
    
    const available = await adapterWithoutKey.isAvailable();
    expect(available).toBe(false);
    
    // Восстанавливаем оригинальное значение
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    }
  });
});

describe('GeminiCLIAdapter', () => {
  let adapter: GeminiCLIAdapter;

  beforeEach(() => {
    adapter = new GeminiCLIAdapter();
  });

  it('должен иметь правильное имя и версию', () => {
    expect(adapter.name).toBe('gemini-cli');
    expect(adapter.version).toBe('1.0.0');
  });

  it('должен парсить простой текстовый ответ', () => {
    const rawOutput = 'Ответ от Gemini';
    const parsed = adapter.parseResponse(rawOutput);
    expect(parsed).toBe('Ответ от Gemini');
  });

  it('должен удалять префикс "Response:"', () => {
    const rawOutput = 'Response: Ответ от Gemini';
    const parsed = adapter.parseResponse(rawOutput);
    expect(parsed).toBe('Ответ от Gemini');
  });

  it('должен парсить JSON с полем text', () => {
    const rawOutput = JSON.stringify({
      text: 'Ответ в JSON'
    });
    
    const parsed = adapter.parseResponse(rawOutput);
    expect(parsed).toBe('Ответ в JSON');
  });

  it('должен парсить JSON с полем content', () => {
    const rawOutput = JSON.stringify({
      content: 'Контент в JSON'
    });
    
    const parsed = adapter.parseResponse(rawOutput);
    expect(parsed).toBe('Контент в JSON');
  });

  it('должен парсить массив кандидатов с text', () => {
    const rawOutput = JSON.stringify([
      { text: 'Первый кандидат' },
      { text: 'Второй кандидат' }
    ]);
    
    const parsed = adapter.parseResponse(rawOutput);
    expect(parsed).toBe('Первый кандидат');
  });

  it('должен парсить массив кандидатов с content', () => {
    const rawOutput = JSON.stringify([
      { content: 'Первый контент' },
      { content: 'Второй контент' }
    ]);
    
    const parsed = adapter.parseResponse(rawOutput);
    expect(parsed).toBe('Первый контент');
  });

  it('должен обрабатывать невалидный JSON как текст', () => {
    const rawOutput = '{ invalid json';
    const parsed = adapter.parseResponse(rawOutput);
    expect(parsed).toBe('{ invalid json');
  });

  it('должен удалять лишние пробелы', () => {
    const rawOutput = '  \n  Ответ с пробелами  \n  ';
    const parsed = adapter.parseResponse(rawOutput);
    expect(parsed).toBe('Ответ с пробелами');
  });

  it('должен возвращать false для isAvailable без API ключа', async () => {
    // Сохраняем оригинальное значение
    const originalKey = process.env.GOOGLE_API_KEY;
    
    // Удаляем ключ
    delete process.env.GOOGLE_API_KEY;
    
    const adapterWithoutKey = new GeminiCLIAdapter({
      env: {}
    });
    
    const available = await adapterWithoutKey.isAvailable();
    expect(available).toBe(false);
    
    // Восстанавливаем оригинальное значение
    if (originalKey) {
      process.env.GOOGLE_API_KEY = originalKey;
    }
  });

  it('должен использовать пользовательскую конфигурацию', () => {
    const customAdapter = new GeminiCLIAdapter({
      command: 'custom-gemini',
      timeout: 60000
    });
    
    expect(customAdapter.name).toBe('gemini-cli');
  });
});

describe('Интеграция адаптеров с реестром', () => {
  it('все адаптеры должны быть совместимы с реестром', () => {
    const claudeAdapter = new ClaudeCLIAdapter();
    const openaiAdapter = new OpenAICLIAdapter();
    const geminiAdapter = new GeminiCLIAdapter();

    // Проверяем, что все адаптеры имеют необходимые свойства
    expect(claudeAdapter.name).toBeDefined();
    expect(claudeAdapter.version).toBeDefined();
    expect(typeof claudeAdapter.isAvailable).toBe('function');
    expect(typeof claudeAdapter.execute).toBe('function');
    expect(typeof claudeAdapter.parseResponse).toBe('function');
    expect(typeof claudeAdapter.handleError).toBe('function');

    expect(openaiAdapter.name).toBeDefined();
    expect(openaiAdapter.version).toBeDefined();
    expect(typeof openaiAdapter.isAvailable).toBe('function');
    expect(typeof openaiAdapter.execute).toBe('function');
    expect(typeof openaiAdapter.parseResponse).toBe('function');
    expect(typeof openaiAdapter.handleError).toBe('function');

    expect(geminiAdapter.name).toBeDefined();
    expect(geminiAdapter.version).toBeDefined();
    expect(typeof geminiAdapter.isAvailable).toBe('function');
    expect(typeof geminiAdapter.execute).toBe('function');
    expect(typeof geminiAdapter.parseResponse).toBe('function');
    expect(typeof geminiAdapter.handleError).toBe('function');
  });
});
