/**
 * Unit-тесты для ClaudeCLIAdapter
 * Тестирует mapPermissionsToArgs и поддержку permissions
 */

import { ClaudeCLIAdapter, ClaudeAdapterRequest } from '../../src/adapters/claude-cli-adapter.js';
import { AdapterRequest, StepPermissions } from '../../src/core/types.js';

/**
 * Тестовый класс для доступа к protected методам
 */
class TestableClaudeCLIAdapter extends ClaudeCLIAdapter {
  public testPrepareArguments(request: AdapterRequest): string[] {
    return this.prepareArguments(request);
  }

  public testPreparePrompt(request: AdapterRequest): string {
    return this.preparePrompt(request);
  }

  public testMapPermissionsToArgs(
    permissions?: StepPermissions,
    claudeRequest?: ClaudeAdapterRequest
  ): string[] {
    return this.mapPermissionsToArgs(permissions, claudeRequest);
  }
}

describe('ClaudeCLIAdapter - mapPermissionsToArgs', () => {
  let adapter: TestableClaudeCLIAdapter;

  beforeEach(() => {
    adapter = new TestableClaudeCLIAdapter();
  });

  describe('без permissions', () => {
    test('должен возвращать базовые инструменты чтения без permissions', () => {
      const result = adapter.testMapPermissionsToArgs();

      // Базовые инструменты чтения всегда включены
      expect(result).toContain('--tools');
      expect(result.join(' ')).toContain('Read');
      expect(result.join(' ')).toContain('Grep');
      expect(result.join(' ')).toContain('Glob');
    });

    test('должен возвращать базовые инструменты с undefined permissions', () => {
      const result = adapter.testMapPermissionsToArgs(undefined);

      // Базовые инструменты чтения всегда включены
      expect(result).toContain('--tools');
    });
  });

  describe('с явными опциями в запросе', () => {
    test('должен использовать явно указанные tools', () => {
      const claudeRequest: ClaudeAdapterRequest = {
        prompt: 'test',
        tools: ['Read', 'Write', 'Bash']
      };

      const result = adapter.testMapPermissionsToArgs(undefined, claudeRequest);

      expect(result).toContain('--tools');
      const toolsIndex = result.indexOf('--tools');
      expect(result[toolsIndex + 1]).toBe('Read,Write,Bash');
    });

    test('должен использовать явно указанные allowedTools', () => {
      const claudeRequest: ClaudeAdapterRequest = {
        prompt: 'test',
        allowedTools: ['Write']
      };

      const result = adapter.testMapPermissionsToArgs(undefined, claudeRequest);

      expect(result).toContain('--allowedTools');
      const allowedIndex = result.indexOf('--allowedTools');
      expect(result[allowedIndex + 1]).toBe('Write');
    });

    test('должен использовать явно указанные disabledTools', () => {
      const claudeRequest: ClaudeAdapterRequest = {
        prompt: 'test',
        disabledTools: ['Bash', 'Edit']
      };

      const result = adapter.testMapPermissionsToArgs(undefined, claudeRequest);

      expect(result).toContain('--disabledTools');
      const disabledIndex = result.indexOf('--disabledTools');
      expect(result[disabledIndex + 1]).toBe('Bash,Edit');
    });

    test('должен добавлять --dangerously-skip-permissions при skipPermissions', () => {
      const claudeRequest: ClaudeAdapterRequest = {
        prompt: 'test',
        skipPermissions: true
      };

      const result = adapter.testMapPermissionsToArgs(undefined, claudeRequest);

      expect(result).toContain('--dangerously-skip-permissions');
    });
  });

  describe('с permissions.write', () => {
    test('должен добавлять Write в tools и allowedTools', () => {
      const permissions: StepPermissions = {
        write: ['*.md']
      };

      const result = adapter.testMapPermissionsToArgs(permissions);

      expect(result).toContain('--tools');
      expect(result).toContain('--allowedTools');

      const toolsIndex = result.indexOf('--tools');
      const toolsValue = result[toolsIndex + 1];
      expect(toolsValue).toContain('Write');
      expect(toolsValue).toContain('Read');
      expect(toolsValue).toContain('Grep');
      expect(toolsValue).toContain('Glob');

      const allowedIndex = result.indexOf('--allowedTools');
      expect(result[allowedIndex + 1]).toContain('Write');
    });

    test('НЕ должен добавлять Bash без permissions.execute', () => {
      const permissions: StepPermissions = {
        write: ['*.md']
      };

      const result = adapter.testMapPermissionsToArgs(permissions);

      const toolsIndex = result.indexOf('--tools');
      const toolsValue = result[toolsIndex + 1];
      expect(toolsValue).not.toContain('Bash');
    });
  });

  describe('с permissions.execute', () => {
    test('должен добавлять Bash в tools и allowedTools', () => {
      const permissions: StepPermissions = {
        execute: true
      };

      const result = adapter.testMapPermissionsToArgs(permissions);

      expect(result).toContain('--tools');
      expect(result).toContain('--allowedTools');

      const toolsIndex = result.indexOf('--tools');
      const toolsValue = result[toolsIndex + 1];
      expect(toolsValue).toContain('Bash');

      const allowedIndex = result.indexOf('--allowedTools');
      expect(result[allowedIndex + 1]).toContain('Bash');
    });
  });

  describe('с permissions.fullAccess', () => {
    test('должен добавлять --dangerously-skip-permissions', () => {
      const permissions: StepPermissions = {
        fullAccess: true
      };

      const result = adapter.testMapPermissionsToArgs(permissions);

      expect(result).toContain('--dangerously-skip-permissions');
      // Не должно быть других флагов
      expect(result).not.toContain('--tools');
      expect(result).not.toContain('--allowedTools');
    });
  });

  describe('безопасность', () => {
    test('НЕ должен использовать --dangerously-skip-permissions без fullAccess', () => {
      const permissions: StepPermissions = {
        write: ['*.md'],
        execute: true
      };

      const result = adapter.testMapPermissionsToArgs(permissions);

      expect(result).not.toContain('--dangerously-skip-permissions');
    });

    test('всегда должен включать базовые инструменты чтения', () => {
      const permissions: StepPermissions = {
        write: ['output/*.md']
      };

      const result = adapter.testMapPermissionsToArgs(permissions);

      const toolsIndex = result.indexOf('--tools');
      const toolsValue = result[toolsIndex + 1];

      expect(toolsValue).toContain('Read');
      expect(toolsValue).toContain('Grep');
      expect(toolsValue).toContain('Glob');
    });
  });
});

describe('ClaudeCLIAdapter - prepareArguments', () => {
  let adapter: TestableClaudeCLIAdapter;

  beforeEach(() => {
    adapter = new TestableClaudeCLIAdapter();
  });

  test('должен начинаться с --print флага', () => {
    const request: AdapterRequest = { prompt: 'test prompt' };

    const args = adapter.testPrepareArguments(request);

    expect(args[0]).toBe('--print');
  });

  test('должен добавлять --model если модель указана', () => {
    const request: AdapterRequest = {
      prompt: 'test prompt',
      model: 'claude-3-opus'
    };

    const args = adapter.testPrepareArguments(request);

    expect(args).toContain('--model');
    const modelIndex = args.indexOf('--model');
    expect(args[modelIndex + 1]).toBe('claude-3-opus');
  });

  test('должен добавлять инструменты при permissions.write', () => {
    const request: AdapterRequest = {
      prompt: 'test prompt',
      permissions: { write: ['*.md'] }
    };

    const args = adapter.testPrepareArguments(request);

    expect(args).toContain('--tools');
    expect(args).toContain('--allowedTools');
  });

  test('должен добавлять инструкцию записи при outputFile + permissions.write', () => {
    const request: AdapterRequest = {
      prompt: 'Generate documentation',
      outputFile: 'docs/output.md',
      permissions: { write: ['docs/*.md'] }
    };

    // Промпт готовится отдельно от аргументов (передается через stdin)
    const prompt = adapter.testPreparePrompt(request);

    // Промпт должен содержать инструкцию записи
    expect(prompt).toContain('docs/output.md');
    expect(prompt).toContain('Write');
    expect(prompt).toContain('CRITICAL');
  });

  test('НЕ должен добавлять инструкцию записи без permissions.write', () => {
    const request: AdapterRequest = {
      prompt: 'Generate documentation',
      outputFile: 'docs/output.md'
      // Нет permissions.write
    };

    // Промпт готовится отдельно от аргументов (передается через stdin)
    const prompt = adapter.testPreparePrompt(request);

    // Промпт НЕ должен содержать инструкцию записи
    expect(prompt).not.toContain('CRITICAL');
    expect(prompt).not.toContain('Save your complete response');
  });

  test('должен добавлять --output-format если указан', () => {
    const request: ClaudeAdapterRequest = {
      prompt: 'test prompt',
      outputFormat: 'json'
    };

    const args = adapter.testPrepareArguments(request);

    expect(args).toContain('--output-format');
    const formatIndex = args.indexOf('--output-format');
    expect(args[formatIndex + 1]).toBe('json');
  });

  test('промпт передается через stdin, не в аргументах', () => {
    const request: AdapterRequest = {
      prompt: 'my test prompt',
      model: 'claude-3-opus',
      permissions: { write: ['*.md'] }
    };

    const args = adapter.testPrepareArguments(request);
    const prompt = adapter.testPreparePrompt(request);

    // Промпт НЕ должен быть в аргументах
    expect(args.join(' ')).not.toContain('my test prompt');

    // Промпт должен быть подготовлен отдельно
    expect(prompt).toContain('my test prompt');
  });
});

describe('ClaudeCLIAdapter - базовые свойства', () => {
  test('должен иметь правильное имя и версию', () => {
    const adapter = new ClaudeCLIAdapter();

    expect(adapter.name).toBe('claude-cli');
    expect(adapter.version).toBe('1.0.0');
  });

  test('должен использовать команду claude', () => {
    const adapter = new ClaudeCLIAdapter();
    const config = (adapter as any).config;

    expect(config.command).toBe('claude');
  });
});
