/**
 * InteractiveMenu - компонент для отображения интерактивного меню с навигацией
 * 
 * Предоставляет функции для:
 * - Отображения меню с опциями
 * - Навигации стрелками вверх/вниз
 * - Подтверждения выбора через Enter
 * - Визуального выделения выбранной опции
 * 
 * Requirements: 10.1.1, 10.1.2, 10.1.3, 10.1.5
 */

import { TerminalRenderer } from './terminal-renderer.js';

/**
 * Опция меню
 */
export interface MenuOption {
  /** Отображаемый текст опции */
  label: string;
  /** Значение, которое будет возвращено при выборе */
  value: string;
  /** Опциональное описание */
  description?: string;
}

/**
 * Конфигурация меню
 */
export interface MenuConfig {
  /** Заголовок меню */
  title?: string;
  /** Индекс опции, выбранной по умолчанию */
  defaultIndex?: number;
  /** Показывать ли описания опций */
  showDescriptions?: boolean;
}

/**
 * InteractiveMenu - класс для работы с интерактивным меню
 */
export class InteractiveMenu {
  private renderer: TerminalRenderer;
  private input: NodeJS.ReadStream;
  private currentIndex: number = 0;
  private options: MenuOption[] = [];
  private isActive: boolean = false;
  private startLine: number = 0;

  constructor(
    renderer?: TerminalRenderer,
    input: NodeJS.ReadStream = process.stdin
  ) {
    this.renderer = renderer || new TerminalRenderer();
    this.input = input;
  }

  /**
   * Отображение меню и ожидание выбора пользователя
   * 
   * @param options - Список опций меню
   * @param config - Конфигурация меню
   * @returns Promise с выбранным значением
   */
  public async show(
    options: MenuOption[],
    config: MenuConfig = {}
  ): Promise<string> {
    if (options.length === 0) {
      throw new Error('Menu must have at least one option');
    }

    this.options = options;
    this.currentIndex = config.defaultIndex ?? 0;
    
    // Валидация defaultIndex
    if (this.currentIndex < 0 || this.currentIndex >= options.length) {
      this.currentIndex = 0;
    }

    this.isActive = true;

    // Проверка возможностей терминала
    const capabilities = this.renderer.getCapabilities();
    if (!capabilities.isInteractive) {
      throw new Error('Interactive menu requires a TTY terminal');
    }

    // Отображение заголовка, если есть
    if (config.title) {
      this.renderer.writeLine(this.renderer.bold(config.title));
      this.renderer.writeLine();
    }

    // Сохраняем начальную позицию для перерисовки
    this.startLine = 0;

    // Первоначальная отрисовка меню
    this.render(config.showDescriptions ?? false);

    // Настройка обработки ввода
    return new Promise<string>((resolve) => {
      this.setupKeyboardHandling(resolve, config.showDescriptions ?? false);
    });
  }

  /**
   * Отрисовка меню
   */
  private render(showDescriptions: boolean): void {
    // Перемещаемся к началу меню
    if (this.startLine > 0) {
      this.renderer.moveCursorUp(this.startLine);
    }

    let linesDrawn = 0;

    for (let i = 0; i < this.options.length; i++) {
      const option = this.options[i];
      const isSelected = i === this.currentIndex;

      // Очищаем строку
      this.renderer.clearLine();
      this.renderer.moveCursorToColumn(1);

      // Формируем строку опции
      let line = '';
      
      if (isSelected) {
        // Выделенная опция: инвертированный текст
        line = this.renderer.inverse(` ${option.label} `);
        const arrowColor = this.renderer.getCapabilities().supportsColors ? '\x1b[36m' : '\x1b[0m';
        line = `${this.renderer.colorize('→', arrowColor as import('./terminal-renderer.js').TerminalColor)} ${line}`;
      } else {
        // Обычная опция
        line = `  ${option.label}`;
      }

      this.renderer.write(line);
      this.renderer.writeLine();
      linesDrawn++;

      // Отображение описания, если есть
      if (showDescriptions && option.description) {
        this.renderer.clearLine();
        this.renderer.moveCursorToColumn(1);
        const desc = this.renderer.dim(`    ${option.description}`);
        this.renderer.writeLine(desc);
        linesDrawn++;
      }
    }

    this.startLine = linesDrawn;
  }

  /**
   * Настройка обработки клавиатурного ввода
   */
  private setupKeyboardHandling(
    resolve: (value: string) => void,
    showDescriptions: boolean
  ): void {
    // Включаем raw mode для обработки клавиш
    if (this.input.isTTY) {
      this.input.setRawMode(true);
    }

    this.renderer.hideCursor();

    const onData = (data: Buffer) => {
      if (!this.isActive) {
        return;
      }

      const key = data.toString();

      // Обработка различных клавиш
      if (key === '\u001b[A') {
        // Стрелка вверх
        this.moveUp();
        this.render(showDescriptions);
      } else if (key === '\u001b[B') {
        // Стрелка вниз
        this.moveDown();
        this.render(showDescriptions);
      } else if (key === '\r' || key === '\n') {
        // Enter - подтверждение выбора
        this.cleanup();
        this.input.removeListener('data', onData);
        resolve(this.options[this.currentIndex].value);
      } else if (key === '\u0003' || key === '\u001b') {
        // Ctrl+C или Escape - отмена
        this.cleanup();
        this.input.removeListener('data', onData);
        resolve('');
      }
    };

    this.input.on('data', onData);
  }

  /**
   * Перемещение выбора вверх
   */
  private moveUp(): void {
    if (this.currentIndex > 0) {
      this.currentIndex--;
    } else {
      // Циклический переход к последней опции
      this.currentIndex = this.options.length - 1;
    }
  }

  /**
   * Перемещение выбора вниз
   */
  private moveDown(): void {
    if (this.currentIndex < this.options.length - 1) {
      this.currentIndex++;
    } else {
      // Циклический переход к первой опции
      this.currentIndex = 0;
    }
  }

  /**
   * Очистка ресурсов
   */
  private cleanup(): void {
    this.isActive = false;
    
    if (this.input.isTTY) {
      this.input.setRawMode(false);
    }
    
    this.renderer.showCursor();
    this.renderer.writeLine();
  }

  /**
   * Закрытие меню (для внешнего использования)
   */
  public close(): void {
    this.cleanup();
  }

  /**
   * Обработка нажатия клавиши (для тестирования)
   * 
   * @param callback - Функция обратного вызова
   */
  public onKeyPress(callback: (key: string) => void): void {
    this.input.on('data', (data: Buffer) => {
      callback(data.toString());
    });
  }

  /**
   * Получение текущего индекса выбранной опции (для тестирования)
   */
  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Установка текущего индекса (для тестирования)
   */
  public setCurrentIndex(index: number): void {
    if (index >= 0 && index < this.options.length) {
      this.currentIndex = index;
    }
  }

  /**
   * Получение опций (для тестирования)
   */
  public getOptions(): MenuOption[] {
    return this.options.map(opt => ({ ...opt }));
  }

  /**
   * Проверка активности меню (для тестирования)
   */
  public isMenuActive(): boolean {
    return this.isActive;
  }
}
