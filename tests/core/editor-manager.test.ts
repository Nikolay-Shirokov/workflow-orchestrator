/**
 * Unit тесты для EditorManager
 * 
 * Проверяет функциональность менеджера текстовых редакторов
 */

import { EditorManager } from '../../src/core/editor-manager.js';
import { Logger, LogLevel } from '../../src/core/logger.js';
import { EditorConfig } from '../../src/core/file-input-types.js';

describe('EditorManager Unit Tests', () => {
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
  
  describe('detectSystemEditor', () => {
    it('должен определить редактор из переменных окружения', async () => {
      // Сохраняем оригинальные значения
      const originalEditor = process.env.EDITOR;
      const originalVisual = process.env.VISUAL;
      
      try {
        // Устанавливаем тестовое значение
        process.env.EDITOR = 'nano';
        
        const editor = await editorManager.detectSystemEditor();
        
        // Проверяем, что вернулся какой-то редактор
        expect(editor).toBeDefined();
        expect(typeof editor).toBe('string');
        expect(editor.length).toBeGreaterThan(0);
      } finally {
        // Восстанавливаем оригинальные значения
        if (originalEditor !== undefined) {
          process.env.EDITOR = originalEditor;
        } else {
          delete process.env.EDITOR;
        }
        if (originalVisual !== undefined) {
          process.env.VISUAL = originalVisual;
        } else {
          delete process.env.VISUAL;
        }
      }
    });
    
    it('должен вернуть fallback редактор если ничего не найдено', async () => {
      // Сохраняем оригинальные значения
      const originalEditor = process.env.EDITOR;
      const originalVisual = process.env.VISUAL;
      
      try {
        // Удаляем переменные окружения
        delete process.env.EDITOR;
        delete process.env.VISUAL;
        
        const editor = await editorManager.detectSystemEditor();
        
        // Проверяем, что вернулся fallback редактор
        expect(editor).toBeDefined();
        const platform = process.platform;
        if (platform === 'win32') {
          expect(['notepad', 'code', 'notepad++', 'sublime_text', 'atom']).toContain(editor);
        } else {
          expect(['vi', 'vim', 'nano', 'code', 'subl', 'atom', 'emacs', 'gedit', 'kate']).toContain(editor);
        }
      } finally {
        // Восстанавливаем оригинальные значения
        if (originalEditor !== undefined) {
          process.env.EDITOR = originalEditor;
        }
        if (originalVisual !== undefined) {
          process.env.VISUAL = originalVisual;
        }
      }
    });
  });
  
  describe('checkEditorAvailability', () => {
    it('должен вернуть true для доступного редактора', async () => {
      // Используем команду, которая точно доступна на всех платформах
      const platform = process.platform;
      const availableCommand = platform === 'win32' ? 'cmd' : 'sh';
      
      const isAvailable = await editorManager.checkEditorAvailability(availableCommand);
      
      expect(isAvailable).toBe(true);
    });
    
    it('должен вернуть false для недоступного редактора', async () => {
      const isAvailable = await editorManager.checkEditorAvailability('nonexistent-editor-xyz123');
      
      expect(isAvailable).toBe(false);
    });
  });
  
  describe('launchEditor', () => {
    it('должен выбросить ошибку для недоступного редактора', async () => {
      const config: EditorConfig = {
        command: 'nonexistent-editor-xyz123'
      };
      
      await expect(
        editorManager.launchEditor('/tmp/test.txt', config)
      ).rejects.toThrow();
    });
    
    it('должен использовать конфигурацию редактора если предоставлена', async () => {
      // Создаем мок для spawn
      let spawnCalled = false;
      let spawnCommand = '';
      let spawnArgs: string[] = [];
      
      // Мокируем spawn
      jest.spyOn(require('child_process'), 'spawn').mockImplementation((...args: unknown[]) => {
        spawnCalled = true;
        spawnCommand = args[0] as string;
        spawnArgs = args[1] as string[];
        
        // Возвращаем мок процесса
        return {
          unref: jest.fn(),
          on: jest.fn()
        };
      });
      
      try {
        const config: EditorConfig = {
          command: 'code',
          args: ['--wait'],
          wait: false
        };
        
        // Мокируем checkEditorAvailability чтобы вернуть true
        jest.spyOn(editorManager as any, 'checkEditorAvailability').mockResolvedValue(true);
        
        await editorManager.launchEditor('/tmp/test.txt', config);
        
        expect(spawnCalled).toBe(true);
        expect(spawnCommand).toBe('code');
        expect(spawnArgs).toContain('--wait');
        expect(spawnArgs).toContain('/tmp/test.txt');
      } finally {
        // Восстанавливаем оригинальный spawn
        jest.restoreAllMocks();
      }
    });
    
    it('должен использовать системный редактор если конфигурация не предоставлена', async () => {
      // Создаем мок для spawn
      let spawnCalled = false;
      
      // Мокируем spawn
      jest.spyOn(require('child_process'), 'spawn').mockImplementation(() => {
        spawnCalled = true;
        
        // Возвращаем мок процесса
        return {
          unref: jest.fn(),
          on: jest.fn()
        };
      });
      
      try {
        // Мокируем detectSystemEditor
        jest.spyOn(editorManager as any, 'detectSystemEditor').mockResolvedValue('nano');
        
        // Мокируем checkEditorAvailability
        jest.spyOn(editorManager as any, 'checkEditorAvailability').mockResolvedValue(true);
        
        await editorManager.launchEditor('/tmp/test.txt');
        
        expect(spawnCalled).toBe(true);
      } finally {
        // Восстанавливаем оригинальные методы
        jest.restoreAllMocks();
      }
    });
  });
  
  describe('getCommonEditors', () => {
    it('должен вернуть список редакторов для текущей платформы', () => {
      const editors = (editorManager as any).getCommonEditors();
      
      expect(Array.isArray(editors)).toBe(true);
      expect(editors.length).toBeGreaterThan(0);
      
      // Проверяем, что все элементы - строки
      for (const editor of editors) {
        expect(typeof editor).toBe('string');
        expect(editor.length).toBeGreaterThan(0);
      }
      
      // Проверяем, что список содержит популярные редакторы
      const platform = process.platform;
      if (platform === 'win32') {
        expect(editors).toContain('notepad');
      } else {
        expect(editors).toContain('vi');
      }
    });
  });
  
  describe('Обработка ошибок', () => {
    it('должен логировать ошибку при неудачном запуске редактора', async () => {
      const errorSpy = jest.spyOn(logger, 'error');
      
      const config: EditorConfig = {
        command: 'nonexistent-editor-xyz123'
      };
      
      try {
        await editorManager.launchEditor('/tmp/test.txt', config);
      } catch {
        // Ожидаем ошибку
      }
      
      expect(errorSpy).toHaveBeenCalled();
    });
    
    it('должен корректно обрабатывать ошибку spawn', async () => {
      // Мокируем spawn чтобы выбросить ошибку
      jest.spyOn(require('child_process'), 'spawn').mockImplementation(() => {
        throw new Error('Spawn error');
      });
      
      try {
        // Мокируем checkEditorAvailability
        jest.spyOn(editorManager as any, 'checkEditorAvailability').mockResolvedValue(true);
        
        const config: EditorConfig = {
          command: 'code'
        };
        
        await expect(
          editorManager.launchEditor('/tmp/test.txt', config)
        ).rejects.toThrow('Spawn error');
      } finally {
        jest.restoreAllMocks();
      }
    });
  });
  
  describe('Wait режим', () => {
    it('должен ждать закрытия редактора в wait режиме', async () => {
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
      
      try {
        // Мокируем checkEditorAvailability
        jest.spyOn(editorManager as any, 'checkEditorAvailability').mockResolvedValue(true);
        
        const config: EditorConfig = {
          command: 'code',
          wait: true
        };
        
        const launchPromise = editorManager.launchEditor('/tmp/test.txt', config);
        
        // Симулируем закрытие редактора
        setTimeout(() => {
          if (exitCallback) {
            exitCallback(0);
          }
        }, 10);
        
        await launchPromise;
        
        // Если мы дошли сюда, значит wait режим работает
        expect(true).toBe(true);
      } finally {
        jest.restoreAllMocks();
      }
    });
    
    it('должен выбросить ошибку если редактор завершился с ненулевым кодом', async () => {
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
      
      try {
        // Мокируем checkEditorAvailability
        jest.spyOn(editorManager as any, 'checkEditorAvailability').mockResolvedValue(true);
        
        const config: EditorConfig = {
          command: 'code',
          wait: true
        };
        
        const launchPromise = editorManager.launchEditor('/tmp/test.txt', config);
        
        // Симулируем закрытие редактора с ошибкой
        setTimeout(() => {
          if (exitCallback) {
            exitCallback(1);
          }
        }, 10);
        
        await expect(launchPromise).rejects.toThrow();
      } finally {
        jest.restoreAllMocks();
      }
    });
  });
});
