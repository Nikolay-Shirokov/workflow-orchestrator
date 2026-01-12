/**
 * Property-Based тесты для EditorManager
 * 
 * Проверяет свойства корректности работы с редакторами
 */

import * as fc from 'fast-check';
import { EditorManager } from '../../src/core/editor-manager.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import { EditorConfig } from '../../src/core/file-input-types.js';

describe('EditorManager Property-Based Tests', () => {
  let editorManager: EditorManager;
  let logger: Logger;
  
  beforeEach(() => {
    logger = new Logger({
      level: LogLevel.ERROR,
      enableConsole: false,
      enableFile: false
    });
    editorManager = new EditorManager(logger);
  });
  
  /**
   * Feature: file-based-user-input, Property 2: Открытие редактора
   * 
   * Для любого редактора, доступного на текущей платформе, попытка открыть 
   * файл должна успешно запустить редактор или вернуть понятную ошибку
   * 
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6
   */
  describe('Property 2: Editor Launch', () => {
    it('должен успешно определить системный редактор', async () => {
      fc.assert(
        fc.asyncProperty(
          fc.constant(null), // Просто запускаем тест несколько раз
          async () => {
            const editor = await editorManager.detectSystemEditor();
            
            // Проверяем, что вернулся валидный редактор
            expect(editor).toBeDefined();
            expect(typeof editor).toBe('string');
            expect(editor.length).toBeGreaterThan(0);
            
            // Проверяем, что это один из известных редакторов
            const platform = process.platform;
            const commonEditors = (editorManager as any).getCommonEditors();
            const fallback = platform === 'win32' ? 'notepad' : 'vi';
            
            // Редактор должен быть либо в списке популярных, либо fallback
            const isValid = commonEditors.includes(editor) || editor === fallback;
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: 10 } // Меньше итераций, так как это системный вызов
      );
    });
    
    it('должен корректно проверять доступность редакторов на текущей платформе', async () => {
      fc.assert(
        fc.asyncProperty(
          fc.oneof(
            // Доступные команды для текущей платформы
            fc.constantFrom(...(process.platform === 'win32' 
              ? ['cmd', 'powershell', 'notepad']
              : ['sh', 'bash', 'vi'])),
            // Недоступные команды - генерируем случайные строки
            fc.string({ minLength: 10, maxLength: 30 })
              .filter(s => /^[a-z]+$/.test(s))
              .filter(s => {
                // Исключаем известные команды для любой платформы
                const knownCommands = ['cmd', 'powershell', 'sh', 'bash', 'code', 'nano', 
                                      'vim', 'vi', 'notepad', 'kiro', 'cursor'];
                return !knownCommands.includes(s);
              })
          ),
          async (command) => {
            const isAvailable = await editorManager.checkEditorAvailability(command);
            
            // Проверяем, что результат - boolean
            expect(typeof isAvailable).toBe('boolean');
            
            // Для известных команд текущей платформы проверяем ожидаемый результат
            const knownCommands = process.platform === 'win32' 
              ? ['cmd', 'powershell', 'notepad']
              : ['sh', 'bash', 'vi'];
            
            if (knownCommands.includes(command)) {
              expect(isAvailable).toBe(true);
            }
          }
        ),
        { numRuns: 20 }
      );
    });
    
    it('должен корректно обрабатывать различные конфигурации редактора', async () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            command: fc.oneof(
              // Используем только редакторы, доступные на текущей платформе
              fc.constantFrom(...(process.platform === 'win32' 
                ? ['notepad', 'code']
                : ['vi', 'nano', 'code'])),
              fc.string({ minLength: 5, maxLength: 20 })
                .filter(s => /^[a-z-]+$/.test(s))
            ),
            args: fc.array(
              fc.string({ minLength: 1, maxLength: 20 })
                .filter(s => /^[a-z0-9-]+$/.test(s)),
              { maxLength: 3 }
            ),
            wait: fc.boolean()
          }),
          fc.string({ minLength: 5, maxLength: 50 })
            .filter(s => /^[a-zA-Z0-9/_.-]+$/.test(s)),
          async (config, filePath) => {
            // Мокируем spawn
            let spawnCalled = false;
            let spawnCommand = '';
            let spawnArgs: string[] = [];
            
            jest.spyOn(require('child_process'), 'spawn').mockImplementation((...args: unknown[]) => {
              spawnCalled = true;
              spawnCommand = args[0] as string;
              spawnArgs = args[1] as string[];
              
              return {
                unref: jest.fn(),
                on: jest.fn((event: string, callback: (code: number) => void) => {
                  if (event === 'exit' && config.wait) {
                    // Симулируем успешное закрытие
                    setTimeout(() => callback(0), 5);
                  }
                })
              };
            });
            
            // Мокируем checkEditorAvailability
            jest.spyOn(editorManager as any, 'checkEditorAvailability').mockResolvedValue(true);
            
            try {
              await editorManager.launchEditor(filePath, config);
              
              // Проверяем, что spawn был вызван
              expect(spawnCalled).toBe(true);
              expect(spawnCommand).toBe(config.command);
              
              // Проверяем, что аргументы включают путь к файлу
              expect(spawnArgs).toContain(filePath);
              
              // Проверяем, что дополнительные аргументы присутствуют
              for (const arg of config.args) {
                expect(spawnArgs).toContain(arg);
              }
            } finally {
              jest.restoreAllMocks();
            }
          }
        ),
        { numRuns: 50 }
      );
    });
    
    it('должен выбрасывать ошибку для недоступных редакторов', async () => {
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 10, maxLength: 30 })
            .filter(s => /^[a-z-]+$/.test(s))
            .filter(s => {
              // Исключаем все известные редакторы для любой платформы
              const knownEditors = ['code', 'nano', 'vim', 'vi', 'notepad', 'emacs', 
                                   'kiro', 'cursor', 'subl', 'gedit', 'kate'];
              return !knownEditors.includes(s);
            }),
          fc.string({ minLength: 5, maxLength: 50 })
            .filter(s => /^[a-zA-Z0-9/_.-]+$/.test(s)),
          async (editorCommand, filePath) => {
            const config: EditorConfig = {
              command: editorCommand
            };
            
            // Проверяем, что выбрасывается ошибка для недоступного редактора
            await expect(
              editorManager.launchEditor(filePath, config)
            ).rejects.toThrow();
          }
        ),
        { numRuns: 20 }
      );
    });
    
    it('должен использовать системный редактор если конфигурация не предоставлена', async () => {
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 50 })
            .filter(s => /^[a-zA-Z0-9/_.-]+$/.test(s)),
          async (filePath) => {
            let detectCalled = false;
            let spawnCalled = false;
            
            // Определяем редактор для текущей платформы
            const platformEditor = process.platform === 'win32' ? 'notepad' : 'vi';
            
            // Мокируем detectSystemEditor
            jest.spyOn(editorManager as any, 'detectSystemEditor').mockImplementation(async () => {
              detectCalled = true;
              return platformEditor;
            });
            
            // Мокируем checkEditorAvailability
            jest.spyOn(editorManager as any, 'checkEditorAvailability').mockResolvedValue(true);
            
            // Мокируем spawn
            jest.spyOn(require('child_process'), 'spawn').mockImplementation(() => {
              spawnCalled = true;
              return {
                unref: jest.fn(),
                on: jest.fn()
              };
            });
            
            try {
              await editorManager.launchEditor(filePath);
              
              // Проверяем, что detectSystemEditor был вызван
              expect(detectCalled).toBe(true);
              expect(spawnCalled).toBe(true);
            } finally {
              jest.restoreAllMocks();
            }
          }
        ),
        { numRuns: 30 }
      );
    });
    
    it('должен корректно обрабатывать wait режим', async () => {
      fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.integer({ min: 0, max: 2 }),
          fc.string({ minLength: 5, maxLength: 50 })
            .filter(s => /^[a-zA-Z0-9/_.-]+$/.test(s)),
          async (waitMode, exitCode, filePath) => {
            let exitCallback: ((code: number) => void) | null = null;
            
            // Мокируем spawn
            jest.spyOn(require('child_process'), 'spawn').mockImplementation(() => {
              return {
                on: jest.fn((event: string, callback: (code: number) => void) => {
                  if (event === 'exit') {
                    exitCallback = callback;
                  }
                }),
                unref: jest.fn()
              };
            });
            
            // Мокируем checkEditorAvailability
            jest.spyOn(editorManager as any, 'checkEditorAvailability').mockResolvedValue(true);
            
            try {
              const config: EditorConfig = {
                command: 'code',
                wait: waitMode
              };
              
              const launchPromise = editorManager.launchEditor(filePath, config);
              
              // Если wait режим, симулируем закрытие редактора
              if (waitMode && exitCallback) {
                setTimeout(() => {
                  if (exitCallback) {
                    exitCallback(exitCode);
                  }
                }, 10);
              }
              
              if (waitMode && exitCode !== 0) {
                // Ожидаем ошибку для ненулевого кода выхода
                await expect(launchPromise).rejects.toThrow();
              } else {
                // Ожидаем успешное выполнение
                await launchPromise;
                expect(true).toBe(true);
              }
            } finally {
              jest.restoreAllMocks();
            }
          }
        ),
        { numRuns: 50 }
      );
    });
    
    it('должен возвращать список популярных редакторов для платформы', () => {
      fc.assert(
        fc.property(
          fc.constant(null), // Просто запускаем тест несколько раз
          () => {
            const editors = (editorManager as any).getCommonEditors();
            
            // Проверяем, что список не пустой
            expect(Array.isArray(editors)).toBe(true);
            expect(editors.length).toBeGreaterThan(0);
            
            // Проверяем, что все элементы - строки
            for (const editor of editors) {
              expect(typeof editor).toBe('string');
              expect(editor.length).toBeGreaterThan(0);
            }
            
            // Проверяем, что список содержит ожидаемые редакторы для платформы
            const platform = process.platform;
            if (platform === 'win32') {
              expect(editors).toContain('notepad');
              expect(editors).toContain('code');
            } else if (platform === 'darwin') {
              expect(editors).toContain('vi');
              expect(editors).toContain('nano');
            } else {
              expect(editors).toContain('vi');
              expect(editors).toContain('nano');
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });
  
  /**
   * Дополнительные property tests для граничных случаев
   */
  describe('Edge Cases', () => {
    it('должен корректно обрабатывать пустые аргументы', async () => {
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 6, maxLength: 50 }) // Увеличиваем минимальную длину
            .filter(s => /^[a-zA-Z0-9/_.-]+$/.test(s))
            .filter(s => /[a-zA-Z0-9]/.test(s)) // Должен содержать хотя бы одну букву или цифру
            .filter(s => /^[a-zA-Z0-9]/.test(s)), // Должен начинаться с буквы или цифры
          async (filePath) => {
            let spawnArgs: string[] = [];
            
            // Мокируем spawn
            jest.spyOn(require('child_process'), 'spawn').mockImplementation((...args: unknown[]) => {
              spawnArgs = args[1] as string[];
              return {
                unref: jest.fn(),
                on: jest.fn()
              };
            });
            
            // Мокируем checkEditorAvailability
            jest.spyOn(editorManager as any, 'checkEditorAvailability').mockResolvedValue(true);
            
            try {
              const config: EditorConfig = {
                command: 'code',
                args: [] // Пустой массив аргументов
              };
              
              await editorManager.launchEditor(filePath, config);
              
              // Проверяем, что путь к файлу все равно передан
              expect(spawnArgs).toContain(filePath);
            } finally {
              jest.restoreAllMocks();
            }
          }
        ),
        { numRuns: 20 }
      );
    });
    
    it('должен корректно обрабатывать специальные символы в пути к файлу', async () => {
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 50 })
            .filter(s => /^[a-zA-Z0-9/_.-]+$/.test(s)) // Только буквы, цифры, /, _, ., -
            .filter(s => /^[a-zA-Z0-9]/.test(s)), // Должен начинаться с буквы или цифры
          async (filePath) => {
            let spawnArgs: string[] = [];
            
            // Мокируем spawn
            jest.spyOn(require('child_process'), 'spawn').mockImplementation((...args: unknown[]) => {
              spawnArgs = args[1] as string[];
              return {
                unref: jest.fn(),
                on: jest.fn()
              };
            });
            
            // Мокируем checkEditorAvailability
            jest.spyOn(editorManager as any, 'checkEditorAvailability').mockResolvedValue(true);
            
            try {
              const config: EditorConfig = {
                command: 'code'
              };
              
              await editorManager.launchEditor(filePath, config);
              
              // Проверяем, что путь передан корректно
              expect(spawnArgs).toContain(filePath);
            } finally {
              jest.restoreAllMocks();
            }
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
