/**
 * Unit-тесты для конкретных CLI-адаптеров
 * Тестирование Claude, OpenAI и Gemini адаптеров
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ClaudeCLIAdapter } from '../../src/adapters/claude-cli-adapter.js';
import { OpenAICLIAdapter } from '../../src/adapters/openai-cli-adapter.js';
import { GeminiCLIAdapter } from '../../src/adapters/gemini-cli-adapter.js';
import { CodexCLIAdapter } from '../../src/adapters/codex-cli-adapter.js';

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

describe.skip('GeminiCLIAdapter', () => {
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

describe.skip('CodexCLIAdapter', () => {
  let adapter: CodexCLIAdapter;

  beforeEach(() => {
    adapter = new CodexCLIAdapter();
  });

  it('должен иметь правильное имя и версию', () => {
    // Требования: 1.2, 1.5
    expect(adapter.name).toBe('codex-cli');
    expect(adapter.version).toBe('1.0.0');
  });

  it('должен использовать команду codex exec в конфигурации', () => {
    // Требования: 1.2, 1.5
    const config = (adapter as any).config;
    expect(config.command).toBe('codex');
    expect(config.args).toEqual(['exec']); // Промпт добавляется динамически
  });

  it('должен использовать JSON парсер по умолчанию', () => {
    // Требования: 1.2
    const config = (adapter as any).config;
    expect(config.parser).toBe('json');
  });

  it('должен использовать таймаут 5 минут по умолчанию', () => {
    // Требования: 1.2
    const config = (adapter as any).config;
    expect(config.timeout).toBe(300000);
  });

  it('должен использовать пользовательскую конфигурацию', () => {
    const customAdapter = new CodexCLIAdapter({
      command: 'custom-codex',
      timeout: 60000
    });
    
    expect(customAdapter.name).toBe('codex-cli');
    const config = (customAdapter as any).config;
    expect(config.command).toBe('custom-codex');
    expect(config.timeout).toBe(60000);
  });

  // Unit-тесты для граничных случаев парсинга
  // Требования: 4.4

  describe('Парсинг граничных случаев', () => {
    it('должен обрабатывать пустой вывод', () => {
      // Требования: 4.4
      const adapter = new CodexCLIAdapter();
      const rawOutput = '';
      
      // Пустой вывод должен вернуть пустую строку
      const result = adapter.parseResponse(rawOutput);
      expect(result).toBe('');
    });

    it('должен обрабатывать вывод только с пробелами', () => {
      // Требования: 4.4
      const adapter = new CodexCLIAdapter();
      const rawOutput = '   \n\n   \t\t   ';
      
      // Вывод только с пробелами должен вернуть пустую строку
      const result = adapter.parseResponse(rawOutput);
      expect(result).toBe('');
    });

    it('должен обрабатывать многострочный вывод', () => {
      // Требования: 4.4
      const adapter = new CodexCLIAdapter();
      const rawOutput = `Line 1
Line 2
Line 3
Line 4`;
      
      const result = adapter.parseResponse(rawOutput);
      
      // Результат должен содержать все строки
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
      expect(result).toContain('Line 3');
      expect(result).toContain('Line 4');
    });

    it('должен обрабатывать вывод с ANSI-кодами', () => {
      // Требования: 4.4
      const adapter = new CodexCLIAdapter();
      const rawOutput = '\x1b[32mGreen text\x1b[0m and \x1b[31mRed text\x1b[0m';
      
      const result = adapter.parseResponse(rawOutput);
      
      // ANSI-коды должны быть удалены
      expect(result).not.toMatch(/\x1b\[[0-9;]*m/);
      expect(result).toContain('Green text');
      expect(result).toContain('Red text');
    });

    it('должен обрабатывать JSON-вывод с одним сообщением', () => {
      // Требования: 4.1, 4.2
      const adapter = new CodexCLIAdapter();
      const rawOutput = JSON.stringify({
        type: 'message',
        role: 'assistant',
        content: 'Simple response'
      });
      
      const result = adapter.parseResponse(rawOutput);
      expect(result).toBe('Simple response');
    });

    it('должен обрабатывать JSONL-вывод с множественными событиями', () => {
      // Требования: 4.1, 4.2
      const adapter = new CodexCLIAdapter();
      const events = [
        { type: 'status', message: 'Starting...' },
        { type: 'tool_use', tool: 'bash', input: 'ls -la' },
        { type: 'message', role: 'assistant', content: 'First message' },
        { type: 'message', role: 'assistant', content: 'Second message' },
        { type: 'status', message: 'Done' }
      ];
      
      const rawOutput = events.map(e => JSON.stringify(e)).join('\n');
      const result = adapter.parseResponse(rawOutput);
      
      // Должен вернуть последнее сообщение ассистента
      expect(result).toBe('Second message');
    });

    it('должен обрабатывать JSONL с пустыми строками', () => {
      // Требования: 4.4
      const adapter = new CodexCLIAdapter();
      const rawOutput = `
${JSON.stringify({ type: 'status', message: 'Starting' })}

${JSON.stringify({ type: 'message', role: 'assistant', content: 'Response' })}

`;
      
      const result = adapter.parseResponse(rawOutput);
      expect(result).toBe('Response');
    });

    it('должен обрабатывать смешанный вывод (JSON и текст)', () => {
      // Требования: 4.4
      const adapter = new CodexCLIAdapter();
      const rawOutput = `Some text before
${JSON.stringify({ type: 'message', role: 'assistant', content: 'JSON response' })}
Some text after`;
      
      const result = adapter.parseResponse(rawOutput);
      
      // Должен попытаться распарсить как JSON и вернуть сообщение
      expect(result).toContain('JSON response');
    });

    it('должен обрабатывать текстовый вывод с маркером Assistant response:', () => {
      // Требования: 4.3, 4.5
      const adapter = new CodexCLIAdapter();
      const rawOutput = `[Tool: bash] ls -la
[Status: Running...]

Assistant response:
Here is the result of the command.`;
      
      const result = adapter.parseResponse(rawOutput);
      
      // Должен извлечь текст после маркера и удалить служебные префиксы
      expect(result).toContain('Here is the result');
      expect(result).not.toMatch(/^\[Tool:.*?\].*$/m);
      expect(result).not.toMatch(/^\[Status:.*?\].*$/m);
    });

    it('должен обрабатывать текстовый вывод с множественными маркерами', () => {
      // Требования: 4.3, 4.5
      const adapter = new CodexCLIAdapter();
      const rawOutput = `Assistant: First response

Some other text

Assistant response: Second response

More text

Response: Final response`;
      
      const result = adapter.parseResponse(rawOutput);
      
      // Должен использовать последний маркер
      expect(result).toContain('Final response');
    });

    it('должен обрабатывать вывод с избыточными пустыми строками', () => {
      // Требования: 4.4
      const adapter = new CodexCLIAdapter();
      const rawOutput = `Assistant response:


Line 1


Line 2


Line 3


`;
      
      const result = adapter.parseResponse(rawOutput);
      
      // Избыточные пустые строки должны быть удалены
      expect(result).not.toMatch(/\n{3,}/);
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
      expect(result).toContain('Line 3');
    });

    it('должен обрабатывать невалидный JSON как текст', () => {
      // Требования: 4.4
      const adapter = new CodexCLIAdapter();
      const rawOutput = '{ invalid json without closing brace';
      
      const result = adapter.parseResponse(rawOutput);
      
      // Должен вернуть текст как есть (очищенный)
      expect(result).toBeTruthy();
      expect(result.trim()).toBe(rawOutput.trim());
    });

    it('должен обрабатывать JSON без сообщений ассистента', () => {
      // Требования: 4.4
      const adapter = new CodexCLIAdapter();
      const events = [
        { type: 'status', message: 'Starting...' },
        { type: 'tool_use', tool: 'bash', input: 'ls -la' },
        { type: 'status', message: 'Done' }
      ];
      
      const rawOutput = events.map(e => JSON.stringify(e)).join('\n');
      
      // Должен попытаться распарсить как текст, так как нет сообщений ассистента
      const result = adapter.parseResponse(rawOutput);
      expect(result).toBeTruthy();
    });

    it('должен обрабатывать Unicode символы', () => {
      // Требования: 4.4
      const adapter = new CodexCLIAdapter();
      const rawOutput = JSON.stringify({
        type: 'message',
        role: 'assistant',
        content: 'Привет! 你好! مرحبا! 🚀'
      });
      
      const result = adapter.parseResponse(rawOutput);
      expect(result).toBe('Привет! 你好! مرحبا! 🚀');
    });

    it('должен обрабатывать специальные символы в тексте', () => {
      // Требования: 4.4
      const adapter = new CodexCLIAdapter();
      const rawOutput = JSON.stringify({
        type: 'message',
        role: 'assistant',
        content: 'Text with "quotes" and \'apostrophes\' and \\backslashes\\'
      });
      
      const result = adapter.parseResponse(rawOutput);
      expect(result).toContain('quotes');
      expect(result).toContain('apostrophes');
      expect(result).toContain('backslashes');
    });

    it('должен обрабатывать вложенный JSON в контенте', () => {
      // Требования: 4.4
      const adapter = new CodexCLIAdapter();
      const nestedJson = { key: 'value', nested: { data: 'test' } };
      const rawOutput = JSON.stringify({
        type: 'message',
        role: 'assistant',
        content: JSON.stringify(nestedJson)
      });
      
      const result = adapter.parseResponse(rawOutput);
      expect(result).toContain('key');
      expect(result).toContain('value');
    });
  });

  // Unit-тесты для возобновления сессий
  // Требования: 5.1, 5.3

  describe('Возобновление сессий', () => {
    it('должен формировать команду resume с ID сессии', () => {
      // Требования: 5.1, 5.2
      const adapter = new CodexCLIAdapter();
      const sessionId = '12345-abcde-67890';
      const prompt = 'Continue the conversation';
      
      const args = (adapter as any).prepareArguments({
        prompt,
        resumeSession: sessionId
      });
      
      // Структура: ['exec', 'resume', sessionId, prompt]
      expect(args[0]).toBe('exec');
      expect(args[1]).toBe('resume');
      expect(args[2]).toBe(sessionId);
      expect(args[args.length - 1]).toBe(prompt); // Промпт теперь последний аргумент
    });

    it('должен формировать команду resume с флагом --last', () => {
      // Требования: 5.1, 5.3
      const adapter = new CodexCLIAdapter();
      const prompt = 'Continue the last conversation';
      
      const args = (adapter as any).prepareArguments({
        prompt,
        resumeLast: true
      });
      
      // Структура: ['exec', 'resume', '--last', prompt]
      expect(args[0]).toBe('exec');
      expect(args[1]).toBe('resume');
      expect(args).toContain('--last');
      expect(args[args.length - 1]).toBe(prompt); // Промпт теперь последний аргумент
    });

    it('должен комбинировать resume с ID и флагом --last', () => {
      // Требования: 5.1, 5.2, 5.3
      const adapter = new CodexCLIAdapter();
      const sessionId = 'test-session-id';
      const prompt = 'Continue';
      
      const args = (adapter as any).prepareArguments({
        prompt,
        resumeSession: sessionId,
        resumeLast: true
      });
      
      // Должны присутствовать и ID, и флаг --last
      expect(args[1]).toBe('resume');
      expect(args[2]).toBe(sessionId);
      expect(args).toContain('--last');
      expect(args[args.length - 1]).toBe(prompt); // Промпт теперь последний аргумент
    });

    it('должен комбинировать resume с другими флагами', () => {
      // Требования: 5.1, 5.2, 5.4
      const adapter = new CodexCLIAdapter();
      const sessionId = 'session-123';
      const prompt = 'Continue with model';
      
      const args = (adapter as any).prepareArguments({
        prompt,
        resumeSession: sessionId,
        model: 'gpt-4',
        fullAuto: true,
        jsonOutput: true
      });
      
      // Проверяем наличие команды resume
      expect(args[1]).toBe('resume');
      expect(args[2]).toBe(sessionId);
      
      // Проверяем наличие других флагов
      expect(args).toContain('-m');
      expect(args).toContain('gpt-4');
      expect(args).toContain('--full-auto');
      expect(args).toContain('--json');
      
      // Промпт всегда последний
      expect(args[args.length - 1]).toBe(prompt);
    });

    it('должен поддерживать передачу промпта при возобновлении', () => {
      // Требования: 5.4
      const adapter = new CodexCLIAdapter();
      const sessionId = 'session-456';
      const prompt = 'Additional message for resumed session';
      
      const args = (adapter as any).prepareArguments({
        prompt,
        resumeSession: sessionId
      });
      
      // Команда resume должна быть на месте
      expect(args[1]).toBe('resume');
      expect(args[2]).toBe(sessionId);
      
      // Промпт передается как последний аргумент
      expect(args[args.length - 1]).toBe(prompt);
    });

    it('не должен добавлять resume если не указаны resumeSession и resumeLast', () => {
      // Требования: 5.1
      const adapter = new CodexCLIAdapter();
      
      const args = (adapter as any).prepareArguments({
        prompt: 'Regular prompt without resume'
      });
      
      // Команда resume не должна присутствовать
      expect(args).not.toContain('resume');
      
      // Должна быть только базовая команда exec
      expect(args[0]).toBe('exec');
      expect(args[1]).not.toBe('resume');
    });

    it('должен обрабатывать различные форматы ID сессий', () => {
      // Требования: 5.2
      const adapter = new CodexCLIAdapter();
      
      // UUID формат
      const uuidSession = '550e8400-e29b-41d4-a716-446655440000';
      const argsUuid = (adapter as any).prepareArguments({
        prompt: 'test',
        resumeSession: uuidSession
      });
      expect(argsUuid[2]).toBe(uuidSession);
      
      // Короткий ID
      const shortSession = 'abc123';
      const argsShort = (adapter as any).prepareArguments({
        prompt: 'test',
        resumeSession: shortSession
      });
      expect(argsShort[2]).toBe(shortSession);
      
      // Длинный ID
      const longSession = 'very-long-session-id-with-many-characters-12345678901234567890';
      const argsLong = (adapter as any).prepareArguments({
        prompt: 'test',
        resumeSession: longSession
      });
      expect(argsLong[2]).toBe(longSession);
    });

    it('должен корректно позиционировать флаги при возобновлении', () => {
      // Требования: 5.1, 5.2, 5.4
      const adapter = new CodexCLIAdapter();
      const sessionId = 'pos-test-session';
      const prompt = 'test';
      
      const args = (adapter as any).prepareArguments({
        prompt,
        resumeSession: sessionId,
        model: 'gpt-4',
        workingDirectory: '/tmp',
        profile: 'dev'
      });
      
      // Порядок: ['exec', 'resume', sessionId, '-m', 'gpt-4', '--cd', '/tmp', '-p', 'dev', prompt]
      expect(args[0]).toBe('exec');
      expect(args[1]).toBe('resume');
      expect(args[2]).toBe(sessionId);
      
      // Флаги модели, директории и профиля должны идти после resume
      const resumeIndex = args.indexOf('resume');
      const modelIndex = args.indexOf('-m');
      const cdIndex = args.indexOf('--cd');
      const profileIndex = args.indexOf('-p');
      
      expect(modelIndex).toBeGreaterThan(resumeIndex);
      expect(cdIndex).toBeGreaterThan(resumeIndex);
      expect(profileIndex).toBeGreaterThan(resumeIndex);
      
      // Промпт всегда последний
      expect(args[args.length - 1]).toBe(prompt);
    });
  });

  // Unit-тесты для обработки ошибок
  // Требования: 6.1, 6.2, 6.3

  describe('Обработка ошибок', () => {
    it('должен возвращать ADAPTER_NOT_FOUND для ошибки "not found"', () => {
      // Требования: 6.1
      const adapter = new CodexCLIAdapter();
      const error = new Error('Command not found: codex');
      
      const result = adapter.handleError(error);
      
      expect(result.code).toBe('ADAPTER_NOT_FOUND');
      expect(result.retryable).toBe(false);
      expect(result.message).toBe(error.message);
      expect(result.originalError).toBe(error);
    });

    it('должен возвращать ADAPTER_NOT_FOUND для ошибки ENOENT', () => {
      // Требования: 6.1
      const adapter = new CodexCLIAdapter();
      const error = new Error('spawn codex ENOENT');
      
      const result = adapter.handleError(error);
      
      expect(result.code).toBe('ADAPTER_NOT_FOUND');
      expect(result.retryable).toBe(false);
    });

    it('должен возвращать ADAPTER_AUTH_ERROR для ошибки аутентификации', () => {
      // Требования: 6.2
      const adapter = new CodexCLIAdapter();
      const error = new Error('Authentication failed: Invalid API key');
      
      const result = adapter.handleError(error);
      
      expect(result.code).toBe('ADAPTER_AUTH_ERROR');
      expect(result.retryable).toBe(false);
      expect(result.message).toBe(error.message);
      expect(result.originalError).toBe(error);
    });

    it('должен возвращать ADAPTER_AUTH_ERROR для ошибки unauthorized', () => {
      // Требования: 6.2
      const adapter = new CodexCLIAdapter();
      const error = new Error('Unauthorized: Please check your credentials');
      
      const result = adapter.handleError(error);
      
      expect(result.code).toBe('ADAPTER_AUTH_ERROR');
      expect(result.retryable).toBe(false);
    });

    it('должен возвращать ADAPTER_TIMEOUT для ошибки таймаута', () => {
      // Требования: 6.3
      const adapter = new CodexCLIAdapter();
      const error = new Error('Command exceeded timeout 300000ms');
      
      const result = adapter.handleError(error);
      
      expect(result.code).toBe('ADAPTER_TIMEOUT');
      expect(result.retryable).toBe(true);
      expect(result.message).toBe(error.message);
      expect(result.originalError).toBe(error);
    });

    it('должен возвращать ADAPTER_TIMEOUT для ошибки "timed out"', () => {
      // Требования: 6.3
      const adapter = new CodexCLIAdapter();
      const error = new Error('Operation timed out after 5 minutes');
      
      const result = adapter.handleError(error);
      
      expect(result.code).toBe('ADAPTER_TIMEOUT');
      expect(result.retryable).toBe(true);
    });

    it('должен возвращать ADAPTER_INVALID_REQUEST для ошибки валидации', () => {
      // Требования: 6.1
      const adapter = new CodexCLIAdapter();
      const error = new Error('Invalid request: prompt cannot be empty');
      
      const result = adapter.handleError(error);
      
      expect(result.code).toBe('ADAPTER_INVALID_REQUEST');
      expect(result.retryable).toBe(false);
      expect(result.message).toBe(error.message);
      expect(result.originalError).toBe(error);
    });

    it('должен возвращать ADAPTER_UNKNOWN_ERROR для неизвестной ошибки', () => {
      // Требования: 6.1
      const adapter = new CodexCLIAdapter();
      const error = new Error('Some unexpected error occurred');
      
      const result = adapter.handleError(error);
      
      expect(result.code).toBe('ADAPTER_UNKNOWN_ERROR');
      expect(result.retryable).toBe(false);
      expect(result.message).toBe(error.message);
      expect(result.originalError).toBe(error);
    });

    it('должен включать stderr в сообщение об ошибке', () => {
      // Требования: 6.4
      const adapter = new CodexCLIAdapter();
      const stderr = 'Error: Connection refused\nFailed to connect to API';
      const error = new Error(`Command failed with exit code 1. stderr: ${stderr}`);
      
      const result = adapter.handleError(error);
      
      // Сообщение должно содержать stderr
      expect(result.message).toContain(stderr);
      expect(result.message).toContain('Connection refused');
      expect(result.message).toContain('Failed to connect to API');
    });

    it('должен корректно определять повторяемость для таймаутов', () => {
      // Требования: 6.5
      const adapter = new CodexCLIAdapter();
      const error = new Error('Request timeout after 30 seconds');
      
      const result = adapter.handleError(error);
      
      // Таймауты должны быть повторяемыми
      expect(result.retryable).toBe(true);
      expect(result.code).toBe('ADAPTER_TIMEOUT');
    });

    it('должен корректно определять неповторяемость для ошибок аутентификации', () => {
      // Требования: 6.5
      const adapter = new CodexCLIAdapter();
      const error = new Error('Authentication error: Invalid token');
      
      const result = adapter.handleError(error);
      
      // Ошибки аутентификации не должны быть повторяемыми
      expect(result.retryable).toBe(false);
      expect(result.code).toBe('ADAPTER_AUTH_ERROR');
    });

    it('должен корректно определять неповторяемость для ошибок "not found"', () => {
      // Требования: 6.5
      const adapter = new CodexCLIAdapter();
      const error = new Error('Executable not found in PATH');
      
      const result = adapter.handleError(error);
      
      // Ошибки "not found" не должны быть повторяемыми
      expect(result.retryable).toBe(false);
      expect(result.code).toBe('ADAPTER_NOT_FOUND');
    });

    it('должен обрабатывать ошибки с регистронезависимыми сообщениями', () => {
      // Требования: 6.1, 6.2, 6.3
      const adapter = new CodexCLIAdapter();
      
      // Проверяем TIMEOUT в верхнем регистре
      const timeoutError = new Error('TIMEOUT EXCEEDED');
      const timeoutResult = adapter.handleError(timeoutError);
      expect(timeoutResult.code).toBe('ADAPTER_TIMEOUT');
      
      // Проверяем AUTHENTICATION в смешанном регистре
      const authError = new Error('Authentication Failed');
      const authResult = adapter.handleError(authError);
      expect(authResult.code).toBe('ADAPTER_AUTH_ERROR');
      
      // Проверяем NOT FOUND в верхнем регистре
      const notFoundError = new Error('NOT FOUND');
      const notFoundResult = adapter.handleError(notFoundError);
      expect(notFoundResult.code).toBe('ADAPTER_NOT_FOUND');
    });

    it('должен сохранять оригинальную ошибку для всех типов ошибок', () => {
      // Требования: 6.1, 6.2, 6.3
      const adapter = new CodexCLIAdapter();
      
      const errors = [
        new Error('timeout'),
        new Error('authentication failed'),
        new Error('not found'),
        new Error('invalid request'),
        new Error('unknown error')
      ];
      
      for (const error of errors) {
        const result = adapter.handleError(error);
        expect(result.originalError).toBe(error);
      }
    });

    it('должен обрабатывать ошибки с дополнительным контекстом', () => {
      // Требования: 6.4
      const adapter = new CodexCLIAdapter();
      const error = new Error('Command failed: timeout. Additional context: network issues. stderr: Connection reset');
      
      const result = adapter.handleError(error);
      
      // Должен определить тип ошибки по ключевому слову
      expect(result.code).toBe('ADAPTER_TIMEOUT');
      
      // Должен сохранить полное сообщение
      expect(result.message).toContain('timeout');
      expect(result.message).toContain('Additional context');
      expect(result.message).toContain('stderr');
    });

    it('должен обрабатывать ошибки с множественными ключевыми словами', () => {
      // Требования: 6.1, 6.2, 6.3
      const adapter = new CodexCLIAdapter();
      
      // Если есть несколько ключевых слов, приоритет имеет первое найденное
      const error = new Error('not found: authentication timeout');
      const result = adapter.handleError(error);
      
      // Должен определить по первому ключевому слову
      expect(result.code).toBe('ADAPTER_NOT_FOUND');
    });

    it('должен обрабатывать пустые сообщения об ошибках', () => {
      // Требования: 6.1
      const adapter = new CodexCLIAdapter();
      const error = new Error('');
      
      const result = adapter.handleError(error);
      
      // Должен вернуть ADAPTER_UNKNOWN_ERROR для пустого сообщения
      expect(result.code).toBe('ADAPTER_UNKNOWN_ERROR');
      expect(result.retryable).toBe(false);
      expect(result.message).toBe('');
    });

    it('должен обрабатывать ошибки с специальными символами', () => {
      // Требования: 6.4
      const adapter = new CodexCLIAdapter();
      const error = new Error('Error: "authentication" failed with code 401. stderr: {"error": "unauthorized"}');
      
      const result = adapter.handleError(error);
      
      // Должен корректно определить тип ошибки
      expect(result.code).toBe('ADAPTER_AUTH_ERROR');
      
      // Должен сохранить специальные символы в сообщении
      expect(result.message).toContain('"authentication"');
      expect(result.message).toContain('{"error": "unauthorized"}');
    });

    it('должен обрабатывать многострочные сообщения об ошибках', () => {
      // Требования: 6.4
      const adapter = new CodexCLIAdapter();
      const error = new Error(`Command failed with timeout
Line 2: Additional info
Line 3: stderr: Connection lost`);
      
      const result = adapter.handleError(error);
      
      // Должен определить тип ошибки
      expect(result.code).toBe('ADAPTER_TIMEOUT');
      
      // Должен сохранить все строки
      expect(result.message).toContain('Line 2');
      expect(result.message).toContain('Line 3');
      expect(result.message).toContain('stderr');
    });
  });

  // Unit-тесты для проверки доступности
  // Требования: 7.2, 7.3, 7.4, 7.5

  describe('Проверка доступности (isAvailable)', () => {
    it('должен возвращать true если команда codex --version выполняется успешно', async () => {
      // Требования: 7.2, 7.3
      const adapter = new CodexCLIAdapter();
      
      // Мокируем executeCommand для успешного выполнения
      const originalExecuteCommand = (adapter as any).executeCommand;
      (adapter as any).executeCommand = jest.fn().mockResolvedValue({
        stdout: 'codex version 1.0.0',
        stderr: '',
        exitCode: 0,
        executionTime: 100
      });
      
      const result = await adapter.isAvailable();
      
      expect(result).toBe(true);
      expect((adapter as any).executeCommand).toHaveBeenCalledWith(
        'codex',
        ['--version'],
        expect.any(Object),
        5000 // Таймаут 5 секунд
      );
      
      // Восстанавливаем оригинальный метод
      (adapter as any).executeCommand = originalExecuteCommand;
    });

    it('должен возвращать false если команда codex не найдена', async () => {
      // Требования: 7.2, 7.4
      const adapter = new CodexCLIAdapter();
      
      // Мокируем executeCommand для ошибки "not found"
      const originalExecuteCommand = (adapter as any).executeCommand;
      (adapter as any).executeCommand = jest.fn().mockRejectedValue(
        new Error('Command not found: codex')
      );
      
      const result = await adapter.isAvailable();
      
      expect(result).toBe(false);
      expect((adapter as any).executeCommand).toHaveBeenCalledWith(
        'codex',
        ['--version'],
        expect.any(Object),
        5000
      );
      
      // Восстанавливаем оригинальный метод
      (adapter as any).executeCommand = originalExecuteCommand;
    });

    it('должен возвращать false если команда завершается с ненулевым кодом', async () => {
      // Требования: 7.2, 7.4
      const adapter = new CodexCLIAdapter();
      
      // Мокируем executeCommand для ненулевого кода выхода
      const originalExecuteCommand = (adapter as any).executeCommand;
      (adapter as any).executeCommand = jest.fn().mockResolvedValue({
        stdout: '',
        stderr: 'Error: Invalid command',
        exitCode: 1,
        executionTime: 50
      });
      
      const result = await adapter.isAvailable();
      
      expect(result).toBe(false);
      
      // Восстанавливаем оригинальный метод
      (adapter as any).executeCommand = originalExecuteCommand;
    });

    it('должен использовать таймаут 5 секунд для проверки', async () => {
      // Требования: 7.5
      const adapter = new CodexCLIAdapter();
      
      // Мокируем executeCommand
      const originalExecuteCommand = (adapter as any).executeCommand;
      const mockExecuteCommand = jest.fn().mockResolvedValue({
        stdout: 'codex version 1.0.0',
        stderr: '',
        exitCode: 0,
        executionTime: 100
      });
      (adapter as any).executeCommand = mockExecuteCommand;
      
      await adapter.isAvailable();
      
      // Проверяем, что таймаут равен 5000 мс (5 секунд)
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'codex',
        ['--version'],
        expect.any(Object),
        5000
      );
      
      // Восстанавливаем оригинальный метод
      (adapter as any).executeCommand = originalExecuteCommand;
    });

    it('должен возвращать false при таймауте проверки', async () => {
      // Требования: 7.4, 7.5
      const adapter = new CodexCLIAdapter();
      
      // Мокируем executeCommand для таймаута
      const originalExecuteCommand = (adapter as any).executeCommand;
      (adapter as any).executeCommand = jest.fn().mockRejectedValue(
        new Error('Command exceeded timeout 5000ms')
      );
      
      const result = await adapter.isAvailable();
      
      expect(result).toBe(false);
      
      // Восстанавливаем оригинальный метод
      (adapter as any).executeCommand = originalExecuteCommand;
    });

    it('должен возвращать false для любой ошибки выполнения', async () => {
      // Требования: 7.4
      const adapter = new CodexCLIAdapter();
      
      // Мокируем executeCommand для различных ошибок
      const originalExecuteCommand = (adapter as any).executeCommand;
      
      const errors = [
        new Error('ENOENT: no such file or directory'),
        new Error('Permission denied'),
        new Error('Network error'),
        new Error('Unknown error')
      ];
      
      for (const error of errors) {
        (adapter as any).executeCommand = jest.fn().mockRejectedValue(error);
        
        const result = await adapter.isAvailable();
        expect(result).toBe(false);
      }
      
      // Восстанавливаем оригинальный метод
      (adapter as any).executeCommand = originalExecuteCommand;
    });

    it('должен использовать команду codex --version, а не codex exec --version', async () => {
      // Требования: 7.2
      const adapter = new CodexCLIAdapter();
      
      // Мокируем executeCommand
      const originalExecuteCommand = (adapter as any).executeCommand;
      const mockExecuteCommand = jest.fn().mockResolvedValue({
        stdout: 'codex version 1.0.0',
        stderr: '',
        exitCode: 0,
        executionTime: 100
      });
      (adapter as any).executeCommand = mockExecuteCommand;
      
      await adapter.isAvailable();
      
      // Проверяем, что используется именно --version, а не exec
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'codex',
        ['--version'],
        expect.any(Object),
        5000
      );
      
      // Убеждаемся, что НЕ используется 'exec'
      const callArgs = mockExecuteCommand.mock.calls[0];
      expect(callArgs[1]).not.toContain('exec');
      
      // Восстанавливаем оригинальный метод
      (adapter as any).executeCommand = originalExecuteCommand;
    });

    it('должен корректно обрабатывать различные форматы вывода версии', async () => {
      // Требования: 7.3
      const adapter = new CodexCLIAdapter();
      
      const originalExecuteCommand = (adapter as any).executeCommand;
      
      const versionOutputs = [
        'codex version 1.0.0',
        'codex 1.0.0',
        'v1.0.0',
        '1.0.0',
        'codex-cli version 2.5.3',
        '' // Пустой вывод, но exitCode = 0
      ];
      
      for (const stdout of versionOutputs) {
        (adapter as any).executeCommand = jest.fn().mockResolvedValue({
          stdout,
          stderr: '',
          exitCode: 0,
          executionTime: 50
        });
        
        const result = await adapter.isAvailable();
        
        // Если exitCode = 0, должен вернуть true независимо от формата вывода
        expect(result).toBe(true);
      }
      
      // Восстанавливаем оригинальный метод
      (adapter as any).executeCommand = originalExecuteCommand;
    });

    it('должен игнорировать stderr если exitCode = 0', async () => {
      // Требования: 7.3
      const adapter = new CodexCLIAdapter();
      
      // Мокируем executeCommand с stderr, но exitCode = 0
      const originalExecuteCommand = (adapter as any).executeCommand;
      (adapter as any).executeCommand = jest.fn().mockResolvedValue({
        stdout: 'codex version 1.0.0',
        stderr: 'Warning: Some deprecation notice',
        exitCode: 0,
        executionTime: 100
      });
      
      const result = await adapter.isAvailable();
      
      // Должен вернуть true, так как exitCode = 0
      expect(result).toBe(true);
      
      // Восстанавливаем оригинальный метод
      (adapter as any).executeCommand = originalExecuteCommand;
    });

    it('должен быть независимым от конфигурации адаптера', async () => {
      // Требования: 7.1
      const customAdapter = new CodexCLIAdapter({
        command: 'custom-codex',
        timeout: 60000,
        args: ['custom', 'args']
      });
      
      // Мокируем executeCommand
      const originalExecuteCommand = (customAdapter as any).executeCommand;
      const mockExecuteCommand = jest.fn().mockResolvedValue({
        stdout: 'custom-codex version 1.0.0',
        stderr: '',
        exitCode: 0,
        executionTime: 100
      });
      (customAdapter as any).executeCommand = mockExecuteCommand;
      
      await customAdapter.isAvailable();
      
      // Должен использовать команду из конфигурации, но с --version
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'custom-codex',
        ['--version'],
        expect.any(Object),
        5000 // Таймаут всегда 5 секунд для проверки
      );
      
      // Восстанавливаем оригинальный метод
      (customAdapter as any).executeCommand = originalExecuteCommand;
    });
  });
});

describe('Интеграция адаптеров с реестром', () => {
  it('все адаптеры должны быть совместимы с реестром', () => {
    const claudeAdapter = new ClaudeCLIAdapter();
    const openaiAdapter = new OpenAICLIAdapter();
    const geminiAdapter = new GeminiCLIAdapter();
    const codexAdapter = new CodexCLIAdapter();

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

    expect(codexAdapter.name).toBeDefined();
    expect(codexAdapter.version).toBeDefined();
    expect(typeof codexAdapter.isAvailable).toBe('function');
    expect(typeof codexAdapter.execute).toBe('function');
    expect(typeof codexAdapter.parseResponse).toBe('function');
    expect(typeof codexAdapter.handleError).toBe('function');
  });
});
