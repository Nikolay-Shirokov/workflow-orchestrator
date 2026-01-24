/**
 * Property-based тесты безопасности для системы permissions
 * Проверяют что опасные флаги НИКОГДА не используются без явного fullAccess
 *
 * Requirements: 1.6, 2.7, 4.3, 9.1, 9.6
 */

import * as fc from 'fast-check';
import { CodexCLIAdapter, CodexAdapterRequest } from '../../src/adapters/codex-cli-adapter.js';
import { ClaudeCLIAdapter, ClaudeAdapterRequest } from '../../src/adapters/claude-cli-adapter.js';
import { GeminiCLIAdapter, GeminiAdapterRequest } from '../../src/adapters/gemini-cli-adapter.js';
import { StepPermissions, AdapterRequest } from '../../src/core/types.js';

/**
 * Тестовые классы для доступа к protected методам
 */
class TestableCodexCLIAdapter extends CodexCLIAdapter {
  public testPrepareArguments(request: AdapterRequest): string[] {
    return this.prepareArguments(request);
  }

  public testMapPermissionsToArgs(permissions?: StepPermissions): string[] {
    return this.mapPermissionsToArgs(permissions);
  }
}

class TestableClaudeCLIAdapter extends ClaudeCLIAdapter {
  public testPrepareArguments(request: AdapterRequest): string[] {
    return this.prepareArguments(request);
  }

  public testMapPermissionsToArgs(permissions?: StepPermissions, request?: ClaudeAdapterRequest): string[] {
    return this.mapPermissionsToArgs(permissions, request);
  }
}

class TestableGeminiCLIAdapter extends GeminiCLIAdapter {
  public testPrepareArguments(request: AdapterRequest): string[] {
    return this.prepareArguments(request);
  }

  public testMapPermissionsToArgs(permissions?: StepPermissions, request?: GeminiAdapterRequest): string[] {
    return this.mapPermissionsToArgs(permissions, request);
  }
}

/**
 * Генератор безопасных паттернов файлов (без path traversal)
 * Исключает ".." последовательности которые блокируются валидацией
 */
const safeFilePatternArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter(s => !s.includes('..'))
  .map(s => s || 'file.txt'); // Fallback если пустая строка

/**
 * Генератор permissions БЕЗ fullAccess
 * Используется для тестирования безопасности по умолчанию
 */
const safePermissionsArb = fc.record({
  read: fc.option(
    fc.array(safeFilePatternArb, { minLength: 0, maxLength: 3 }),
    { nil: undefined }
  ),
  write: fc.option(
    fc.array(safeFilePatternArb, { minLength: 0, maxLength: 3 }),
    { nil: undefined }
  ),
  execute: fc.option(fc.boolean(), { nil: undefined })
  // fullAccess намеренно НЕ включен
});

/**
 * Генератор permissions БЕЗ execute
 * Используется для тестирования запрета execute по умолчанию
 */
const noExecutePermissionsArb = fc.record({
  read: fc.option(
    fc.array(safeFilePatternArb, { minLength: 0, maxLength: 3 }),
    { nil: undefined }
  ),
  write: fc.option(
    fc.array(safeFilePatternArb, { minLength: 0, maxLength: 3 }),
    { nil: undefined }
  ),
  fullAccess: fc.option(fc.constant(false), { nil: undefined })
  // execute намеренно НЕ включен
});

describe('Security Property Tests - Codex Adapter', () => {
  /**
   * Property 1: Безопасность по умолчанию
   * --yolo и danger-full-access НИКОГДА не используются без fullAccess
   * Validates: Requirements 1.6, 9.1
   */
  describe('Property 1: Безопасность по умолчанию', () => {
    test('НЕ должен использовать --yolo без fullAccess (100 итераций)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }), // Промпт
          safePermissionsArb,
          (prompt, permissions) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { prompt, permissions };

            const args = adapter.testPrepareArguments(request);

            // --yolo НЕ должен присутствовать
            expect(args).not.toContain('--yolo');

            // danger-full-access НЕ должен присутствовать
            const sandboxIndex = args.indexOf('--sandbox');
            if (sandboxIndex !== -1) {
              expect(args[sandboxIndex + 1]).not.toBe('danger-full-access');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('должен использовать --sandbox read-only или workspace-write', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          safePermissionsArb,
          (prompt, permissions) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { prompt, permissions };

            const args = adapter.testPrepareArguments(request);

            const sandboxIndex = args.indexOf('--sandbox');
            if (sandboxIndex !== -1) {
              const sandboxMode = args[sandboxIndex + 1];
              expect(['read-only', 'workspace-write']).toContain(sandboxMode);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Запрет execute по умолчанию
   * --full-auto НЕ должен использоваться без permissions.execute
   * Validates: Requirements 4.3, 9.6
   */
  describe('Property 2: Запрет execute по умолчанию', () => {
    test('НЕ должен использовать --full-auto без permissions.execute', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          noExecutePermissionsArb,
          (prompt, permissions) => {
            const adapter = new TestableCodexCLIAdapter();
            const request: CodexAdapterRequest = { prompt, permissions };

            const args = adapter.testPrepareArguments(request);

            // --full-auto НЕ должен присутствовать без execute
            expect(args).not.toContain('--full-auto');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

describe('Security Property Tests - Claude Adapter', () => {
  /**
   * Property 1: Безопасность по умолчанию
   * --dangerously-skip-permissions НИКОГДА не используется без fullAccess
   * Validates: Requirements 2.7, 9.1
   */
  describe('Property 1: Безопасность по умолчанию', () => {
    test('НЕ должен использовать --dangerously-skip-permissions без fullAccess (100 итераций)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          safePermissionsArb,
          (prompt, permissions) => {
            const adapter = new TestableClaudeCLIAdapter();
            const request: ClaudeAdapterRequest = { prompt, permissions };

            const args = adapter.testPrepareArguments(request);

            // --dangerously-skip-permissions НЕ должен присутствовать
            expect(args).not.toContain('--dangerously-skip-permissions');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Запрет Bash по умолчанию
   * Bash инструмент НЕ должен быть доступен без permissions.execute
   * Validates: Requirements 2.4, 4.3
   */
  describe('Property 2: Запрет Bash по умолчанию', () => {
    test('НЕ должен включать Bash без permissions.execute', () => {
      fc.assert(
        fc.property(
          noExecutePermissionsArb,
          (permissions) => {
            const adapter = new TestableClaudeCLIAdapter();

            const args = adapter.testMapPermissionsToArgs(permissions);

            // Проверяем что Bash не включен в tools
            const toolsIndex = args.indexOf('--tools');
            if (toolsIndex !== -1) {
              const toolsValue = args[toolsIndex + 1];
              expect(toolsValue).not.toContain('Bash');
            }

            // И не включен в allowedTools
            const allowedIndex = args.indexOf('--allowedTools');
            if (allowedIndex !== -1) {
              const allowedValue = args[allowedIndex + 1];
              expect(allowedValue).not.toContain('Bash');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 3: Базовые инструменты чтения всегда включены
   * Read, Grep, Glob должны быть включены при любых permissions с write
   */
  describe('Property 3: Базовые инструменты чтения', () => {
    test('должен включать Read, Grep, Glob при permissions.write', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 3 }),
          (writePatterns) => {
            const adapter = new TestableClaudeCLIAdapter();
            const permissions: StepPermissions = { write: writePatterns };

            const args = adapter.testMapPermissionsToArgs(permissions);

            const toolsIndex = args.indexOf('--tools');
            expect(toolsIndex).not.toBe(-1);

            const toolsValue = args[toolsIndex + 1];
            expect(toolsValue).toContain('Read');
            expect(toolsValue).toContain('Grep');
            expect(toolsValue).toContain('Glob');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

describe('Security Property Tests - Gemini Adapter', () => {
  /**
   * Property 1: Безопасность по умолчанию
   * --yolo НИКОГДА не используется без write/execute/fullAccess
   * Validates: Requirements 9.1
   */
  describe('Property 1: Безопасность по умолчанию', () => {
    test('НЕ должен использовать --yolo без write/execute/fullAccess (100 итераций)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.record({
            read: fc.option(
              fc.array(safeFilePatternArb, { minLength: 0, maxLength: 3 }),
              { nil: undefined }
            )
            // Только read, без write/execute/fullAccess
          }),
          (prompt, permissions) => {
            const adapter = new TestableGeminiCLIAdapter();
            const request: GeminiAdapterRequest = { prompt, permissions };

            const args = adapter.testPrepareArguments(request);

            // --yolo НЕ должен присутствовать только с read
            expect(args).not.toContain('--yolo');
            expect(args).not.toContain('--allowed-tools');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Запрет shell по умолчанию
   * shell инструмент НЕ должен быть доступен без permissions.execute
   */
  describe('Property 2: Запрет shell по умолчанию', () => {
    test('НЕ должен включать shell без permissions.execute', () => {
      fc.assert(
        fc.property(
          fc.record({
            read: fc.option(
              fc.array(safeFilePatternArb, { minLength: 0, maxLength: 3 }),
              { nil: undefined }
            ),
            write: fc.option(
              fc.array(safeFilePatternArb, { minLength: 0, maxLength: 3 }),
              { nil: undefined }
            )
            // execute НЕ включен
          }),
          (permissions) => {
            const adapter = new TestableGeminiCLIAdapter();

            const args = adapter.testMapPermissionsToArgs(permissions);

            // shell не должен быть в allowed-tools
            const toolsIndex = args.indexOf('--allowed-tools');
            if (toolsIndex !== -1) {
              const toolsValue = args[toolsIndex + 1];
              expect(toolsValue).not.toContain('shell');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

describe('Cross-Adapter Security Properties', () => {
  /**
   * Property: Консистентность поведения
   * Все адаптеры должны быть безопасными по умолчанию без permissions
   */
  describe('Property: Консистентность безопасности', () => {
    test('все адаптеры безопасны без permissions', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (prompt) => {
            // Codex
            const codexAdapter = new TestableCodexCLIAdapter();
            const codexArgs = codexAdapter.testPrepareArguments({ prompt });
            expect(codexArgs).not.toContain('--yolo');
            expect(codexArgs).toContain('--sandbox');

            // Claude
            const claudeAdapter = new TestableClaudeCLIAdapter();
            const claudeArgs = claudeAdapter.testPrepareArguments({ prompt });
            expect(claudeArgs).not.toContain('--dangerously-skip-permissions');

            // Gemini
            const geminiAdapter = new TestableGeminiCLIAdapter();
            const geminiArgs = geminiAdapter.testPrepareArguments({ prompt });
            expect(geminiArgs).not.toContain('--yolo');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
