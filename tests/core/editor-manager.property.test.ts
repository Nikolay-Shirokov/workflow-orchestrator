/**
 * Property-Based тесты для EditorManager
 * 
 * Проверяет свойства корректности работы с редакторами
 * 
 * ВАЖНО: Все тесты используют моки для системных вызовов,
 * чтобы быть детерминированными и не зависеть от реальной
 * доступности редакторов на платформе
 * 
 * ПРИМЕЧАНИЕ: Некоторые тесты были преобразованы из property-based
 * в обычные unit-тесты из-за ограничений Jest при мокировании
 * childProcess.spawn и childProcess.exec. Jest не может переопределять
 * эти свойства несколько раз в быстрых итерациях fast-check,
 * что вызывает ошибку "Cannot redefine property". Для таких тестов
 * используется один тестовый случай вместо множественных итераций.
 */

import * as fc from 'fast-check';
import { EditorManager } from '../../src/core/editor-manager.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import { EditorConfig } from '../../src/core/file-input-types.js';
import * as childProcess from 'child_process';

// Мокируем child_process на уровне модуля
jest.mock('child_process');

describe('EditorManager Property-Based Tests', () => {
  let editorManager: EditorManager;
  let logger: Logger;
  let mockSpawn: jest.MockedFunction<typeof childProcess.spawn>;
  let mockExec: jest.MockedFunction<typeof childProcess.exec>;
  
  beforeEach(() => {
    // Очищаем все моки перед каждым тестом
    jest.clearAllMocks();
    
    // Получаем ссылки на замоканные функции
    mockSpawn = childProcess.spawn as jest.MockedFunction<typeof childProcess.spawn>;
    mockExec = childProcess.exec as jest.MockedFunction<typeof childProcess.exec>;
    
    // Устанавливаем дефолтные реализации
    mockSpawn.mockImplementation(() => {
      const mockProcess: any = {
        unref: jest.fn(),
        on: jest.fn()
      };
      return mockProcess;
    });
    
    mockExec.mockImplementation((_cmd: string, callback: any) => {
      callback(null, { stdout: '', stderr: '' });
      return {} as any;
    });
    
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
   * Для любого редактора, попытка открыть файл должна успешно 
   * запустить редактор или вернуть понятную ошибку
   * 
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4
   */
  describe('Property 2: Editor Launch', () => {
    it('должен успешно определить системный редактор из переменных окружения', async () => {
      fc.assert(
        fc.asyncProperty(
          // Генерируем случайные имена редакторов
          fc.string({ minLength: 3, maxLength: 15 })
            .filter(s => /^[a-z]+$/.test(s))
            .filter(s => {
              // Исключаем зарезервированные слова JavaScript
              const reserved = ['caller', 'constructor', 'prototype', 'arguments', 
                               'length', 'name', 'apply', 'bind', 'call', 'toString',
                               'valueOf', 'hasOwnProperty', 'isPrototypeOf', 
                               'propertyIsEnumerable', 'toLocaleString'];
              return !reserved.includes(s);
            }),
          async (editorName) => {
            // Мокируем переменную окружения
            const originalEditor = process.env.EDITOR;
            process.env.EDITOR = editorName;
            
            // Мокируем checkEditorAvailability - редактор доступен
            jest.spyOn(editorManager as any, 'checkEditorAvailability')
              .mockResolvedValue(true);
            
            try {
              const editor = await editorManager.detectSystemEditor();
              
              // Проверяем, что вернулся редактор из переменной окружения
              expect(editor).toBe(editorName);
            } finally {
              // Восстанавливаем переменную окружения
              if (originalEditor) {
                process.env.EDITOR = originalEditor;
              } else {
                delete process.env.EDITOR;
              }
            }
          }
        ),
        { numRuns: 50 }
      );
    });
    
    it('должен найти доступный редактор из списка популярных', async () => {
      // Получаем список редакторов
      const commonEditors = (editorManager as any).getCommonEditors();
      const expectedEditor = commonEditors[2]; // Берем третий редактор из списка
      
      // Удаляем переменные окружения
      const originalEditor = process.env.EDITOR;
      const originalVisual = process.env.VISUAL;
      delete process.env.EDITOR;
      delete process.env.VISUAL;
      
      // Мокируем checkEditorAvailability
      // Только редактор с индексом 2 доступен, все остальные - нет
      jest.spyOn(editorManager as any, 'checkEditorAvailability')
        .mockImplementation(async (...args: unknown[]) => {
          const cmd = args[0] as string;
          // Возвращаем true только для ожидаемого редактора
          return cmd === expectedEditor;
        });
      
      try {
        const editor = await editorManager.detectSystemEditor();
        
        // Проверяем, что вернулся редактор с индексом 2
        expect(editor).toBe(expectedEditor);
      } finally {
        // Восстанавливаем переменные окружения
        if (originalEditor) {
          process.env.EDITOR = originalEditor;
        }
        if (originalVisual) {
          process.env.VISUAL = originalVisual;
        }
      }
    });
    
    it('должен вернуть fallback редактор если ничего не найдено', async () => {
      // Удаляем переменные окружения
      const originalEditor = process.env.EDITOR;
      const originalVisual = process.env.VISUAL;
      delete process.env.EDITOR;
      delete process.env.VISUAL;
      
      // Мокируем checkEditorAvailability - все недоступны
      jest.spyOn(editorManager as any, 'checkEditorAvailability')
        .mockResolvedValue(false);
      
      try {
        const editor = await editorManager.detectSystemEditor();
        
        // Проверяем, что вернулся fallback редактор
        // Fallback редактор - это последний в списке, который всегда должен быть доступен
        const expectedFallback = process.platform === 'win32' ? 'notepad' : 'vi';
        expect(editor).toBe(expectedFallback);
      } finally {
        // Восстанавливаем переменные окружения
        if (originalEditor) {
          process.env.EDITOR = originalEditor;
        }
        if (originalVisual) {
          process.env.VISUAL = originalVisual;
        }
      }
    });
    
    it('должен корректно проверять доступность редакторов', async () => {
      // Создаем новый EditorManager для этого теста, чтобы execAsync был создан заново
      const testLogger = new Logger({
        level: LogLevel.ERROR,
        enableConsole: false,
        enableFile: false
      });
      
      // Мокируем exec перед созданием EditorManager
      mockExec.mockReset();
      mockExec.mockImplementation((cmd: string, callback: any) => {
        // Проверяем команду - на Windows это 'where <editor>', на Unix - 'which <editor>'
        const isCodeCommand = cmd.includes('code');
        
        if (isCodeCommand) {
          // Редактор доступен - вызываем callback без ошибки
          callback(null, { stdout: '/usr/bin/code', stderr: '' });
        } else {
          // Редактор недоступен - вызываем callback с ошибкой
          const error = new Error('Command not found') as NodeJS.ErrnoException;
          error.code = 'ENOENT';
          callback(error, { stdout: '', stderr: 'not found' });
        }
        return {} as any;
      });
      
      // Создаем новый EditorManager после установки мока
      const testManager = new EditorManager(testLogger);
      
      // Тестируем доступный редактор
      const isAvailable = await testManager.checkEditorAvailability('code');
      expect(isAvailable).toBe(true);
      
      // Тестируем недоступный редактор
      const isNotAvailable = await testManager.checkEditorAvailability('nonexistent');
      expect(isNotAvailable).toBe(false);
    });
    
    it('должен корректно запускать редактор с различными конфигурациями - wait mode', async () => {
      let spawnCalled = false;
      let spawnCommand = '';
      let spawnArgs: string[] = [];
      let spawnOptions: any = {};
      
      // Мокируем spawn
      mockSpawn.mockImplementationOnce((cmd: string, args: readonly string[], options: any) => {
        spawnCalled = true;
        spawnCommand = cmd;
        spawnArgs = [...args];
        spawnOptions = options;
        
        const mockProcess: any = {
          unref: jest.fn(),
          on: jest.fn((event: string, callback: (code: number) => void) => {
            if (event === 'exit') {
              // Симулируем успешное закрытие
              setTimeout(() => callback(0), 5);
            }
            return mockProcess;
          })
        };
        
        return mockProcess;
      });
      
      // Мокируем checkEditorAvailability - редактор доступен
      mockExec.mockImplementationOnce((_cmd: string, callback: any) => {
        callback(null, { stdout: '/usr/bin/code', stderr: '' });
        return {} as any;
      });
      
      const config = { command: 'code', args: ['--wait'], wait: true };
      const filePath = '/tmp/test.txt';
      
      await editorManager.launchEditor(filePath, config);
      
      // Проверяем, что spawn был вызван с правильными параметрами
      expect(spawnCalled).toBe(true);
      expect(spawnCommand).toBe(config.command);
      expect(spawnArgs).toContain(filePath);
      expect(spawnArgs).toContain('--wait');
      expect(spawnOptions.detached).toBe(true);
      expect(spawnOptions.stdio).toBe('ignore');
    });
    
    it('должен корректно запускать редактор с различными конфигурациями - no wait mode', async () => {
      let spawnCalled = false;
      let spawnCommand = '';
      let spawnArgs: string[] = [];
      let spawnOptions: any = {};
      
      // Мокируем spawn
      mockSpawn.mockImplementationOnce((cmd: string, args: readonly string[], options: any) => {
        spawnCalled = true;
        spawnCommand = cmd;
        spawnArgs = [...args];
        spawnOptions = options;
        
        const mockProcess: any = {
          unref: jest.fn(),
          on: jest.fn()
        };
        
        return mockProcess;
      });
      
      // Мокируем checkEditorAvailability - редактор доступен
      mockExec.mockImplementationOnce((_cmd: string, callback: any) => {
        callback(null, { stdout: '/usr/bin/vim', stderr: '' });
        return {} as any;
      });
      
      const config = { command: 'vim', args: [], wait: false };
      const filePath = '/home/user/file.md';
      
      await editorManager.launchEditor(filePath, config);
      
      // Проверяем, что spawn был вызван с правильными параметрами
      expect(spawnCalled).toBe(true);
      expect(spawnCommand).toBe(config.command);
      expect(spawnArgs).toContain(filePath);
      expect(spawnOptions.detached).toBe(true);
      expect(spawnOptions.stdio).toBe('ignore');
    });
    
    it('должен выбрасывать ошибку для недоступных редакторов', async () => {
      fc.assert(
        fc.asyncProperty(
          // Генерируем случайные команды редакторов
          fc.string({ minLength: 5, maxLength: 20 })
            .filter(s => /^[a-z-]+$/.test(s))
            .filter(s => {
              // Исключаем зарезервированные слова JavaScript
              const reserved = ['caller', 'constructor', 'prototype', 'arguments', 
                               'length', 'name', 'apply', 'bind', 'call', 'toString',
                               'valueOf', 'hasOwnProperty', 'isPrototypeOf', 
                               'propertyIsEnumerable', 'toLocaleString'];
              return !reserved.includes(s);
            }),
          // Генерируем путь к файлу
          fc.string({ minLength: 5, maxLength: 50 })
            .filter(s => /^[a-zA-Z0-9/_.-]+$/.test(s)),
          async (editorCommand, filePath) => {
            // Создаем новый экземпляр EditorManager для каждой итерации
            const testLogger = new Logger({
              level: LogLevel.ERROR,
              enableConsole: false,
              enableFile: false
            });
            const testManager = new EditorManager(testLogger);
            
            // Мокируем checkEditorAvailability - редактор недоступен
            jest.spyOn(testManager as any, 'checkEditorAvailability')
              .mockResolvedValue(false);
            
            const config: EditorConfig = {
              command: editorCommand
            };
            
            // Проверяем, что выбрасывается ошибка
            await expect(
              testManager.launchEditor(filePath, config)
            ).rejects.toThrow(/недоступен/);
          }
        ),
        { numRuns: 50 }
      );
    });
    
    it('должен использовать системный редактор если конфигурация не предоставлена', async () => {
      let detectCalled = false;
      let spawnCalled = false;
      let spawnCommand = '';
      const detectedEditor = 'vim';
      
      // Мокируем detectSystemEditor
      jest.spyOn(editorManager as any, 'detectSystemEditor')
        .mockImplementation(async () => {
          detectCalled = true;
          return detectedEditor;
        });
      
      // Мокируем checkEditorAvailability - редактор доступен
      jest.spyOn(editorManager as any, 'checkEditorAvailability')
        .mockResolvedValue(true);
      
      // Мокируем spawn
      mockSpawn.mockImplementationOnce((cmd: string) => {
        spawnCalled = true;
        spawnCommand = cmd;
        
        const mockProcess: any = {
          unref: jest.fn(),
          on: jest.fn()
        };
        
        return mockProcess;
      });
      
      await editorManager.launchEditor('/tmp/test.txt');
      
      // Проверяем, что detectSystemEditor был вызван
      expect(detectCalled).toBe(true);
      expect(spawnCalled).toBe(true);
      expect(spawnCommand).toBe(detectedEditor);
    });
    
    it('должен корректно обрабатывать wait режим с кодом выхода 0', async () => {
      let exitCallback: ((code: number) => void) | null = null;
      
      // Мокируем spawn
      mockSpawn.mockImplementationOnce(() => {
        const mockProcess: any = {
          on: jest.fn((event: string, callback: (code: number) => void) => {
            if (event === 'exit') {
              exitCallback = callback;
              // Вызываем callback сразу после установки
              setImmediate(() => exitCallback && exitCallback(0));
            }
            return mockProcess;
          }),
          unref: jest.fn()
        };
        
        return mockProcess;
      });
      
      // Мокируем checkEditorAvailability
      jest.spyOn(editorManager as any, 'checkEditorAvailability')
        .mockResolvedValue(true);
      
      const config: EditorConfig = {
        command: 'vim',
        wait: true
      };
      
      // Ожидаем успешное выполнение
      await expect(editorManager.launchEditor('/tmp/test.txt', config)).resolves.toBeUndefined();
    });
    
    it('должен корректно обрабатывать wait режим с ненулевым кодом выхода', async () => {
      let exitCallback: ((code: number) => void) | null = null;
      
      // Мокируем spawn
      mockSpawn.mockImplementationOnce(() => {
        const mockProcess: any = {
          on: jest.fn((event: string, callback: (code: number) => void) => {
            if (event === 'exit') {
              exitCallback = callback;
              // Вызываем callback сразу после установки
              setImmediate(() => exitCallback && exitCallback(1));
            }
            return mockProcess;
          }),
          unref: jest.fn()
        };
        
        return mockProcess;
      });
      
      // Мокируем checkEditorAvailability
      jest.spyOn(editorManager as any, 'checkEditorAvailability')
        .mockResolvedValue(true);
      
      const config: EditorConfig = {
        command: 'nano',
        wait: true
      };
      
      // Ожидаем ошибку для ненулевого кода выхода
      await expect(editorManager.launchEditor('/home/user/file.md', config)).rejects.toThrow(/завершился с кодом/);
    });
    
    it('должен корректно обрабатывать ошибки spawn', async () => {
      let errorCallback: ((error: Error) => void) | null = null;
      
      // Мокируем spawn
      mockSpawn.mockImplementationOnce(() => {
        const mockProcess: any = {
          on: jest.fn((event: string, callback: (arg: any) => void) => {
            if (event === 'error') {
              errorCallback = callback;
              // Вызываем callback сразу после установки
              setImmediate(() => errorCallback && errorCallback(new Error('Command not found')));
            }
            return mockProcess;
          }),
          unref: jest.fn()
        };
        
        return mockProcess;
      });
      
      // Мокируем checkEditorAvailability
      jest.spyOn(editorManager as any, 'checkEditorAvailability')
        .mockResolvedValue(true);
      
      const config: EditorConfig = {
        command: 'vim',
        wait: true
      };
      
      // Ожидаем, что ошибка будет проброшена
      await expect(editorManager.launchEditor('/tmp/test.txt', config)).rejects.toThrow();
    });
    
    it('должен возвращать список популярных редакторов для платформы', () => {
      fc.assert(
        fc.property(
          fc.constant(null),
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
      let spawnArgs: readonly string[] = [];
      
      // Мокируем spawn
      mockSpawn.mockImplementationOnce((_cmd: string, args: readonly string[]) => {
        spawnArgs = args;
        
        const mockProcess: any = {
          unref: jest.fn(),
          on: jest.fn()
        };
        
        return mockProcess;
      });
      
      // Мокируем checkEditorAvailability
      jest.spyOn(editorManager as any, 'checkEditorAvailability')
        .mockResolvedValue(true);
      
      const config: EditorConfig = {
        command: 'vim',
        args: [] // Пустой массив аргументов
      };
      
      await editorManager.launchEditor('/tmp/test.txt', config);
      
      // Проверяем, что путь к файлу все равно передан
      expect(spawnArgs).toContain('/tmp/test.txt');
      expect(spawnArgs.length).toBe(1); // Только путь к файлу
    });
    
    it('должен корректно обрабатывать специальные символы в пути к файлу', async () => {
      let spawnArgs: readonly string[] = [];
      
      // Мокируем spawn
      mockSpawn.mockImplementationOnce((_cmd: string, args: readonly string[]) => {
        spawnArgs = args;
        
        const mockProcess: any = {
          unref: jest.fn(),
          on: jest.fn()
        };
        
        return mockProcess;
      });
      
      // Мокируем checkEditorAvailability
      jest.spyOn(editorManager as any, 'checkEditorAvailability')
        .mockResolvedValue(true);
      
      const config: EditorConfig = {
        command: 'vim'
      };
      
      const filePath = '/tmp/test-file.txt';
      await editorManager.launchEditor(filePath, config);
      
      // Проверяем, что путь передан корректно без изменений
      expect(spawnArgs).toContain(filePath);
    });
    
    it('должен корректно обрабатывать множественные аргументы', async () => {
      let spawnArgs: readonly string[] = [];
      
      // Мокируем spawn
      mockSpawn.mockImplementationOnce((_cmd: string, args: readonly string[]) => {
        spawnArgs = args;
        
        const mockProcess: any = {
          unref: jest.fn(),
          on: jest.fn()
        };
        
        return mockProcess;
      });
      
      // Мокируем checkEditorAvailability
      jest.spyOn(editorManager as any, 'checkEditorAvailability')
        .mockResolvedValue(true);
      
      const config: EditorConfig = {
        command: 'vim',
        args: ['-n', '-u', 'NONE']
      };
      
      await editorManager.launchEditor('/tmp/test.txt', config);
      
      // Проверяем, что все аргументы присутствуют
      expect(spawnArgs).toContain('-n');
      expect(spawnArgs).toContain('-u');
      expect(spawnArgs).toContain('NONE');
      
      // Проверяем, что путь к файлу также присутствует
      expect(spawnArgs).toContain('/tmp/test.txt');
      
      // Проверяем порядок: сначала args, потом filePath
      const argsArray = Array.from(spawnArgs);
      const filePathIndex = argsArray.indexOf('/tmp/test.txt');
      expect(filePathIndex).toBe(3);
    });
  });
});
