/**
 * EditorManager - менеджер для работы с текстовыми редакторами
 * 
 * Поддерживает:
 * - Определение системного редактора по умолчанию
 * - Проверку доступности редактора
 * - Запуск редактора с файлом
 * - Поддержку различных платформ (Windows, macOS, Linux)
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import { Logger } from './logger.js';
import { EditorConfig } from './file-input-types.js';

const execAsync = promisify(exec);

/**
 * Менеджер текстовых редакторов
 */
export class EditorManager {
  private logger: Logger;
  
  constructor(logger: Logger) {
    this.logger = logger;
  }
  
  /**
   * Запуск редактора с файлом
   * 
   * @param filePath - Путь к файлу
   * @param config - Конфигурация редактора (опционально)
   * @returns Promise<void>
   * @throws Error - При ошибке запуска редактора
   */
  async launchEditor(
    filePath: string,
    config?: EditorConfig
  ): Promise<void> {
    try {
      // Определяем команду редактора
      const editorCommand = config?.command || await this.detectSystemEditor();
      
      // Проверяем доступность редактора
      const isAvailable = await this.checkEditorAvailability(editorCommand);
      if (!isAvailable) {
        throw new Error(`Редактор "${editorCommand}" недоступен`);
      }
      
      // Формируем аргументы
      const args = config?.args || [];
      const fullArgs = [...args, filePath];
      
      this.logger.info(`Запуск редактора: ${editorCommand} ${fullArgs.join(' ')}`);
      
      // Запускаем редактор
      // В Windows используем shell: true для поддержки .cmd и .bat файлов
      const editorProcess = spawn(editorCommand, fullArgs, {
        detached: true,
        stdio: 'ignore',
        shell: process.platform === 'win32'
      });
      
      // Если нужно ждать закрытия редактора
      if (config?.wait) {
        await new Promise<void>((resolve, reject) => {
          editorProcess.on('exit', (code) => {
            if (code === 0) {
              this.logger.info('Редактор закрыт успешно');
              resolve();
            } else {
              this.logger.error(`Редактор завершился с кодом ${code}`);
              reject(new Error(`Редактор завершился с кодом ${code}`));
            }
          });
          
          editorProcess.on('error', (error) => {
            this.logger.error('Ошибка запуска редактора', error);
            reject(error);
          });
        });
      } else {
        // Для фонового режима нужно дождаться, что процесс запустился без ошибок
        await new Promise<void>((resolve, reject) => {
          let errorOccurred = false;
          
          editorProcess.on('error', (error) => {
            errorOccurred = true;
            this.logger.error('Ошибка запуска редактора', error);
            reject(error);
          });
          
          // Даем небольшую задержку для проверки, что процесс запустился
          setTimeout(() => {
            if (!errorOccurred) {
              // Отсоединяем процесс, чтобы он продолжал работать независимо
              editorProcess.unref();
              this.logger.info('Редактор запущен в фоновом режиме');
              resolve();
            }
          }, 100);
        });
      }
    } catch (error) {
      this.logger.error('Не удалось запустить редактор', error as Error);
      throw error;
    }
  }
  
  /**
   * Определение системного редактора по умолчанию
   * 
   * @returns Promise<string> - Команда для запуска редактора
   */
  async detectSystemEditor(): Promise<string> {
    const platform = process.platform;
    
    this.logger.debug(`Определение редактора для платформы: ${platform}`);
    
    // Проверяем переменные окружения
    const envEditor = process.env.EDITOR || process.env.VISUAL;
    if (envEditor) {
      this.logger.debug(`Найден редактор в переменных окружения: ${envEditor}`);
      const isAvailable = await this.checkEditorAvailability(envEditor);
      if (isAvailable) {
        return envEditor;
      }
    }
    
    // Получаем список популярных редакторов для платформы
    const commonEditors = this.getCommonEditors();
    
    // Проверяем доступность каждого редактора
    for (const editor of commonEditors) {
      const isAvailable = await this.checkEditorAvailability(editor);
      if (isAvailable) {
        this.logger.debug(`Найден доступный редактор: ${editor}`);
        return editor;
      }
    }
    
    // Если ничего не найдено, возвращаем базовый редактор для платформы
    const fallback = platform === 'win32' ? 'notepad' : 'vi';
    this.logger.warn(`Не найден предпочитаемый редактор, используется ${fallback}`);
    return fallback;
  }
  
  /**
   * Проверка доступности редактора
   * 
   * @param editorCommand - Команда редактора
   * @returns Promise<boolean> - Доступен ли редактор
   */
  async checkEditorAvailability(editorCommand: string): Promise<boolean> {
    try {
      const platform = process.platform;
      
      if (platform === 'win32') {
        // В Windows используем where.exe (не алиас where в PowerShell)
        // where.exe автоматически ищет файлы с расширениями из PATHEXT
        const { stdout } = await execAsync(`where.exe ${editorCommand} 2>nul`);
        // where.exe возвращает пути к найденным файлам, если нашел
        return stdout.trim().length > 0;
      } else {
        // Для Unix-подобных систем используем which
        await execAsync(`which ${editorCommand}`);
        return true;
      }
    } catch {
      // Команда не найдена
      return false;
    }
  }
  
  /**
   * Получение списка популярных редакторов для платформы
   * 
   * @returns string[] - Список команд редакторов
   */
  private getCommonEditors(): string[] {
    const platform = process.platform;
    
    switch (platform) {
      case 'win32':
        return [
          'code',        // Visual Studio Code
          'kiro',        // Kiro         
          'cursor',      // Cursor
          'notepad++',   // Notepad++
          'sublime_text', // Sublime Text
          'notepad'      // Notepad (встроенный)
        ];
        
      case 'darwin':
        return [
          'code',        // Visual Studio Code
          'kiro',        // Kiro    
          'cursor',      // Cursor
          'subl',        // Sublime Text
          'nano',        // Nano
          'vim',         // Vim
          'vi'           // Vi
        ];
        
      case 'linux':
      default:
        return [
          'code',        // Visual Studio Code
          'kiro',        // Kiro          
          'cursor',      // Cursor
          'subl',        // Sublime Text
          'gedit',       // Gedit
          'kate',        // Kate
          'nano',        // Nano
          'vim',         // Vim
          'vi'           // Vi
        ];
    }
  }
}
