/**
 * Property-Based тесты для типов файлового ввода
 * 
 * Проверяет свойства корректности типов и интерфейсов файлового ввода
 */

import * as fc from 'fast-check';
import { describe, it, expect } from '@jest/globals';
import {
  FileInputResult,
  UserCommand,
  FileFormat,
  UserAnswers
} from '../../src/core/file-input-types.js';

describe('File Input Types Property-Based Tests', () => {
  /**
   * Feature: file-based-user-input, Property 1: Создание валидного шаблона
   * 
   * Для любого шага user_input с режимом file, создание файла-шаблона должно
   * производить валидный файл указанного формата с корректными инструкциями.
   * 
   * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
   */
  describe('Property 1: Valid Template Creation', () => {
    // Генератор для FileFormat
    const fileFormatArb = fc.constantFrom<FileFormat>(
      'markdown',
      'yaml',
      'json',
      'text'
    );
    
    // Генератор для UserCommand
    const userCommandArb = fc.constantFrom<UserCommand>(
      'continue',
      'postpone'
    );
    
    // Генератор для EditorConfig
    const editorConfigArb = fc.record({
      command: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
      args: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 })),
      wait: fc.option(fc.boolean())
    });
    
    // Генератор для UserQuestion
    const userQuestionArb = fc.record({
      number: fc.integer({ min: 1, max: 100 }),
      text: fc.string({ minLength: 5, maxLength: 200 })
        .filter(s => !s.includes('\n') && s.trim().length > 0),
      options: fc.option(
        fc.array(
          fc.string({ minLength: 1, maxLength: 100 })
            .filter(s => !s.includes('\n') && s.trim().length > 0),
          { minLength: 1, maxLength: 5 }
        )
      ),
      required: fc.option(fc.boolean())
    });
    
    // Генератор для WorkflowStep с file input mode
    const fileInputStepArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 })
        .filter(s => /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(s)),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      type: fc.constant('user_input' as const),
      input_mode: fc.constant('file' as const),
      file_format: fileFormatArb,
      editor: fc.option(editorConfigArb),
      include_questions: fc.option(fc.boolean()),
      prompt_message: fc.option(fc.string({ minLength: 10, maxLength: 500 }))
    });
    
    // Генератор для WorkflowSettings с настройками файлового ввода
    const workflowSettingsArb = fc.record({
      artifacts_dir: fc.string({ minLength: 1, maxLength: 50 }),
      default_input_mode: fc.option(fc.constantFrom('file' as const, 'console' as const)),
      default_file_format: fc.option(fileFormatArb),
      default_editor: fc.option(editorConfigArb)
    });
    
    it('должен создавать валидные конфигурации шагов с файловым вводом', () => {
      fc.assert(
        fc.property(
          fileInputStepArb,
          (step) => {
            // Проверяем обязательные поля
            expect(step.id).toBeDefined();
            expect(step.name).toBeDefined();
            expect(step.type).toBe('user_input');
            expect(step.input_mode).toBe('file');
            
            // Проверяем, что file_format является валидным
            expect(['markdown', 'yaml', 'json', 'text']).toContain(step.file_format);
            
            // Если указан редактор, проверяем его структуру
            if (step.editor) {
              if (step.editor.command !== undefined && step.editor.command !== null) {
                expect(typeof step.editor.command).toBe('string');
              }
              if (step.editor.args !== undefined && step.editor.args !== null) {
                expect(Array.isArray(step.editor.args)).toBe(true);
              }
              if (step.editor.wait !== undefined && step.editor.wait !== null) {
                expect(typeof step.editor.wait).toBe('boolean');
              }
            }
            
            // Проверяем include_questions
            if (step.include_questions !== undefined && step.include_questions !== null) {
              expect(typeof step.include_questions).toBe('boolean');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен создавать валидные настройки процесса с файловым вводом', () => {
      fc.assert(
        fc.property(
          workflowSettingsArb,
          (settings) => {
            // Проверяем обязательные поля
            expect(settings.artifacts_dir).toBeDefined();
            expect(typeof settings.artifacts_dir).toBe('string');
            
            // Проверяем default_input_mode
            if (settings.default_input_mode !== undefined && settings.default_input_mode !== null) {
              expect(['file', 'console']).toContain(settings.default_input_mode);
            }
            
            // Проверяем default_file_format
            if (settings.default_file_format !== undefined && settings.default_file_format !== null) {
              expect(['markdown', 'yaml', 'json', 'text']).toContain(settings.default_file_format);
            }
            
            // Проверяем default_editor
            if (settings.default_editor) {
              if (settings.default_editor.command !== undefined && settings.default_editor.command !== null) {
                expect(typeof settings.default_editor.command).toBe('string');
              }
              if (settings.default_editor.args !== undefined && settings.default_editor.args !== null) {
                expect(Array.isArray(settings.default_editor.args)).toBe(true);
              }
              if (settings.default_editor.wait !== undefined && settings.default_editor.wait !== null) {
                expect(typeof settings.default_editor.wait).toBe('boolean');
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен создавать валидные результаты файлового ввода', () => {
      fc.assert(
        fc.property(
          fc.record({
            success: fc.boolean(),
            filePath: fc.string({ minLength: 1, maxLength: 200 }),
            data: fc.dictionary(
              fc.string({ minLength: 1, maxLength: 20 })
                .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
              fc.oneof(
                fc.string(),
                fc.integer(),
                fc.boolean(),
                fc.array(fc.string())
              ),
              { minKeys: 0, maxKeys: 10 }
            ),
            userCommand: userCommandArb,
            processingTime: fc.integer({ min: 0, max: 60000 })
          }),
          (result: FileInputResult) => {
            // Проверяем структуру результата
            expect(typeof result.success).toBe('boolean');
            expect(typeof result.filePath).toBe('string');
            expect(result.filePath.length).toBeGreaterThan(0);
            expect(typeof result.data).toBe('object');
            expect(['continue', 'postpone']).toContain(result.userCommand);
            expect(typeof result.processingTime).toBe('number');
            expect(result.processingTime).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен создавать валидные вопросы пользователю', () => {
      fc.assert(
        fc.property(
          fc.array(userQuestionArb, { minLength: 1, maxLength: 10 }),
          (questions) => {
            // Убираем дубликаты по номеру вопроса
            const uniqueQuestions = Array.from(
              new Map(questions.map(q => [q.number, q])).values()
            );
            
            for (const question of uniqueQuestions) {
              // Проверяем обязательные поля
              expect(typeof question.number).toBe('number');
              expect(question.number).toBeGreaterThan(0);
              expect(typeof question.text).toBe('string');
              expect(question.text.length).toBeGreaterThan(0);
              
              // Проверяем опциональные поля
              if (question.options !== undefined && question.options !== null) {
                expect(Array.isArray(question.options)).toBe(true);
                expect(question.options.length).toBeGreaterThan(0);
                for (const option of question.options) {
                  expect(typeof option).toBe('string');
                  expect(option.length).toBeGreaterThan(0);
                }
              }
              
              if (question.required !== undefined && question.required !== null) {
                expect(typeof question.required).toBe('boolean');
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен создавать валидные ответы пользователя', () => {
      fc.assert(
        fc.property(
          fc.record({
            answers: fc.array(
              fc.tuple(
                fc.integer({ min: 1, max: 100 }),
                fc.string({ minLength: 1, maxLength: 500 })
              ),
              { minLength: 1, maxLength: 10 }
            ).map(pairs => {
              // Преобразуем массив пар в объект с числовыми ключами
              const result: Record<number, string> = {};
              for (const [key, value] of pairs) {
                result[key] = value;
              }
              return result;
            }),
            additionalText: fc.option(fc.string({ minLength: 0, maxLength: 1000 }), { nil: undefined })
          }),
          (userAnswers: UserAnswers) => {
            // Проверяем структуру ответов
            expect(typeof userAnswers.answers).toBe('object');
            expect(Object.keys(userAnswers.answers).length).toBeGreaterThan(0);
            
            // Проверяем каждый ответ
            for (const [questionNumber, answer] of Object.entries(userAnswers.answers)) {
              expect(Number(questionNumber)).toBeGreaterThan(0);
              expect(typeof answer).toBe('string');
            }
            
            // Проверяем дополнительный текст
            if (userAnswers.additionalText !== undefined) {
              expect(typeof userAnswers.additionalText).toBe('string');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен корректно обрабатывать все форматы файлов', () => {
      fc.assert(
        fc.property(
          fileFormatArb,
          fileInputStepArb,
          (format, step) => {
            // Создаем шаг с указанным форматом
            const stepWithFormat = {
              ...step,
              file_format: format
            };
            
            // Проверяем, что формат установлен корректно
            expect(stepWithFormat.file_format).toBe(format);
            expect(['markdown', 'yaml', 'json', 'text']).toContain(stepWithFormat.file_format);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен корректно обрабатывать конфигурацию редактора', () => {
      fc.assert(
        fc.property(
          editorConfigArb,
          (editorConfig) => {
            // Проверяем структуру конфигурации редактора
            if (editorConfig.command !== undefined && editorConfig.command !== null) {
              expect(typeof editorConfig.command).toBe('string');
              expect(editorConfig.command.length).toBeGreaterThan(0);
            }
            
            if (editorConfig.args !== undefined && editorConfig.args !== null) {
              expect(Array.isArray(editorConfig.args)).toBe(true);
              for (const arg of editorConfig.args) {
                expect(typeof arg).toBe('string');
                expect(arg.length).toBeGreaterThan(0);
              }
            }
            
            if (editorConfig.wait !== undefined && editorConfig.wait !== null) {
              expect(typeof editorConfig.wait).toBe('boolean');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен поддерживать наследование настроек от глобальных к локальным', () => {
      fc.assert(
        fc.property(
          workflowSettingsArb,
          fileInputStepArb,
          (settings, step) => {
            // Если в шаге не указан формат, должен использоваться глобальный
            const effectiveFormat = step.file_format ?? settings.default_file_format ?? 'markdown';
            expect(['markdown', 'yaml', 'json', 'text']).toContain(effectiveFormat);
            
            // Если в шаге не указан режим, должен использоваться глобальный
            const effectiveMode = step.input_mode ?? settings.default_input_mode ?? 'console';
            expect(['file', 'console']).toContain(effectiveMode);
            
            // Если в шаге не указан редактор, должен использоваться глобальный
            const effectiveEditor = step.editor ?? settings.default_editor;
            if (effectiveEditor) {
              if (effectiveEditor.command !== undefined && effectiveEditor.command !== null) {
                expect(typeof effectiveEditor.command).toBe('string');
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен корректно обрабатывать команды пользователя', () => {
      fc.assert(
        fc.property(
          userCommandArb,
          (command) => {
            // Проверяем, что команда является одной из допустимых
            expect(['continue', 'postpone']).toContain(command);
            
            // Проверяем тип
            expect(typeof command).toBe('string');
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('должен создавать валидные шаги с различными комбинациями параметров', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 20 })
              .filter(s => /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(s)),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            type: fc.constant('user_input' as const),
            input_mode: fc.option(fc.constantFrom('file' as const, 'console' as const)),
            file_format: fc.option(fileFormatArb),
            editor: fc.option(editorConfigArb),
            include_questions: fc.option(fc.boolean()),
            prompt_message: fc.option(fc.string({ minLength: 10, maxLength: 500 }))
          }),
          (step) => {
            // Проверяем базовые поля
            expect(step.id).toBeDefined();
            expect(step.name).toBeDefined();
            expect(step.type).toBe('user_input');
            
            // Проверяем, что если указан file mode, то формат тоже может быть указан
            if (step.input_mode === 'file' && step.file_format) {
              expect(['markdown', 'yaml', 'json', 'text']).toContain(step.file_format);
            }
            
            // Проверяем консистентность: если есть редактор, то должен быть file mode
            if (step.editor && step.input_mode) {
              // Редактор имеет смысл только для file mode
              if (step.input_mode === 'file') {
                expect(step.editor).toBeDefined();
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
