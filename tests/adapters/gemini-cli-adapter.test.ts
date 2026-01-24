/**
 * Unit-тесты для GeminiCLIAdapter
 * Тестирует mapPermissionsToArgs и поддержку permissions
 */

import { GeminiCLIAdapter, GeminiAdapterRequest } from '../../src/adapters/gemini-cli-adapter.js';
import { AdapterRequest, StepPermissions } from '../../src/core/types.js';

/**
 * Тестовый класс для доступа к protected методам
 */
class TestableGeminiCLIAdapter extends GeminiCLIAdapter {
  public testPrepareArguments(request: AdapterRequest): string[] {
    return this.prepareArguments(request);
  }

  public testMapPermissionsToArgs(
    permissions?: StepPermissions,
    geminiRequest?: GeminiAdapterRequest
  ): string[] {
    return this.mapPermissionsToArgs(permissions, geminiRequest);
  }

  public testAppendFileWriteInstruction(
    prompt: string,
    outputPath: string,
    toolName?: string
  ): string {
    return this.appendFileWriteInstruction(prompt, outputPath, toolName);
  }
}

describe('GeminiCLIAdapter - mapPermissionsToArgs', () => {
  let adapter: TestableGeminiCLIAdapter;

  beforeEach(() => {
    adapter = new TestableGeminiCLIAdapter();
  });

  describe('без permissions (безопасный режим по умолчанию)', () => {
    test('должен возвращать пустой массив без permissions', () => {
      const result = adapter.testMapPermissionsToArgs();

      // Без permissions - режим только чтения (без --yolo и --allowed-tools)
      expect(result).toEqual([]);
    });

    test('должен возвращать пустой массив с undefined permissions', () => {
      const result = adapter.testMapPermissionsToArgs(undefined);

      expect(result).toEqual([]);
    });

    test('НЕ должен использовать --yolo без permissions', () => {
      const result = adapter.testMapPermissionsToArgs();

      expect(result).not.toContain('--yolo');
    });
  });

  describe('с явными опциями в запросе', () => {
    test('должен использовать явно указанные allowedTools', () => {
      const geminiRequest: GeminiAdapterRequest = {
        prompt: 'test',
        allowedTools: ['write_file', 'shell']
      };

      const result = adapter.testMapPermissionsToArgs(undefined, geminiRequest);

      expect(result).toContain('--allowed-tools');
      const toolsIndex = result.indexOf('--allowed-tools');
      expect(result[toolsIndex + 1]).toBe('write_file,shell');
    });

    test('должен добавлять --yolo при явном указании', () => {
      const geminiRequest: GeminiAdapterRequest = {
        prompt: 'test',
        yolo: true
      };

      const result = adapter.testMapPermissionsToArgs(undefined, geminiRequest);

      expect(result).toContain('--yolo');
    });
  });

  describe('с permissions.write', () => {
    test('должен добавлять write_file в --allowed-tools', () => {
      const permissions: StepPermissions = {
        write: ['*.md']
      };

      const result = adapter.testMapPermissionsToArgs(permissions);

      expect(result).toContain('--allowed-tools');
      const toolsIndex = result.indexOf('--allowed-tools');
      expect(result[toolsIndex + 1]).toContain('write_file');
    });

    test('должен добавлять --yolo при permissions.write', () => {
      const permissions: StepPermissions = {
        write: ['output/*.md']
      };

      const result = adapter.testMapPermissionsToArgs(permissions);

      expect(result).toContain('--yolo');
    });

    test('НЕ должен добавлять shell без permissions.execute', () => {
      const permissions: StepPermissions = {
        write: ['*.md']
      };

      const result = adapter.testMapPermissionsToArgs(permissions);

      const toolsIndex = result.indexOf('--allowed-tools');
      const toolsValue = result[toolsIndex + 1];
      expect(toolsValue).not.toContain('shell');
    });
  });

  describe('с permissions.execute', () => {
    test('должен добавлять shell в --allowed-tools', () => {
      const permissions: StepPermissions = {
        execute: true
      };

      const result = adapter.testMapPermissionsToArgs(permissions);

      expect(result).toContain('--allowed-tools');
      const toolsIndex = result.indexOf('--allowed-tools');
      expect(result[toolsIndex + 1]).toContain('shell');
    });

    test('должен добавлять --yolo при permissions.execute', () => {
      const permissions: StepPermissions = {
        execute: true
      };

      const result = adapter.testMapPermissionsToArgs(permissions);

      expect(result).toContain('--yolo');
    });
  });

  describe('с permissions.fullAccess', () => {
    test('должен добавлять только --yolo', () => {
      const permissions: StepPermissions = {
        fullAccess: true
      };

      const result = adapter.testMapPermissionsToArgs(permissions);

      expect(result).toContain('--yolo');
      // Не должно быть --allowed-tools при fullAccess
      expect(result).not.toContain('--allowed-tools');
    });
  });

  describe('безопасность', () => {
    test('НЕ должен использовать --yolo без явных permissions', () => {
      const permissions: StepPermissions = {
        read: ['*.md'] // Только чтение
      };

      const result = adapter.testMapPermissionsToArgs(permissions);

      // Только read не должен включать --yolo
      expect(result).not.toContain('--yolo');
      expect(result).not.toContain('--allowed-tools');
    });

    test('должен комбинировать write_file и shell при write + execute', () => {
      const permissions: StepPermissions = {
        write: ['output/*.md'],
        execute: true
      };

      const result = adapter.testMapPermissionsToArgs(permissions);

      expect(result).toContain('--allowed-tools');
      const toolsIndex = result.indexOf('--allowed-tools');
      const toolsValue = result[toolsIndex + 1];
      expect(toolsValue).toContain('write_file');
      expect(toolsValue).toContain('shell');
    });
  });
});

describe('GeminiCLIAdapter - prepareArguments', () => {
  let adapter: TestableGeminiCLIAdapter;

  beforeEach(() => {
    adapter = new TestableGeminiCLIAdapter();
  });

  test('должен добавлять --model если модель указана', () => {
    const request: AdapterRequest = {
      prompt: 'test prompt',
      model: 'gemini-pro'
    };

    const args = adapter.testPrepareArguments(request);

    expect(args).toContain('--model');
    const modelIndex = args.indexOf('--model');
    expect(args[modelIndex + 1]).toBe('gemini-pro');
  });

  test('НЕ должен добавлять --yolo без permissions', () => {
    const request: AdapterRequest = {
      prompt: 'test prompt'
    };

    const args = adapter.testPrepareArguments(request);

    expect(args).not.toContain('--yolo');
    expect(args).not.toContain('--allowed-tools');
  });

  test('должен добавлять инструменты при permissions.write', () => {
    const request: AdapterRequest = {
      prompt: 'test prompt',
      permissions: { write: ['*.md'] }
    };

    const args = adapter.testPrepareArguments(request);

    expect(args).toContain('--allowed-tools');
    expect(args).toContain('--yolo');
  });
});

describe('GeminiCLIAdapter - appendFileWriteInstruction', () => {
  let adapter: TestableGeminiCLIAdapter;

  beforeEach(() => {
    adapter = new TestableGeminiCLIAdapter();
  });

  test('должен добавлять инструкцию с write_file для Gemini', () => {
    const prompt = 'Generate a document';
    const outputPath = 'output/result.md';

    const result = adapter.testAppendFileWriteInstruction(prompt, outputPath, 'write_file');

    expect(result).toContain(prompt);
    expect(result).toContain(outputPath);
    expect(result).toContain('write_file');
    expect(result).toContain('CRITICAL');
  });
});

describe('GeminiCLIAdapter - базовые свойства', () => {
  test('должен иметь правильное имя и версию', () => {
    const adapter = new GeminiCLIAdapter();

    expect(adapter.name).toBe('gemini-cli');
    expect(adapter.version).toBe('1.0.0');
  });

  test('должен использовать команду gemini', () => {
    const adapter = new GeminiCLIAdapter();
    const config = (adapter as any).config;

    expect(config.command).toBe('gemini');
  });

  test('НЕ должен использовать stdin', () => {
    const adapter = new GeminiCLIAdapter();
    const config = (adapter as any).config;

    expect(config.useStdin).toBe(false);
  });
});
