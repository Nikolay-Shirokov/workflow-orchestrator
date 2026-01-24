/**
 * Unit-тесты для новых методов BaseCLIAdapter
 * Тестирует appendFileWriteInstruction, readResultFromFile, validatePermissions
 */

import { BaseCLIAdapter } from '../../src/adapters/base-cli-adapter.js';
import { AdapterConfig, StepPermissions } from '../../src/core/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Тестовый адаптер для доступа к protected методам
 */
class TestBaseCLIAdapter extends BaseCLIAdapter {
  name = 'test-adapter';
  version = '1.0.0';

  // Expose protected methods for testing
  public testAppendFileWriteInstruction(
    prompt: string,
    outputPath: string,
    toolName?: string
  ): string {
    return this.appendFileWriteInstruction(prompt, outputPath, toolName);
  }

  public testReadResultFromFile(
    outputPath: string,
    stdout: string,
    options?: { maxWaitTime?: number; pollInterval?: number }
  ): Promise<{ content: string; source: 'file' | 'stdout' }> {
    return this.readResultFromFile(outputPath, stdout, options);
  }

  public testValidatePermissions(permissions: StepPermissions): void {
    return this.validatePermissions(permissions);
  }
}

describe('BaseCLIAdapter - appendFileWriteInstruction', () => {
  let adapter: TestBaseCLIAdapter;

  beforeEach(() => {
    const config: AdapterConfig = {
      name: 'test',
      command: 'test-command',
      args: []
    };
    adapter = new TestBaseCLIAdapter(config);
  });

  test('должен добавлять инструкцию с именем инструмента', () => {
    const prompt = 'Generate a document';
    const outputPath = 'output/result.md';
    const toolName = 'write_file';

    const result = adapter.testAppendFileWriteInstruction(prompt, outputPath, toolName);

    expect(result).toContain(prompt);
    expect(result).toContain(outputPath);
    expect(result).toContain(toolName);
    expect(result).toContain('CRITICAL');
    expect(result).toContain('Save your complete response');
  });

  test('должен добавлять инструкцию без имени инструмента', () => {
    const prompt = 'Generate a document';
    const outputPath = 'output/result.md';

    const result = adapter.testAppendFileWriteInstruction(prompt, outputPath);

    expect(result).toContain(prompt);
    expect(result).toContain(outputPath);
    expect(result).toContain('CRITICAL');
    expect(result).not.toContain('Use the');
  });

  test('должен включать fallback инструкцию', () => {
    const prompt = 'Generate a document';
    const outputPath = 'output/result.md';

    const result = adapter.testAppendFileWriteInstruction(prompt, outputPath, 'Write');

    expect(result).toContain('output the full response to console');
  });

  test('должен указывать что путь относительный', () => {
    const prompt = 'Generate a document';
    const outputPath = 'output/result.md';

    const result = adapter.testAppendFileWriteInstruction(prompt, outputPath);

    expect(result).toContain('relative to the current working directory');
  });

  test('должен сохранять оригинальный промпт в начале', () => {
    const prompt = 'Generate a document about TypeScript';
    const outputPath = 'output/result.md';

    const result = adapter.testAppendFileWriteInstruction(prompt, outputPath);

    expect(result.startsWith(prompt)).toBe(true);
  });
});

describe('BaseCLIAdapter - readResultFromFile', () => {
  let adapter: TestBaseCLIAdapter;
  let tempDir: string;

  beforeEach(async () => {
    const config: AdapterConfig = {
      name: 'test',
      command: 'test-command',
      args: []
    };
    adapter = new TestBaseCLIAdapter(config);

    // Create temp directory for test files
    tempDir = path.join(os.tmpdir(), `base-adapter-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('должен читать содержимое из файла если файл существует', async () => {
    const filePath = path.join(tempDir, 'result.md');
    const fileContent = '# Document\n\nThis is the content.';
    await fs.writeFile(filePath, fileContent, 'utf-8');

    const result = await adapter.testReadResultFromFile(filePath, 'stdout content', {
      maxWaitTime: 1000,
      pollInterval: 100
    });

    expect(result.content).toBe(fileContent);
    expect(result.source).toBe('file');
  });

  test('должен использовать stdout если файл не существует', async () => {
    const filePath = path.join(tempDir, 'nonexistent.md');
    const stdoutContent = 'This is stdout content';

    const result = await adapter.testReadResultFromFile(filePath, stdoutContent, {
      maxWaitTime: 500,
      pollInterval: 100
    });

    expect(result.content).toBe(stdoutContent);
    expect(result.source).toBe('stdout');
  });

  test('должен использовать stdout если файл пустой', async () => {
    const filePath = path.join(tempDir, 'empty.md');
    await fs.writeFile(filePath, '', 'utf-8');
    const stdoutContent = 'This is stdout content';

    const result = await adapter.testReadResultFromFile(filePath, stdoutContent, {
      maxWaitTime: 500,
      pollInterval: 100
    });

    expect(result.content).toBe(stdoutContent);
    expect(result.source).toBe('stdout');
  });

  test('должен ждать появления файла (polling)', async () => {
    const filePath = path.join(tempDir, 'delayed.md');
    const fileContent = 'Delayed content';
    const stdoutContent = 'stdout fallback';

    // Create file after a delay
    setTimeout(async () => {
      await fs.writeFile(filePath, fileContent, 'utf-8');
    }, 200);

    const result = await adapter.testReadResultFromFile(filePath, stdoutContent, {
      maxWaitTime: 2000,
      pollInterval: 100
    });

    expect(result.content).toBe(fileContent);
    expect(result.source).toBe('file');
  });

  test('должен возвращать trimmed content', async () => {
    const filePath = path.join(tempDir, 'whitespace.md');
    const fileContent = '  \n  Content with whitespace  \n  ';
    await fs.writeFile(filePath, fileContent, 'utf-8');

    const result = await adapter.testReadResultFromFile(filePath, 'stdout', {
      maxWaitTime: 1000,
      pollInterval: 100
    });

    expect(result.content).toBe('Content with whitespace');
    expect(result.source).toBe('file');
  });

  test('должен использовать stdout при таймауте', async () => {
    const filePath = path.join(tempDir, 'timeout.md');
    const stdoutContent = 'Timeout fallback';

    // File will never be created
    const result = await adapter.testReadResultFromFile(filePath, stdoutContent, {
      maxWaitTime: 300,
      pollInterval: 100
    });

    expect(result.content).toBe(stdoutContent);
    expect(result.source).toBe('stdout');
  });
});

describe('BaseCLIAdapter - validatePermissions', () => {
  let adapter: TestBaseCLIAdapter;

  beforeEach(() => {
    const config: AdapterConfig = {
      name: 'test',
      command: 'test-command',
      args: []
    };
    adapter = new TestBaseCLIAdapter(config);
  });

  test('должен пропускать валидные permissions с read', () => {
    const permissions: StepPermissions = {
      read: ['*.md', 'src/**/*.ts']
    };

    expect(() => adapter.testValidatePermissions(permissions)).not.toThrow();
  });

  test('должен пропускать валидные permissions с write', () => {
    const permissions: StepPermissions = {
      write: ['output/*.md']
    };

    expect(() => adapter.testValidatePermissions(permissions)).not.toThrow();
  });

  test('должен пропускать валидные permissions с execute', () => {
    const permissions: StepPermissions = {
      execute: true
    };

    expect(() => adapter.testValidatePermissions(permissions)).not.toThrow();
  });

  test('должен пропускать fullAccess без других permissions', () => {
    const permissions: StepPermissions = {
      fullAccess: true
    };

    expect(() => adapter.testValidatePermissions(permissions)).not.toThrow();
  });

  test('должен выбрасывать ошибку при fullAccess + read', () => {
    const permissions: StepPermissions = {
      fullAccess: true,
      read: ['*.md']
    };

    expect(() => adapter.testValidatePermissions(permissions)).toThrow(
      /fullAccess нельзя комбинировать/
    );
  });

  test('должен выбрасывать ошибку при fullAccess + write', () => {
    const permissions: StepPermissions = {
      fullAccess: true,
      write: ['*.md']
    };

    expect(() => adapter.testValidatePermissions(permissions)).toThrow(
      /fullAccess нельзя комбинировать/
    );
  });

  test('должен выбрасывать ошибку при path traversal в read', () => {
    const permissions: StepPermissions = {
      read: ['../secret/*.md']
    };

    expect(() => adapter.testValidatePermissions(permissions)).toThrow(
      /path traversal/
    );
  });

  test('должен выбрасывать ошибку при path traversal в write', () => {
    const permissions: StepPermissions = {
      write: ['output/../../../etc/passwd']
    };

    expect(() => adapter.testValidatePermissions(permissions)).toThrow(
      /path traversal/
    );
  });

  test('должен выбрасывать ошибку при скрытом path traversal', () => {
    const permissions: StepPermissions = {
      read: ['valid/path/../../../secret']
    };

    expect(() => adapter.testValidatePermissions(permissions)).toThrow(
      /path traversal/
    );
  });

  test('должен пропускать пустые массивы permissions', () => {
    const permissions: StepPermissions = {
      read: [],
      write: []
    };

    expect(() => adapter.testValidatePermissions(permissions)).not.toThrow();
  });
});
