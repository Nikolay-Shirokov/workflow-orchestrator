/**
 * FileInputHandler - обработчик файлового ввода пользователя
 * 
 * Управляет процессом файлового ввода:
 * - Создание файлов-шаблонов для заполнения пользователем
 * - Открытие файлов в текстовом редакторе
 * - Приостановка процесса с интерактивным меню
 * - Чтение и валидация заполненных файлов
 * - Обработка ошибок и восстановление
 */

import * as fs from 'fs/promises';
import * as readline from 'readline';
import { WorkflowStep, ExecutionContext, Logger, WorkflowErrorClass } from './types.js';
import { FileInputResult, UserCommand, EditorConfig, FileFormat } from './file-input-types.js';
import { TemplateGenerator } from './template-generator.js';
import { EditorManager } from './editor-manager.js';
import { UserInputHandler, ParsedUserInput, InputFormat } from './user-input-handler.js';

/**
 * Обработчик файлового ввода пользователя
 */
export class FileInputHandler {
  private templateGenerator: TemplateGenerator;
  private editorManager: EditorManager;
  private userInputHandler: UserInputHandler;
  private logger: Logger;
  private testMode: boolean;
  
  constructor(
    templateGenerator: TemplateGenerator,
    editorManager: EditorManager,
    userInputHandler: UserInputHandler,
    logger: Logger,
    testMode: boolean = false
  ) {
    this.templateGenerator = templateGenerator;
    this.editorManager = editorManager;
    this.userInputHandler = userInputHandler;
    this.logger = logger;
    this.testMode = testMode;
  }
  
  /**
   * Обработка файлового ввода для шага
   * 
   * Основной метод, координирующий весь процесс файлового ввода:
   * 1. Создание файла-шаблона
   * 2. Открытие в редакторе
   * 3. Ожидание подтверждения пользователя
   * 4. Чтение и валидация
   * 
   * @param step - Шаг user_input
   * @param context - Контекст выполнения
   * @returns Promise<FileInputResult> - Результат обработки
   */
  async handleFileInput(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<FileInputResult> {
    const startTime = Date.now();
    
    try {
      this.logger.info(`Начало обработки файлового ввода для шага: ${step.id}`);
      
      // 1. Создание файла-шаблона
      const filePath = await this.createTemplateFile(step, context);
      
      // 2. Открытие в редакторе
      const editorConfig = step.editor || context.state.workflowName ? undefined : undefined;
      await this.openInEditor(filePath, editorConfig);
      
      // 3. Ожидание подтверждения пользователя
      const userCommand = await this.waitForUserConfirmation(filePath);
      
      // Если пользователь выбрал отложить
      if (userCommand === 'postpone') {
        this.logger.info('Пользователь выбрал отложить выполнение');
        
        // Обновляем статус процесса
        context.state.status = 'paused';
        
        return {
          success: false,
          filePath,
          data: {},
          userCommand,
          processingTime: Date.now() - startTime
        };
      }
      
      // 4. Чтение и валидация
      const parsedInput = await this.readAndValidate(filePath, step, context);
      
      this.logger.info(`Файловый ввод успешно обработан для шага: ${step.id}`);
      
      return {
        success: true,
        filePath,
        data: parsedInput.data as Record<string, unknown>,
        userCommand,
        processingTime: Date.now() - startTime
      };
      
    } catch (error) {
      this.logger.error(`Ошибка обработки файлового ввода для шага ${step.id}`, error as Error);
      throw error;
    }
  }
  
  /**
   * Создание файла-шаблона
   * 
   * Генерирует файл-шаблон на основе формата и сохраняет его
   * в директории артефактов с понятным именем.
   * 
   * @param step - Шаг user_input
   * @param context - Контекст выполнения
   * @returns Promise<string> - Путь к созданному файлу
   * @throws WorkflowErrorClass - При ошибке создания файла
   */
  private async createTemplateFile(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<string> {
    try {
      // Определяем формат файла
      const format: FileFormat = step.file_format || 'markdown';
      
      this.logger.debug(`Создание шаблона в формате: ${format}`);
      
      // Генерируем содержимое шаблона
      const templateContent = this.templateGenerator.generate(format, step, context);
      
      // Определяем расширение файла
      const extension = this.getFileExtension(format);
      
      // Формируем имя файла
      const fileName = `${step.id}_input${extension}`;
      
      // Сохраняем файл через ArtifactManager
      const filePath = await context.artifactManager.save(
        context.state.sessionId,
        step.id,
        fileName,
        templateContent
      );
      
      this.logger.info(`Создан файл-шаблон: ${filePath}`);
      
      return filePath;
      
    } catch (error) {
      // Обработка ошибок создания файла
      throw new WorkflowErrorClass({
        code: 'FILE_CREATION_ERROR',
        category: 'execution',
        severity: 'error',
        message: `Не удалось создать файл-шаблон для шага ${step.id}: ${(error as Error).message}`,
        context: {
          stepId: step.id,
          error: (error as Error).message
        },
        recoverable: true,
        suggestions: [
          'Проверьте права доступа к директории артефактов',
          'Убедитесь, что достаточно места на диске',
          'Попробуйте указать альтернативную директорию',
          'Переключитесь на консольный ввод (input_mode: console)'
        ]
      });
    }
  }
  
  /**
   * Получение расширения файла по формату
   * 
   * @param format - Формат файла
   * @returns string - Расширение файла с точкой
   */
  private getFileExtension(format: FileFormat): string {
    switch (format) {
      case 'markdown':
        return '.md';
      case 'yaml':
        return '.yaml';
      case 'json':
        return '.json';
      case 'text':
        return '.txt';
      default:
        return '.txt';
    }
  }
  
  /**
   * Открытие файла в редакторе
   * 
   * Запускает текстовый редактор с файлом-шаблоном.
   * При недоступности редактора выводит путь для ручного открытия.
   * 
   * В тестовом режиме пропускает запуск редактора.
   * 
   * @param filePath - Путь к файлу
   * @param editorConfig - Конфигурация редактора (опционально)
   * @returns Promise<void>
   */
  private async openInEditor(
    filePath: string,
    editorConfig?: EditorConfig
  ): Promise<void> {
    // В тестовом режиме пропускаем запуск редактора
    if (this.testMode) {
      this.logger.debug(`Тестовый режим: пропуск запуска редактора для ${filePath}`);
      return;
    }
    
    try {
      this.logger.info(`Открытие файла в редакторе: ${filePath}`);
      
      // Запускаем редактор
      await this.editorManager.launchEditor(filePath, editorConfig);
      
      this.logger.info('Редактор успешно запущен');
      
    } catch (error) {
      // Обработка недоступного редактора
      this.logger.warn(`Не удалось запустить редактор: ${(error as Error).message}`);
      
      // Выводим путь для ручного открытия
      console.log('\n' + '='.repeat(70));
      console.log('⚠️  Не удалось автоматически открыть редактор');
      console.log('='.repeat(70));
      console.log('\nПожалуйста, откройте файл вручную:');
      console.log(`\n  📄 ${filePath}\n`);
      console.log('После заполнения файла вернитесь в терминал и выберите действие.');
      console.log('='.repeat(70) + '\n');
      
      // Не прерываем процесс - продолжаем в интерактивном режиме
    }
  }
  
  /**
   * Ожидание подтверждения от пользователя через интерактивное меню
   * 
   * Отображает интерактивное меню с вариантами:
   * - "Продолжить" (выбран по умолчанию)
   * - "Отложить"
   * 
   * Пользователь выбирает стрелочками и подтверждает Enter.
   * 
   * В тестовом режиме автоматически возвращает 'postpone' без интерактивности.
   * 
   * @param filePath - Путь к файлу для редактирования
   * @returns Promise<UserCommand> - Команда пользователя
   */
  private async waitForUserConfirmation(filePath: string): Promise<UserCommand> {
    // В тестовом режиме автоматически возвращаем 'postpone'
    if (this.testMode) {
      this.logger.debug('Тестовый режим: автоматически выбран "postpone"');
      return 'postpone';
    }
    
    return new Promise((resolve) => {
      const options = ['Продолжить', 'Отложить'];
      let selectedIndex = 0; // По умолчанию выбран "Продолжить"
      
      // Функция для отображения меню
      const displayMenu = () => {
        // Очищаем предыдущий вывод (перемещаем курсор вверх)
        if (selectedIndex !== 0 || process.stdout.isTTY) {
          readline.clearLine(process.stdout, 0);
          readline.cursorTo(process.stdout, 0);
        }
        
        console.log('\n' + '='.repeat(70));
        console.log('📝 Файл готов к заполнению');
        console.log('='.repeat(70));
        console.log(`\nФайл: ${filePath}`);
        console.log('\nВыберите действие (используйте стрелочки ↑↓ и Enter):\n');
        
        options.forEach((option, index) => {
          const prefix = index === selectedIndex ? '▶' : ' ';
          const marker = index === selectedIndex ? '●' : '○';
          console.log(`  ${prefix} ${marker} ${option}`);
        });
        
        console.log('\n' + '='.repeat(70));
      };
      
      // Отображаем начальное меню
      displayMenu();
      
      // Настраиваем readline для обработки нажатий клавиш
      if (process.stdin.isTTY) {
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
      }
      
      const onKeypress = (_str: string, key: readline.Key) => {
        if (key.name === 'up') {
          // Стрелка вверх
          selectedIndex = Math.max(0, selectedIndex - 1);
          
          // Перемещаем курсор вверх для перерисовки
          readline.moveCursor(process.stdout, 0, -(options.length + 6));
          displayMenu();
          
        } else if (key.name === 'down') {
          // Стрелка вниз
          selectedIndex = Math.min(options.length - 1, selectedIndex + 1);
          
          // Перемещаем курсор вверх для перерисовки
          readline.moveCursor(process.stdout, 0, -(options.length + 6));
          displayMenu();
          
        } else if (key.name === 'return') {
          // Enter - подтверждение выбора
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
          }
          process.stdin.removeListener('keypress', onKeypress);
          process.stdin.pause();
          
          const command: UserCommand = selectedIndex === 0 ? 'continue' : 'postpone';
          
          console.log(`\n✓ Выбрано: ${options[selectedIndex]}\n`);
          
          resolve(command);
          
        } else if (key.ctrl && key.name === 'c') {
          // Ctrl+C - выход
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
          }
          process.stdin.removeListener('keypress', onKeypress);
          process.stdin.pause();
          
          console.log('\n\n⚠️  Процесс прерван пользователем\n');
          process.exit(0);
        }
      };
      
      process.stdin.on('keypress', onKeypress);
      process.stdin.resume();
    });
  }
  
  /**
   * Чтение и валидация заполненного файла
   * 
   * Читает файл, парсит его согласно формату и выполняет валидацию.
   * При ошибках валидации предлагает повторное редактирование.
   * 
   * @param filePath - Путь к файлу
   * @param step - Шаг user_input
   * @param _context - Контекст выполнения (не используется в текущей реализации)
   * @returns Promise<ParsedUserInput> - Распарсенные данные
   * @throws WorkflowErrorClass - При критических ошибках
   */
  private async readAndValidate(
    filePath: string,
    step: WorkflowStep,
    _context: ExecutionContext
  ): Promise<ParsedUserInput> {
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        // 1. Проверка существования файла
        try {
          await fs.access(filePath);
        } catch {
          throw new WorkflowErrorClass({
            code: 'FILE_NOT_FOUND',
            category: 'execution',
            severity: 'error',
            message: `Файл не найден: ${filePath}`,
            context: { filePath },
            recoverable: true,
            suggestions: [
              'Файл был удален или перемещен',
              'Создайте файл заново',
              'Проверьте путь к файлу'
            ]
          });
        }
        
        // 2. Чтение содержимого файла
        this.logger.debug(`Чтение файла: ${filePath}`);
        const content = await fs.readFile(filePath, { encoding: 'utf-8' });
        
        // 3. Определение формата для парсинга
        const format = this.getInputFormat(step.file_format || 'markdown');
        
        // 4. Парсинг через UserInputHandler
        this.logger.debug(`Парсинг файла в формате: ${format}`);
        const parsedInput = this.userInputHandler.parseStructuredInput(content, format);
        
        // 5. Валидация данных
        if (step.validation && step.validation.length > 0) {
          this.logger.debug('Валидация данных');
          const validationResult = this.userInputHandler.validateInput(
            parsedInput.data,
            step.validation
          );
          
          if (!validationResult.valid) {
            // Валидация не пройдена
            this.logger.warn('Валидация не пройдена', { errors: validationResult.errors });
            
            // Выводим ошибки
            console.log('\n' + '='.repeat(70));
            console.log('❌ Ошибки валидации');
            console.log('='.repeat(70));
            
            for (const error of validationResult.errors) {
              console.log(`\n  Поле: ${error.field}`);
              console.log(`  Ошибка: ${error.message}`);
              console.log(`  Код: ${error.code}`);
            }
            
            console.log('\n' + '='.repeat(70));
            
            // Предлагаем повторное редактирование
            if (attempts < maxAttempts) {
              const shouldRetry = await this.askForRetry(filePath);
              
              if (shouldRetry) {
                // Открываем файл снова
                await this.openInEditor(filePath, step.editor);
                
                // Ждем подтверждения
                const command = await this.waitForUserConfirmation(filePath);
                
                if (command === 'postpone') {
                  throw new WorkflowErrorClass({
                    code: 'USER_POSTPONED',
                    category: 'user_input',
                    severity: 'warning',
                    message: 'Пользователь отложил выполнение',
                    context: { filePath },
                    recoverable: true,
                    suggestions: ['Возобновите процесс позже']
                  });
                }
                
                // Повторяем попытку
                continue;
              } else {
                throw new WorkflowErrorClass({
                  code: 'VALIDATION_ERROR',
                  category: 'user_input',
                  severity: 'error',
                  message: 'Валидация не пройдена',
                  context: {
                    filePath,
                    errors: validationResult.errors
                  },
                  recoverable: false,
                  suggestions: [
                    'Исправьте ошибки в файле',
                    'Проверьте формат данных',
                    'Убедитесь, что все обязательные поля заполнены'
                  ]
                });
              }
            } else {
              // Превышено количество попыток
              throw new WorkflowErrorClass({
                code: 'MAX_VALIDATION_ATTEMPTS',
                category: 'user_input',
                severity: 'error',
                message: `Превышено максимальное количество попыток валидации (${maxAttempts})`,
                context: {
                  filePath,
                  attempts,
                  errors: validationResult.errors
                },
                recoverable: false,
                suggestions: [
                  'Проверьте правильность заполнения всех полей',
                  'Обратитесь к документации по формату',
                  'Попробуйте использовать другой формат файла'
                ]
              });
            }
          }
        }
        
        // Валидация пройдена успешно
        this.logger.info('Файл успешно прочитан и провалидирован');
        return parsedInput;
        
      } catch (error) {
        // Если это наша ошибка, пробрасываем дальше
        if (error instanceof WorkflowErrorClass) {
          throw error;
        }
        
        // Обработка других ошибок
        throw new WorkflowErrorClass({
          code: 'FILE_READ_ERROR',
          category: 'execution',
          severity: 'error',
          message: `Ошибка чтения файла: ${(error as Error).message}`,
          context: {
            filePath,
            error: (error as Error).message
          },
          recoverable: false,
          suggestions: [
            'Проверьте права доступа к файлу',
            'Убедитесь, что файл не поврежден',
            'Попробуйте создать файл заново'
          ]
        });
      }
    }
    
    // Этот код не должен выполниться, но TypeScript требует return
    throw new Error('Unexpected error in readAndValidate');
  }
  
  /**
   * Преобразование FileFormat в InputFormat
   * 
   * @param fileFormat - Формат файла
   * @returns InputFormat - Формат для парсинга
   */
  private getInputFormat(fileFormat: FileFormat): InputFormat {
    switch (fileFormat) {
      case 'markdown':
        return 'markdown';
      case 'yaml':
        return 'yaml';
      case 'json':
        return 'json';
      case 'text':
        return 'text';
      default:
        return 'text';
    }
  }
  
  /**
   * Запрос пользователя о повторном редактировании
   * 
   * @param _filePath - Путь к файлу (не используется в текущей реализации)
   * @returns Promise<boolean> - true если пользователь хочет повторить
   */
  private async askForRetry(_filePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      console.log('\nХотите исправить ошибки и попробовать снова? (y/n): ');
      
      rl.question('', (answer) => {
        rl.close();
        
        const normalized = answer.trim().toLowerCase();
        resolve(normalized === 'y' || normalized === 'yes' || normalized === 'д' || normalized === 'да');
      });
    });
  }
}
