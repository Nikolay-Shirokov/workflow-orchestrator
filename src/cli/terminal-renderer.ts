/**
 * TerminalRenderer - низкоуровневый компонент для работы с терминалом
 * 
 * Предоставляет функции для:
 * - Управления курсором
 * - Цветового форматирования
 * - Определения возможностей терминала
 * - Обработки изменения размера терминала
 */

/**
 * Цвета терминала (ANSI escape codes)
 */
export enum TerminalColor {
  Reset = '\x1b[0m',
  Red = '\x1b[31m',
  Green = '\x1b[32m',
  Yellow = '\x1b[33m',
  Blue = '\x1b[34m',
  Magenta = '\x1b[35m',
  Cyan = '\x1b[36m',
  Gray = '\x1b[90m',
  White = '\x1b[37m',
  BrightRed = '\x1b[91m',
  BrightGreen = '\x1b[92m',
  BrightYellow = '\x1b[93m',
  BrightBlue = '\x1b[94m',
  BrightMagenta = '\x1b[95m',
  BrightCyan = '\x1b[96m',
  BrightWhite = '\x1b[97m'
}

/**
 * Возможности терминала
 */
export interface TerminalCapabilities {
  /** Поддержка ANSI escape codes */
  supportsAnsi: boolean;
  /** Поддержка цветов */
  supportsColors: boolean;
  /** Ширина терминала */
  width: number;
  /** Высота терминала */
  height: number;
  /** Является ли терминал интерактивным (TTY) */
  isInteractive: boolean;
}

/**
 * Размер терминала
 */
export interface TerminalSize {
  width: number;
  height: number;
}

/**
 * TerminalRenderer - класс для работы с терминалом
 */
export class TerminalRenderer {
  private output: NodeJS.WriteStream;
  private capabilities: TerminalCapabilities;
  private resizeListeners: Array<() => void> = [];
  private resizeHandler: (() => void) | null = null;

  constructor(output: NodeJS.WriteStream = process.stdout) {
    this.output = output;
    this.capabilities = this.detectCapabilities();
    
    // Создаем обработчик изменения размера
    this.resizeHandler = () => {
      this.capabilities = this.detectCapabilities();
      this.notifyResizeListeners();
    };
    
    // Подписываемся на изменение размера терминала
    if (this.capabilities.isInteractive) {
      // Увеличиваем лимит слушателей для тестов
      const currentMaxListeners = this.output.getMaxListeners();
      if (currentMaxListeners !== 0 && currentMaxListeners < 100) {
        this.output.setMaxListeners(100);
      }
      this.output.on('resize', this.resizeHandler);
    }
  }

  /**
   * Определение возможностей терминала
   */
  private detectCapabilities(): TerminalCapabilities {
    const isInteractive = this.output.isTTY === true;
    
    // Проверка поддержки ANSI через переменные окружения
    const term = process.env.TERM || '';
    const colorTerm = process.env.COLORTERM || '';
    const ci = process.env.CI === 'true';
    
    // Терминалы, которые точно поддерживают ANSI
    const supportsAnsi = isInteractive && (
      term.includes('color') ||
      term.includes('ansi') ||
      term.includes('xterm') ||
      term.includes('screen') ||
      term.includes('vt100') ||
      colorTerm.length > 0
    ) && !ci;

    const supportsColors = supportsAnsi;

    // Получение размера терминала
    const size = this.getSize();

    return {
      supportsAnsi,
      supportsColors,
      width: size.width,
      height: size.height,
      isInteractive
    };
  }

  /**
   * Получение текущих возможностей терминала
   */
  public getCapabilities(): TerminalCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Получение размера терминала
   */
  public getSize(): TerminalSize {
    if (this.output.isTTY && this.output.columns && this.output.rows) {
      return {
        width: this.output.columns,
        height: this.output.rows
      };
    }
    
    // Значения по умолчанию для не-TTY
    return {
      width: 80,
      height: 24
    };
  }

  /**
   * Подписка на изменение размера терминала
   */
  public onResize(callback: () => void): void {
    this.resizeListeners.push(callback);
  }

  /**
   * Уведомление слушателей об изменении размера
   */
  private notifyResizeListeners(): void {
    for (const listener of this.resizeListeners) {
      try {
        listener();
      } catch (error) {
        // Игнорируем ошибки в слушателях
      }
    }
  }

  /**
   * Перемещение курсора на указанную позицию
   */
  public moveCursor(x: number, y: number): void {
    if (this.capabilities.supportsAnsi) {
      this.output.write(`\x1b[${y};${x}H`);
    }
  }

  /**
   * Перемещение курсора вверх на N строк
   */
  public moveCursorUp(lines: number): void {
    if (this.capabilities.supportsAnsi && lines > 0) {
      this.output.write(`\x1b[${lines}A`);
    }
  }

  /**
   * Перемещение курсора вниз на N строк
   */
  public moveCursorDown(lines: number): void {
    if (this.capabilities.supportsAnsi && lines > 0) {
      this.output.write(`\x1b[${lines}B`);
    }
  }

  /**
   * Перемещение курсора в начало строки
   */
  public moveCursorToColumn(column: number): void {
    if (this.capabilities.supportsAnsi) {
      this.output.write(`\x1b[${column}G`);
    }
  }

  /**
   * Очистка экрана
   */
  public clearScreen(): void {
    if (this.capabilities.supportsAnsi) {
      this.output.write('\x1b[2J');
      this.output.write('\x1b[H');
    }
  }

  /**
   * Очистка текущей строки
   */
  public clearLine(): void {
    if (this.capabilities.supportsAnsi) {
      this.output.write('\x1b[2K');
    }
  }

  /**
   * Очистка от курсора до конца строки
   */
  public clearLineFromCursor(): void {
    if (this.capabilities.supportsAnsi) {
      this.output.write('\x1b[K');
    }
  }

  /**
   * Скрытие курсора
   */
  public hideCursor(): void {
    if (this.capabilities.supportsAnsi) {
      this.output.write('\x1b[?25l');
    }
  }

  /**
   * Показ курсора
   */
  public showCursor(): void {
    if (this.capabilities.supportsAnsi) {
      this.output.write('\x1b[?25h');
    }
  }

  /**
   * Включение альтернативного буфера экрана
   * Используется для создания "полноэкранного" интерфейса как в vim/htop
   */
  public enterAlternateBuffer(): void {
    if (this.capabilities.supportsAnsi) {
      this.output.write('\x1b[?1049h');
    }
  }

  /**
   * Выключение альтернативного буфера экрана
   * Возвращает к основному буферу терминала
   */
  public exitAlternateBuffer(): void {
    if (this.capabilities.supportsAnsi) {
      this.output.write('\x1b[?1049l');
    }
  }

  /**
   * Цветовое форматирование текста
   */
  public colorize(text: string, color: TerminalColor): string {
    if (!this.capabilities.supportsColors) {
      return text;
    }
    return `${color}${text}${TerminalColor.Reset}`;
  }

  /**
   * Жирный текст
   */
  public bold(text: string): string {
    if (!this.capabilities.supportsAnsi) {
      return text;
    }
    return `\x1b[1m${text}\x1b[22m`;
  }

  /**
   * Тусклый текст
   */
  public dim(text: string): string {
    if (!this.capabilities.supportsAnsi) {
      return text;
    }
    return `\x1b[2m${text}\x1b[22m`;
  }

  /**
   * Подчеркнутый текст
   */
  public underline(text: string): string {
    if (!this.capabilities.supportsAnsi) {
      return text;
    }
    return `\x1b[4m${text}\x1b[24m`;
  }

  /**
   * Инвертированный текст (фон и текст меняются местами)
   */
  public inverse(text: string): string {
    if (!this.capabilities.supportsAnsi) {
      return text;
    }
    return `\x1b[7m${text}\x1b[27m`;
  }

  /**
   * Вывод текста
   */
  public write(text: string): void {
    this.output.write(text);
  }

  /**
   * Вывод текста с переводом строки
   */
  public writeLine(text: string = ''): void {
    this.output.write(text + '\n');
  }

  /**
   * Сохранение позиции курсора
   */
  public saveCursorPosition(): void {
    if (this.capabilities.supportsAnsi) {
      this.output.write('\x1b[s');
    }
  }

  /**
   * Восстановление позиции курсора
   */
  public restoreCursorPosition(): void {
    if (this.capabilities.supportsAnsi) {
      this.output.write('\x1b[u');
    }
  }

  /**
   * Получение цвета для статуса шага
   * Используется для цветовой индикации согласно Requirements 2.3
   */
  public getStatusColor(status: 'completed' | 'running' | 'pending' | 'failed' | 'skipped'): TerminalColor {
    switch (status) {
      case 'completed':
        return TerminalColor.Green;
      case 'running':
        return TerminalColor.Yellow;
      case 'pending':
        return TerminalColor.Gray;
      case 'failed':
        return TerminalColor.Red;
      case 'skipped':
        return TerminalColor.Gray;
      default:
        return TerminalColor.Reset;
    }
  }

  /**
   * Получение иконки для статуса шага
   */
  public getStatusIcon(status: 'completed' | 'running' | 'pending' | 'failed' | 'skipped'): string {
    switch (status) {
      case 'completed':
        return '✓';
      case 'running':
        return '⏳';
      case 'pending':
        return '○';
      case 'failed':
        return '✗';
      case 'skipped':
        return '○';
      default:
        return '?';
    }
  }
  /**
   * Форматирование статуса с цветом и иконкой
   */
  public formatStatus(status: 'completed' | 'running' | 'pending' | 'failed' | 'skipped'): string {
    const icon = this.getStatusIcon(status);
    const color = this.getStatusColor(status);
    return this.colorize(icon, color);
  }

  /**
   * Очистка ресурсов
   */
  public dispose(): void {
    // Отписываемся от события resize
    if (this.resizeHandler && this.capabilities.isInteractive) {
      this.output.off('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    
    // Очищаем слушателей
    this.resizeListeners = [];
  }
}
