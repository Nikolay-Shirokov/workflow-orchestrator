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

  it('должен возвращать результат isAvailable независимо от API ключа', async () => {
    // Сохраняем оригинальное значение
    const originalKey = process.env.ANTHROPIC_API_KEY;
    
    // Удаляем ключ
    delete process.env.ANTHROPIC_API_KEY;
    
    const adapterWithoutKey = new ClaudeCLIAdapter({
      env: {}
    });
    
    // Теперь isAvailable проверяет только доступность команды,
    // а не наличие API ключа (так как утилита может быть авторизована на уровне системы)
    const available = await adapterWithoutKey.isAvailable();
    // Результат зависит от того, установлена ли команда claude в системе
    expect(typeof available).toBe('boolean');
    
    // Восстанавливаем оригинальное значение
    if (originalKey) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  }, 10000); // Увеличиваем таймаут до 10 секунд для проверки доступности CLI

  it('должен использовать пользовательскую конфигурацию', () => {
    const customAdapter = new ClaudeCLIAdapter({
      command: 'custom-claude',
      timeout: 60000
    });
    
    expect(customAdapter.name).toBe('claude-cli');
  });

  it('должен добавлять флаг --model если модель указана', () => {
    const adapter = new ClaudeCLIAdapter();
    
    // Используем приватный метод через any для тестирования
    const argsWithModel = (adapter as any).prepareArguments({
      prompt: 'test prompt',
      model: 'claude-sonnet-3.5'
    });
    
    expect(argsWithModel).toEqual(['-p', '--model', 'claude-sonnet-3.5', 'test prompt']);
  });

  it('не должен добавлять флаг --model если модель не указана', () => {
    const adapter = new ClaudeCLIAdapter();
    
    // Используем приватный метод через any для тестирования
    const argsWithoutModel = (adapter as any).prepareArguments({
      prompt: 'test prompt'
    });
    
    expect(argsWithoutModel).toEqual(['-p', 'test prompt']);
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

  it('должен возвращать результат isAvailable независимо от API ключа', async () => {
    // Сохраняем оригинальное значение
    const originalKey = process.env.OPENAI_API_KEY;
    
    // Удаляем ключ
    delete process.env.OPENAI_API_KEY;
    
    const adapterWithoutKey = new OpenAICLIAdapter({
      env: {}
    });
    
    // Теперь isAvailable проверяет только доступность команды,
    // а не наличие API ключа (так как утилита может быть авторизована на уровне системы)
    const available = await adapterWithoutKey.isAvailable();
    // Результат зависит от того, установлена ли команда openai в системе
    expect(typeof available).toBe('boolean');
    
    // Восстанавливаем оригинальное значение
    if (originalKey) {
      process.env.OPENAI_API_KEY = originalKey;
    }
  });

  it('должен добавлять флаг -m если модель указана', () => {
    const adapter = new OpenAICLIAdapter();
    
    // Используем приватный метод через any для тестирования
    const argsWithModel = (adapter as any).prepareArguments({
      prompt: 'test prompt',
      model: 'gpt-4'
    });
    
    expect(argsWithModel).toEqual(['api', 'chat.completions.create', '-m', 'gpt-4', '-g', 'user', 'test prompt']);
  });

  it('не должен добавлять флаг -m если модель не указана', () => {
    const adapter = new OpenAICLIAdapter();
    
    // Используем приватный метод через any для тестирования
    const argsWithoutModel = (adapter as any).prepareArguments({
      prompt: 'test prompt'
    });
    
    expect(argsWithoutModel).toEqual(['api', 'chat.completions.create', '-g', 'user', 'test prompt']);
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

  it('должен возвращать результат isAvailable независимо от API ключа', async () => {
    // Сохраняем оригинальное значение
    const originalKey = process.env.GOOGLE_API_KEY;
    
    // Удаляем ключ
    delete process.env.GOOGLE_API_KEY;
    
    const adapterWithoutKey = new GeminiCLIAdapter({
      env: {}
    });
    
    // Проверяем доступность gemini-cli
    const isGeminiAvailable = await adapterWithoutKey.isAvailable();
    
    // Пропускаем тест если gemini-cli не установлен
    if (!isGeminiAvailable) {
      console.log('⚠️  Пропуск теста: gemini-cli не установлен в системе');
      // Восстанавливаем оригинальное значение перед выходом
      if (originalKey) {
        process.env.GOOGLE_API_KEY = originalKey;
      }
      return; // Пропускаем тест
    }
    
    // Теперь isAvailable проверяет только доступность команды,
    // а не наличие API ключа (так как утилита может быть авторизована на уровне системы)
    const available = await adapterWithoutKey.isAvailable();
    // Результат зависит от того, установлена ли команда gemini в системе
    expect(typeof available).toBe('boolean');
    
    // Восстанавливаем оригинальное значение
    if (originalKey) {
      process.env.GOOGLE_API_KEY = originalKey;
    }
  }, 30000); // Увеличиваем таймаут до 30 секунд

  it('должен использовать пользовательскую конфигурацию', () => {
    const customAdapter = new GeminiCLIAdapter({
      command: 'custom-gemini',
      timeout: 60000
    });
    
    expect(customAdapter.name).toBe('gemini-cli');
  });

  it('должен добавлять флаг --model если модель указана', () => {
    const adapter = new GeminiCLIAdapter();
    
    // Используем приватный метод через any для тестирования
    const argsWithModel = (adapter as any).prepareArguments({
      prompt: 'test prompt',
      model: 'gemini-pro'
    });
    
    expect(argsWithModel).toEqual(['--prompt', '--model', 'gemini-pro', 'test prompt']);
  });

  it('не должен добавлять флаг --model если модель не указана', () => {
    const adapter = new GeminiCLIAdapter();
    
    // Используем приватный метод через any для тестирования
    const argsWithoutModel = (adapter as any).prepareArguments({
      prompt: 'test prompt'
    });
    
    expect(argsWithoutModel).toEqual(['--prompt', 'test prompt']);
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
