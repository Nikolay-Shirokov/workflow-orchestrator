/**
 * ResumeSelector - компонент для выбора шага при возобновлении процесса
 * 
 * Предоставляет интерактивный интерфейс для:
 * - Отображения списка шагов с их статусами
 * - Автоматического позиционирования на первом незавершенном шаге
 * - Навигации и выбора шага для возобновления
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.4
 */

import { TerminalRenderer, TerminalColor } from './terminal-renderer.js';
import { InteractiveMenu, MenuOption } from './interactive-menu.js';

/**
 * Информация о шаге для возобновления
 */
export interface ResumeStepInfo {
  /** Номер шага */
  number: number;
  
  /** ID шага */
  id: string;
  
  /** Название шага */
  name: string;
  
  /** Завершен ли шаг */
  completed: boolean;
  
  /** Есть ли артефакты */
  hasArtifacts: boolean;
  
  /** Список артефактов (опционально) */
  artifacts?: string[];
}

/**
 * ResumeSelector - класс для выбора шага при возобновлении
 */
export class ResumeSelector {
  private renderer: TerminalRenderer;

  constructor(renderer?: TerminalRenderer) {
    this.renderer = renderer || new TerminalRenderer();
  }

  /**
   * Выбор шага для возобновления
   * 
   * Requirements 14.1: Отображение интерактивного списка шагов
   * Requirements 14.3: Автоматическое позиционирование на первом незавершенном шаге
   * Requirements 14.4: Навигация и выбор шага
   * 
   * @param steps - Список шагов
   * @param defaultIndex - Индекс шага по умолчанию (если не указан, выбирается первый незавершенный)
   * @returns Promise с номером выбранного шага
   */
  public async selectStep(
    steps: ResumeStepInfo[],
    defaultIndex?: number
  ): Promise<number> {
    if (steps.length === 0) {
      throw new Error('No steps available for resume');
    }

    // Определяем индекс по умолчанию (Requirements 14.3)
    // Если не указан, выбираем первый незавершенный шаг
    let selectedIndex = defaultIndex;
    if (selectedIndex === undefined) {
      selectedIndex = this.findFirstIncompleteStep(steps);
    }

    // Валидация индекса
    if (selectedIndex < 0 || selectedIndex >= steps.length) {
      selectedIndex = 0;
    }

    // Отображаем заголовок
    this.renderer.writeLine();
    this.renderer.writeLine('═'.repeat(60));
    this.renderer.writeLine(
      this.renderer.bold(
        this.renderer.colorize('Resume Workflow', TerminalColor.Cyan)
      )
    );
    this.renderer.writeLine('═'.repeat(60));
    this.renderer.writeLine();
    this.renderer.writeLine('Select step to resume from:');
    this.renderer.writeLine();

    // Создаем опции меню из шагов
    const menuOptions = this.createMenuOptions(steps, selectedIndex);

    // Отображаем интерактивное меню
    const menu = new InteractiveMenu(this.renderer);
    const selectedValue = await menu.show(menuOptions, {
      defaultIndex: selectedIndex
    });

    // Очищаем экран после выбора, чтобы не оставлять артефакты
    // Это важно, т.к. InteractiveDisplay использует альтернативный буфер
    // и при выходе из него возвращается к этому экрану
    this.renderer.clearScreen();
    this.renderer.moveCursor(1, 1);

    // Парсим выбранное значение (номер шага)
    const stepNumber = parseInt(selectedValue, 10);

    if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > steps.length) {
      throw new Error('Invalid step selection');
    }

    return stepNumber;
  }

  /**
   * Поиск первого незавершенного шага
   * Property 16: Позиционирование при возобновлении
   * Requirements 14.3: Автоматическое позиционирование
   * 
   * @param steps - Список шагов
   * @returns Индекс первого незавершенного шага (или 0, если все завершены)
   */
  private findFirstIncompleteStep(steps: ResumeStepInfo[]): number {
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].completed) {
        return i;
      }
    }
    // Если все шаги завершены, возвращаем последний
    return steps.length - 1;
  }

  /**
   * Создание опций меню из списка шагов
   * Requirements 14.2: Отображение номера, названия, статуса, наличия артефактов
   * 
   * @param steps - Список шагов
   * @param defaultIndex - Индекс шага по умолчанию
   * @returns Массив опций меню
   */
  private createMenuOptions(
    steps: ResumeStepInfo[],
    defaultIndex: number
  ): MenuOption[] {
    return steps.map((step, index) => {
      // Иконка статуса (Requirements 14.2)
      const icon = step.completed ? '✓' : '○';
      const iconColor = step.completed ? TerminalColor.Green : TerminalColor.Gray;
      const coloredIcon = this.renderer.colorize(icon, iconColor);

      // Формируем label
      let label = `${coloredIcon} ${step.number}. ${step.name}`;

      // Добавляем информацию о статусе (Requirements 14.2)
      const statusText = step.completed ? 'completed' : 'not completed';
      label += ` ${this.renderer.dim(`(${statusText})`)}`;

      // Добавляем информацию об артефактах (Requirements 14.2)
      if (step.hasArtifacts && step.artifacts && step.artifacts.length > 0) {
        label += ` ${this.renderer.dim(`[${step.artifacts.length} artifact(s)]`)}`;
      }

      // Отмечаем шаг по умолчанию
      if (index === defaultIndex) {
        label += ` ${this.renderer.colorize('← DEFAULT', TerminalColor.Cyan)}`;
      }

      return {
        label,
        value: step.number.toString(),
        description: step.hasArtifacts && step.artifacts 
          ? `Artifacts: ${step.artifacts.slice(0, 2).join(', ')}${step.artifacts.length > 2 ? '...' : ''}`
          : undefined
      };
    });
  }

  /**
   * Отображение информации о выбранном шаге
   * 
   * @param step - Информация о шаге
   */
  public showStepInfo(step: ResumeStepInfo): void {
    this.renderer.writeLine();
    this.renderer.writeLine('─'.repeat(60));
    this.renderer.writeLine(
      this.renderer.bold(`Selected Step: ${step.name}`)
    );
    this.renderer.writeLine(`  Number: ${step.number}`);
    this.renderer.writeLine(`  ID: ${step.id}`);
    this.renderer.writeLine(`  Status: ${step.completed ? 'Completed' : 'Not completed'}`);
    
    if (step.hasArtifacts && step.artifacts && step.artifacts.length > 0) {
      this.renderer.writeLine(`  Artifacts: ${step.artifacts.length}`);
      for (const artifact of step.artifacts.slice(0, 3)) {
        this.renderer.writeLine(`    - ${artifact}`);
      }
      if (step.artifacts.length > 3) {
        this.renderer.writeLine(`    ... and ${step.artifacts.length - 3} more`);
      }
    } else {
      this.renderer.writeLine('  Artifacts: None');
    }
    
    this.renderer.writeLine('─'.repeat(60));
    this.renderer.writeLine();
  }

  /**
   * Получение renderer (для тестирования)
   */
  public getRenderer(): TerminalRenderer {
    return this.renderer;
  }
}
