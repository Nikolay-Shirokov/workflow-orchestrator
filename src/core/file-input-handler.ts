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
  private menuHandler?: (options: Array<{ label: string; value: UserCommand }>, config?: { title?: string; defaultIndex?: number }) => Promise<UserCommand>;
  
  constructor(
    templateGenerator: TemplateGenerator,
    editorManager: EditorManager,
    userInputHandler: UserInputHandler,
    logger: Logger,
    testMode: boolean = false,
    menuHandler?: (options: Array<{ label: string; value: UserCommand }>, config?: { title?: string; defaultIndex?: number }) => Promise<UserCommand>
  ) {
    this.templateGenerator = templateGenerator;
    this.editorManager = editorManager;
    this.userInputHandler = userInputHandler;
    this.logger = logger;
    this.testMode = testMode;
    this.menuHandler = menuHandler;
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
   * Автоматически сохраняет состояние при прерывании (Ctrl+C).
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
    let filePath: string | undefined;
    let interruptHandler: NodeJS.SignalsListener | undefined;

    try {
      this.logger.info(`Начало обработки файлового ввода для шага: ${step.id}`);
      this.logger.debug(`testMode: ${this.testMode}`);
      this.logger.debug(`menuHandler: ${this.menuHandler ? 'есть' : 'нет'}`);

      // 1. Создание файла-шаблона
      filePath = await this.createTemplateFile(step, context);
      this.logger.info(`Файл создан: ${filePath}`);
      
      // Устанавливаем обработчик прерывания для автосохранения
      if (!this.testMode) {
        interruptHandler = async () => {
          await this.handleInterruption(filePath!, step, context);
        };
        process.on('SIGINT', interruptHandler);
        process.on('SIGTERM', interruptHandler);
      }
      
      // 2. Открытие в редакторе
      // Используем редактор из шага, или default_editor из настроек workflow
      const editorConfig = step.editor || (context.state.context.default_editor as EditorConfig | undefined);
      this.logger.debug(`Конфигурация редактора: ${JSON.stringify(editorConfig)}`);
      this.logger.debug(`context.state.context.default_editor: ${JSON.stringify(context.state.context.default_editor)}`);

      this.logger.info(`Открытие файла в редакторе...`);
      await this.openInEditor(filePath, editorConfig);
      this.logger.info(`Редактор закрыт, ожидание подтверждения пользователя...`);

      // 3. Ожидание подтверждения пользователя
      const userCommand = await this.waitForUserConfirmation(filePath);
      this.logger.info(`Пользователь выбрал: ${userCommand}`);
      
      // Если пользователь выбрал отложить
      if (userCommand === 'postpone') {
        this.logger.info('Пользователь выбрал отложить выполнение');

        // Сохраняем частично заполненный файл
        await this.savePartialState(filePath, step, context);

        // Обновляем статус процесса
        const oldStatus = context.state.status;
        context.state.status = 'paused';
        this.logger.info(`Статус процесса изменен: ${oldStatus} -> ${context.state.status}`);
        this.logger.debug(`context.state === state: ${context.state === (context as any).state}`);

        // Удаляем обработчик прерывания
        if (interruptHandler) {
          process.off('SIGINT', interruptHandler);
          process.off('SIGTERM', interruptHandler);
        }

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
      
      // Удаляем обработчик прерывания после успешного завершения
      if (interruptHandler) {
        process.off('SIGINT', interruptHandler);
        process.off('SIGTERM', interruptHandler);
      }
      
      this.logger.info(`Файловый ввод успешно обработан для шага: ${step.id}`);
      
      return {
        success: true,
        filePath,
        data: parsedInput.data as Record<string, unknown>,
        userCommand,
        processingTime: Date.now() - startTime
      };
      
    } catch (error) {
      // Удаляем обработчик прерывания при ошибке
      if (interruptHandler) {
        process.off('SIGINT', interruptHandler);
        process.off('SIGTERM', interruptHandler);
      }
      
      this.logger.error(`Ошибка обработки файлового ввода для шага ${step.id}`, error as Error);
      throw error;
    }
  }
  
  /**
   * Обработка прерывания процесса (Ctrl+C)
   * 
   * Автоматически сохраняет частично заполненный файл и состояние процесса.
   * 
   * @param filePath - Путь к файлу
   * @param step - Шаг user_input
   * @param context - Контекст выполнения
   * @returns Promise<void>
   */
  private async handleInterruption(
    filePath: string,
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<void> {
    console.log('\n\n' + '='.repeat(70));
    console.log('⚠️  Получен сигнал прерывания (Ctrl+C)');
    console.log('='.repeat(70));
    console.log('\nСохранение текущего состояния...');
    
    try {
      // Сохраняем частично заполненный файл
      await this.savePartialState(filePath, step, context);
      
      console.log('OK Состояние сохранено');
      console.log(`\nФайл: ${filePath}`);
      console.log('Резервная копия: ' + filePath + '.backup');
      console.log('\nВы можете возобновить процесс позже.');
      console.log('='.repeat(70) + '\n');
      
      this.logger.info('Процесс прерван пользователем, состояние сохранено');
      
    } catch (error) {
      console.log('❌ Ошибка сохранения состояния:', (error as Error).message);
      this.logger.error('Ошибка сохранения состояния при прерывании', error as Error);
    }
    
    // Завершаем процесс
    process.exit(0);
  }
  
  /**
   * Сохранение частично заполненного файла и состояния
   * 
   * Создает резервную копию файла и сохраняет метаданные для возобновления.
   * 
   * @param filePath - Путь к файлу
   * @param step - Шаг user_input
   * @param context - Контекст выполнения
   * @returns Promise<void>
   */
  private async savePartialState(
    filePath: string,
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<void> {
    try {
      // Проверяем существование файла
      const fileExists = await this.checkFileExists(filePath);
      
      if (fileExists) {
        // Читаем текущее содержимое
        const content = await fs.readFile(filePath, { encoding: 'utf-8' });
        
        // Создаем резервную копию
        const backupPath = `${filePath}.backup`;
        await fs.writeFile(backupPath, content, { encoding: 'utf-8' });
        
        this.logger.info(`Создана резервная копия: ${backupPath}`);
        
        // Сохраняем метаданные для возобновления
        const metadataPath = `${filePath}.meta.json`;
        const metadata = {
          stepId: step.id,
          sessionId: context.state.sessionId,
          timestamp: new Date().toISOString(),
          filePath,
          backupPath,
          status: 'partial'
        };
        
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), { encoding: 'utf-8' });
        
        this.logger.info(`Сохранены метаданные: ${metadataPath}`);
      }
      
      // Обновляем статус процесса
      context.state.status = 'paused';
      
    } catch (error) {
      this.logger.error('Ошибка сохранения частичного состояния', error as Error);
      throw error;
    }
  }
  
  /**
   * Создание файла-шаблона
   * 
   * Генерирует файл-шаблон на основе формата и сохраняет его
   * в директории артефактов с понятным именем.
   * 
   * Стратегия восстановления при ошибках:
   * 1. Попытка создания в альтернативной директории (tmp)
   * 2. Предложение указать путь вручную
   * 3. Переключение на консольный ввод
   * 
   * @param step - Шаг user_input
   * @param context - Контекст выполнения
   * @returns Promise<string> - Путь к созданному файлу
   * @throws WorkflowErrorClass - При критической ошибке создания файла
   */
  private async createTemplateFile(
    step: WorkflowStep,
    context: ExecutionContext
  ): Promise<string> {
    // Определяем формат файла
    const format: FileFormat = step.file_format || 'markdown';
    const extension = this.getFileExtension(format);
    
    // Определяем имя файла
    // Если в step.outputs есть путь, используем его директорию
    const fileName = `${step.id}_input${extension}`;
    let fileDir = '';
    
    if (step.outputs) {
      // Берем первый output для определения директории
      const firstOutput = Object.values(step.outputs)[0];
      if (firstOutput) {
        // Рендерим путь с подстановкой переменных
        const renderedPath = context.templateEngine.render(
          firstOutput,
          {
            variables: context.state.context,
            loadArtifact: (_path: string) => '',
            if: (condition: boolean, thenValue: string, elseValue?: string) => 
              condition ? thenValue : (elseValue || ''),
            forEach: (_items: unknown[], _template: string) => ''
          }
        );
        
        // Извлекаем директорию из пути
        const lastSlash = Math.max(renderedPath.lastIndexOf('/'), renderedPath.lastIndexOf('\\'));
        if (lastSlash > 0) {
          fileDir = renderedPath.substring(0, lastSlash);
        }
      }
    }
    
    // Формируем полный путь к файлу
    const fullFileName = fileDir ? `${fileDir}/${fileName}` : fileName;
    
    this.logger.debug(`Создание шаблона в формате: ${format}, путь: ${fullFileName}`);
    
    // Генерируем содержимое шаблона
    const templateContent = this.templateGenerator.generate(format, step, context);
    
    // Попытка 1: Создание в стандартной директории артефактов
    try {
      const filePath = await context.artifactManager.save(
        context.state.sessionId,
        step.id,
        fullFileName,
        templateContent
      );
      
      this.logger.info(`Создан файл-шаблон: ${filePath}`);
      return filePath;
      
    } catch (primaryError) {
      this.logger.warn(`Не удалось создать файл в стандартной директории: ${(primaryError as Error).message}`);
      
      // Попытка 2: Создание в альтернативной директории (tmp)
      try {
        const tmpDir = process.platform === 'win32' ? process.env.TEMP || 'C:\\Temp' : '/tmp';
        const alternativePath = `${tmpDir}/${context.state.sessionId}_${fileName}`;
        
        this.logger.info(`Попытка создания в альтернативной директории: ${alternativePath}`);
        
        await fs.writeFile(alternativePath, templateContent, { encoding: 'utf-8' });
        
        console.log('\n' + '='.repeat(70));
        console.log('⚠️  Файл создан в альтернативной директории');
        console.log('='.repeat(70));
        console.log(`\nСтандартная директория недоступна, файл создан в: ${alternativePath}`);
        console.log('='.repeat(70) + '\n');
        
        this.logger.info(`Файл создан в альтернативной директории: ${alternativePath}`);
        return alternativePath;
        
      } catch (alternativeError) {
        this.logger.error(`Не удалось создать файл в альтернативной директории: ${(alternativeError as Error).message}`);
        
        // Попытка 3: Предложение указать путь вручную (только в интерактивном режиме)
        if (!this.testMode) {
          try {
            const manualPath = await this.askForManualPath(fileName, templateContent);
            
            if (manualPath) {
              this.logger.info(`Файл создан по указанному пути: ${manualPath}`);
              return manualPath;
            }
          } catch (manualError) {
            this.logger.error(`Не удалось создать файл по указанному пути: ${(manualError as Error).message}`);
          }
        }
        
        // Все попытки исчерпаны - выбрасываем ошибку с предложением переключиться на консольный ввод
        throw new WorkflowErrorClass({
          code: 'FILE_CREATION_ERROR',
          category: 'execution',
          severity: 'error',
          message: `Не удалось создать файл-шаблон для шага ${step.id}. Попробуйте переключиться на консольный ввод.`,
          context: {
            stepId: step.id,
            primaryError: (primaryError as Error).message,
            alternativeError: (alternativeError as Error).message
          },
          recoverable: true,
          suggestions: [
            'Переключитесь на консольный ввод: установите input_mode: "console" в конфигурации шага',
            'Проверьте права доступа к директориям',
            'Убедитесь, что достаточно места на диске',
            'Проверьте, что директория артефактов существует и доступна для записи'
          ]
        });
      }
    }
  }
  
  /**
   * Запрос пользователя о ручном указании пути для файла
   * 
   * @param fileName - Имя файла
   * @param content - Содержимое файла
   * @returns Promise<string | null> - Путь к созданному файлу или null
   */
  private async askForManualPath(fileName: string, content: string): Promise<string | null> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      console.log('\n' + '='.repeat(70));
      console.log('❌ Не удалось создать файл автоматически');
      console.log('='.repeat(70));
      console.log('\nВы можете указать путь для создания файла вручную.');
      console.log('Оставьте пустым для переключения на консольный ввод.\n');
      
      rl.question(`Введите полный путь для файла ${fileName}: `, async (answer) => {
        rl.close();
        
        const path = answer.trim();
        
        if (!path) {
          console.log('\n⚠️  Переключение на консольный ввод...\n');
          resolve(null);
          return;
        }
        
        try {
          await fs.writeFile(path, content, { encoding: 'utf-8' });
          console.log(`\nOK Файл успешно создан: ${path}\n`);
          resolve(path);
        } catch (error) {
          console.log(`\n❌ Ошибка создания файла: ${(error as Error).message}\n`);
          resolve(null);
        }
      });
    });
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
   * 
   * Стратегия восстановления при недоступности редактора:
   * 1. Попытка использовать указанный редактор
   * 2. Попытка использовать альтернативные редакторы
   * 3. Вывод пути для ручного открытия
   * 4. Продолжение в интерактивном режиме
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
    
    this.logger.debug(`openInEditor вызван с editorConfig: ${JSON.stringify(editorConfig)}`);
    
    // Попытка 1: Использование указанного редактора
    if (editorConfig?.command) {
      try {
        this.logger.info(`Попытка открыть файл в указанном редакторе: ${editorConfig.command}`);
        await this.editorManager.launchEditor(filePath, editorConfig);
        this.logger.info('Редактор успешно запущен');
        return;
      } catch (error) {
        this.logger.warn(`Не удалось запустить указанный редактор ${editorConfig.command}: ${(error as Error).message}`);
        // Продолжаем попытки с альтернативными редакторами
      }
    }
    
    // Попытка 2: Использование системного редактора по умолчанию
    try {
      this.logger.info(`Попытка открыть файл в системном редакторе по умолчанию`);
      await this.editorManager.launchEditor(filePath);
      this.logger.info('Редактор успешно запущен');
      return;
    } catch (defaultError) {
      this.logger.warn(`Не удалось запустить системный редактор: ${(defaultError as Error).message}`);
    }
    
    // Попытка 3: Перебор альтернативных редакторов
    const alternativeEditors = this.getAlternativeEditors();
    
    for (const editorCommand of alternativeEditors) {
      try {
        this.logger.info(`Попытка открыть файл в альтернативном редакторе: ${editorCommand}`);
        
        // Проверяем доступность редактора
        const isAvailable = await this.editorManager.checkEditorAvailability(editorCommand);
        
        if (isAvailable) {
          await this.editorManager.launchEditor(filePath, { command: editorCommand });
          
          console.log('\n' + '='.repeat(70));
          console.log('OK Файл открыт в альтернативном редакторе');
          console.log('='.repeat(70));
          console.log(`\nРедактор: ${editorCommand}`);
          console.log(`Файл: ${filePath}`);
          console.log('='.repeat(70) + '\n');
          
          this.logger.info(`Файл успешно открыт в альтернативном редакторе: ${editorCommand}`);
          return;
        }
      } catch (error) {
        this.logger.debug(`Не удалось запустить редактор ${editorCommand}: ${(error as Error).message}`);
        // Продолжаем со следующим редактором
      }
    }
    
    // Все попытки исчерпаны - выводим путь для ручного открытия
    this.logger.warn('Не удалось автоматически открыть ни один редактор');
    
    console.log('\n' + '='.repeat(70));
    console.log('⚠️  Не удалось автоматически открыть редактор');
    console.log('='.repeat(70));
    console.log('\nПожалуйста, откройте файл вручную в любом текстовом редакторе:');
    console.log(`\n  📄 ${filePath}\n`);
    console.log('Рекомендуемые редакторы:');
    
    const platform = process.platform;
    if (platform === 'win32') {
      console.log('  - Visual Studio Code (code)');
      console.log('  - Notepad++ (notepad++)');
      console.log('  - Блокнот (notepad)');
    } else if (platform === 'darwin') {
      console.log('  - Visual Studio Code (code)');
      console.log('  - Sublime Text (subl)');
      console.log('  - TextEdit');
    } else {
      console.log('  - Visual Studio Code (code)');
      console.log('  - Gedit (gedit)');
      console.log('  - Nano (nano)');
      console.log('  - Vim (vim)');
    }
    
    console.log('\nПосле заполнения файла вернитесь в терминал и выберите действие.');
    console.log('='.repeat(70) + '\n');
    
    // Не прерываем процесс - продолжаем в интерактивном режиме
  }
  
  /**
   * Получение списка альтернативных редакторов для попытки запуска
   * 
   * @returns string[] - Список команд редакторов
   */
  private getAlternativeEditors(): string[] {
    const platform = process.platform;
    
    switch (platform) {
      case 'win32':
        return ['code', 'kiro', 'cursor', 'notepad++', 'notepad'];
        
      case 'darwin':
        return ['code', 'kiro', 'cursor', 'subl', 'nano', 'vim'];
        
      case 'linux':
      default:
        return ['code', 'kiro', 'cursor', 'subl', 'gedit', 'kate', 'nano', 'vim'];
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
    if (this.testMode) {
      this.logger.debug('Тестовый режим: автоматически выбран "Отложить"');
      return 'postpone';
    }

    if (this.menuHandler) {
      try {
        return await this.menuHandler(
          [
            { label: 'Продолжить', value: 'continue' },
            { label: 'Отложить', value: 'postpone' }
          ],
          { title: 'Файл готов к заполнению', defaultIndex: 0 }
        );
      } catch {
        // Переходим к консольному меню
      }
    }

    return new Promise((resolve) => {
      const options = ['Продолжить', 'Отложить'];
      let selectedIndex = 0;
      const canClear = process.stdout.isTTY;

      const clearMenuScreen = () => {
        if (!canClear) {
          return;
        }
        process.stdout.write('\x1b[2J');
        process.stdout.write('\x1b[H');
      };

      const displayMenu = () => {
        clearMenuScreen();
        console.log('\n' + '='.repeat(70));
        console.log('Файл готов к заполнению');
        console.log('='.repeat(70));
        console.log(`\nФайл: ${filePath}`);
        console.log('\nВыберите действие (стрелки вверх/вниз и Enter):\n');

        options.forEach((option, index) => {
          const prefix = index === selectedIndex ? '>' : ' ';
          console.log(`  ${prefix} ${option}`);
        });

        console.log('\n' + '='.repeat(70));
      };

      displayMenu();

      if (process.stdin.isTTY) {
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
      }

      const onKeypress = (_str: string, key: readline.Key) => {
        if (key.name === 'up') {
          selectedIndex = Math.max(0, selectedIndex - 1);
          displayMenu();
          return;
        }

        if (key.name === 'down') {
          selectedIndex = Math.min(options.length - 1, selectedIndex + 1);
          displayMenu();
          return;
        }

        if (key.name === 'return') {
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
          }
          process.stdin.removeListener('keypress', onKeypress);
          process.stdin.pause();

          const command: UserCommand = selectedIndex === 0 ? 'continue' : 'postpone';
          console.log(`\nВыбрано: ${options[selectedIndex]}\n`);
          clearMenuScreen();
          resolve(command);
          return;
        }

        if (key.ctrl && key.name === 'c') {
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
          }
          process.stdin.removeListener('keypress', onKeypress);
          process.stdin.pause();
          console.log('\n\nПроцесс прерван пользователем\n');
          clearMenuScreen();
          process.exit(0);
        }
      };

      process.stdin.on('keypress', onKeypress);
      process.stdin.resume();
    });
  }

  private async readAndValidate(
    filePath: string,
    step: WorkflowStep,
    context: ExecutionContext
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
          this.logger.warn(`Файл не найден: ${filePath}`);
          
          // Попытка восстановления из резервной копии
          const backupPath = `${filePath}.backup`;
          const backupExists = await this.checkFileExists(backupPath);
          
          if (backupExists) {
            const shouldRestore = await this.askForBackupRestore(filePath, backupPath);
            
            if (shouldRestore) {
              try {
                await fs.copyFile(backupPath, filePath);
                this.logger.info(`Файл восстановлен из резервной копии: ${backupPath}`);
                console.log(`\nOK Файл восстановлен из резервной копии\n`);
                // Продолжаем чтение восстановленного файла
              } catch (restoreError) {
                this.logger.error(`Не удалось восстановить файл из резервной копии: ${(restoreError as Error).message}`);
              }
            }
          }
          
          // Если файл все еще не существует, предлагаем создать новый
          const fileExists = await this.checkFileExists(filePath);
          if (!fileExists) {
            const shouldRecreate = await this.askForFileRecreation(filePath);
            
            if (shouldRecreate) {
              // Создаем файл заново
              const newFilePath = await this.createTemplateFile(step, context);
              
              // Открываем в редакторе
              await this.openInEditor(newFilePath, step.editor);
              
              // Ждем подтверждения
              const command = await this.waitForUserConfirmation(newFilePath);
              
              if (command === 'postpone') {
                throw new WorkflowErrorClass({
                  code: 'USER_POSTPONED',
                  category: 'user_input',
                  severity: 'warning',
                  message: 'Пользователь отложил выполнение',
                  context: { filePath: newFilePath },
                  recoverable: true,
                  suggestions: ['Возобновите процесс позже']
                });
              }
              
              // Обновляем путь к файлу и продолжаем
              filePath = newFilePath;
            } else {
              throw new WorkflowErrorClass({
                code: 'FILE_NOT_FOUND',
                category: 'execution',
                severity: 'error',
                message: `Файл не найден и не был создан заново: ${filePath}`,
                context: { filePath },
                recoverable: false,
                suggestions: [
                  'Создайте файл вручную',
                  'Проверьте путь к файлу',
                  'Возобновите процесс для создания нового файла'
                ]
              });
            }
          }
        }
        
        // 2. Чтение содержимого файла
        this.logger.debug(`Чтение файла: ${filePath}`);
        const content = await fs.readFile(filePath, { encoding: 'utf-8' });
        
        // Создаем резервную копию перед валидацией
        await this.createBackup(filePath, content);
        
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
            
            // Выводим детальные ошибки валидации
            console.log('\n' + '='.repeat(70));
            console.log('❌ Ошибки валидации данных');
            console.log('='.repeat(70));
            console.log(`\nФайл: ${filePath}`);
            console.log(`Найдено ошибок: ${validationResult.errors.length}\n`);
            
            // Группируем ошибки по полям для лучшей читаемости
            const errorsByField = new Map<string, typeof validationResult.errors>();
            for (const error of validationResult.errors) {
              const field = error.field || 'общие';
              if (!errorsByField.has(field)) {
                errorsByField.set(field, []);
              }
              errorsByField.get(field)!.push(error);
            }
            
            // Выводим ошибки по полям
            for (const [field, errors] of errorsByField) {
              console.log(`📍 Поле: ${field}`);
              for (const error of errors) {
                console.log(`   ❌ ${error.message}`);
                if (error.code) {
                  console.log(`      Код ошибки: ${error.code}`);
                }
                if (error.expected) {
                  console.log(`      Ожидается: ${error.expected}`);
                }
                if (error.actual) {
                  console.log(`      Получено: ${error.actual}`);
                }
              }
              console.log('');
            }
            
            console.log('='.repeat(70));
            console.log('\n💡 Рекомендации:');
            console.log('   - Проверьте правильность заполнения указанных полей');
            console.log('   - Убедитесь, что все обязательные поля заполнены');
            console.log('   - Проверьте формат данных (тип, длина, допустимые значения)');
            console.log('   - Резервная копия сохранена в: ' + filePath + '.backup');
            console.log('='.repeat(70) + '\n');
            
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
   * Проверка существования файла
   * 
   * @param filePath - Путь к файлу
   * @returns Promise<boolean> - Существует ли файл
   */
  private async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Создание резервной копии файла
   * 
   * @param filePath - Путь к файлу
   * @param content - Содержимое файла
   * @returns Promise<void>
   */
  private async createBackup(filePath: string, content: string): Promise<void> {
    try {
      const backupPath = `${filePath}.backup`;
      await fs.writeFile(backupPath, content, { encoding: 'utf-8' });
      this.logger.debug(`Создана резервная копия: ${backupPath}`);
    } catch (error) {
      this.logger.warn(`Не удалось создать резервную копию: ${(error as Error).message}`);
      // Не прерываем процесс, если не удалось создать резервную копию
    }
  }
  
  /**
   * Запрос пользователя о восстановлении из резервной копии
   * 
   * @param _filePath - Путь к основному файлу (не используется)
   * @param backupPath - Путь к резервной копии
   * @returns Promise<boolean> - true если пользователь хочет восстановить
   */
  private async askForBackupRestore(_filePath: string, backupPath: string): Promise<boolean> {
    // В тестовом режиме автоматически возвращаем true (восстановить)
    if (this.testMode) {
      this.logger.debug('Тестовый режим: автоматически выбран "восстановить из резервной копии"');
      return true;
    }

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      console.log('\n' + '='.repeat(70));
      console.log('⚠️  Файл был удален');
      console.log('='.repeat(70));
      console.log(`\nНайдена резервная копия: ${backupPath}`);
      console.log('Хотите восстановить файл из резервной копии? (y/n): ');
      
      rl.question('', (answer) => {
        rl.close();
        
        const normalized = answer.trim().toLowerCase();
        resolve(normalized === 'y' || normalized === 'yes' || normalized === 'д' || normalized === 'да');
      });
    });
  }
  
  /**
   * Запрос пользователя о создании нового файла
   * 
   * @param filePath - Путь к файлу
   * @returns Promise<boolean> - true если пользователь хочет создать новый файл
   */
  private async askForFileRecreation(filePath: string): Promise<boolean> {
    // В тестовом режиме автоматически возвращаем false (не создавать новый файл)
    if (this.testMode) {
      this.logger.debug('Тестовый режим: автоматически выбран "не создавать новый файл"');
      return false;
    }

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      console.log('\n' + '='.repeat(70));
      console.log('❌ Файл не найден');
      console.log('='.repeat(70));
      console.log(`\nФайл был удален или перемещен: ${filePath}`);
      console.log('Хотите создать новый файл? (y/n): ');
      
      rl.question('', (answer) => {
        rl.close();
        
        const normalized = answer.trim().toLowerCase();
        resolve(normalized === 'y' || normalized === 'yes' || normalized === 'д' || normalized === 'да');
      });
    });
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
    // В тестовом режиме автоматически возвращаем false (не повторять)
    if (this.testMode) {
      this.logger.debug('Тестовый режим: автоматически выбран "не повторять"');
      return false;
    }

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
