/**
 * InteractiveDisplay - интерактивное отображение прогресса выполнения
 * 
 * Предоставляет структурированное отображение с обновлением на месте:
 * - Заголовок с названием процесса
 * - Список всех шагов с их статусами
 * - Детальная информация о текущем шаге
 * - История последних действий
 * - Общий прогресс выполнения
 * 
 * Requirements: 2.1, 2.2
 */

import { WorkflowConfig, WorkflowState, WorkflowStep, StepHistory } from '../core/types.js';
import { TerminalRenderer, TerminalColor } from './terminal-renderer.js';
import {
  DisplayState,
  DisplayConfig,
  DisplaySection,
  DisplayStateUtils,
  IProgressDisplay
} from './display-types.js';

/**
 * Опции меню для интерактивного выбора
 */
export interface MenuOption {
  label: string;
  value: string;
  description?: string;
}

/**
 * InteractiveDisplay - класс для интерактивного отображения
 * Реализует интерфейс IProgressDisplay для совместимости с оркестратором
 */
export class InteractiveDisplay implements IProgressDisplay {
  private renderer: TerminalRenderer;
  private config: DisplayConfig;
  private state: DisplayState | null = null;
  private isInitialized: boolean = false;
  private renderInterval: NodeJS.Timeout | null = null;

  constructor(renderer?: TerminalRenderer, config?: DisplayConfig) {
    this.renderer = renderer || new TerminalRenderer();
    this.config = config || DisplayStateUtils.createDefaultConfig('interactive');
  }

  /**
   * Инициализация отображения
   * 
   * @param workflowConfig - Конфигурация рабочего процесса
   */
  public initialize(workflowConfig: WorkflowConfig): void {
    // Проверка возможностей терминала
    const capabilities = this.renderer.getCapabilities();
    
    // Если терминал не поддерживает ANSI или слишком узкий, выбрасываем ошибку
    if (!capabilities.supportsAnsi || !capabilities.isInteractive) {
      throw new Error('Terminal does not support interactive mode. Use --log-mode instead.');
    }

    const terminalWidth = capabilities.width;
    const minWidth = this.config.terminal?.minWidth || 60;
    
    if (terminalWidth < minWidth) {
      throw new Error(
        `Terminal is too narrow (${terminalWidth} columns). Minimum width is ${minWidth} columns. Use --log-mode instead.`
      );
    }

    // Создание начального состояния
    const steps = workflowConfig.steps.map(step => ({
      id: step.id,
      name: step.name,
      type: step.type,
      role: step.role,
      adapter: step.adapter,
      model: step.model
    }));

    this.state = DisplayStateUtils.createInitialState(
      workflowConfig.name,
      workflowConfig.version || '1.0',
      '', // artifactsDir будет установлен позже
      steps
    );

    this.isInitialized = true;

    // Скрываем курсор для чистого отображения
    this.renderer.hideCursor();

    // Очищаем экран
    this.renderer.clearScreen();

    // Подписываемся на изменение размера терминала
    this.renderer.onResize(() => {
      this.render();
    });

    // Начальная отрисовка
    this.render();
  }

  /**
   * Отрисовка всех секций интерфейса
   * Property 3: Наличие обязательных секций
   * 
   * Отображает все обязательные секции:
   * - Заголовок
   * - Путь к артефактам
   * - Список шагов
   * - Текущий шаг
   * - История
   * - Прогресс
   */
  public render(): void {
    if (!this.isInitialized || !this.state) {
      return;
    }

    // Получаем размер терминала
    const size = this.renderer.getSize();

    // Очищаем экран
    this.renderer.clearScreen();

    // Создаем секции
    const sections: DisplaySection[] = [
      this.createHeaderSection(),
      this.createArtifactsSection(),
      this.createStepsSection(),
      this.createCurrentStepSection(),
      this.createRecentActivitySection(),
      this.createProgressSection()
    ];

    // Отрисовываем секции
    let currentLine = 1;
    for (const section of sections) {
      this.renderSection(section, currentLine, size.width);
      currentLine += section.content.length + 2; // +2 для разделителя и пустой строки
    }
  }

  /**
   * Создание секции заголовка
   */
  private createHeaderSection(): DisplaySection {
    if (!this.state) {
      return { title: '', content: [] };
    }

    const title = `Workflow: ${this.state.workflowName} v${this.state.workflowVersion}`;
    
    return {
      title: 'Header',
      content: [
        this.renderer.bold(this.renderer.colorize(title, TerminalColor.Cyan))
      ],
      color: TerminalColor.Cyan
    };
  }

  /**
   * Создание секции пути к артефактам
   */
  private createArtifactsSection(): DisplaySection {
    if (!this.state) {
      return { title: '', content: [] };
    }

    const artifactsPath = this.state.artifactsDir || 'Not set';
    
    return {
      title: 'Artifacts',
      content: [
        `Artifacts: ${this.renderer.dim(artifactsPath)}`
      ]
    };
  }

  /**
   * Создание секции списка шагов
   * Property 5: Формат отображения списка шагов
   * Requirements 3.1: Формат - номер, иконка статуса, название, ID
   */
  private createStepsSection(): DisplaySection {
    if (!this.state) {
      return { title: '', content: [] };
    }

    const content: string[] = ['Steps:'];

    for (const step of this.state.steps) {
      const icon = this.renderer.getStatusIcon(step.status);
      const color = this.renderer.getStatusColor(step.status);
      const coloredIcon = this.renderer.colorize(icon, color);
      
      // Выделяем текущий шаг
      const isCurrentStep = step.number - 1 === this.state.currentStepIndex;
      
      // Формат: номер, иконка статуса, название, ID (Requirements 3.1)
      let line = ` ${coloredIcon} ${step.number}. ${step.name} ${this.renderer.dim(`[${step.id}]`)}`;
      
      if (step.duration !== undefined) {
        const duration = DisplayStateUtils.formatExecutionTime(step.duration);
        line += ` ${this.renderer.dim(`(${duration})`)}`;
      }
      
      if (isCurrentStep) {
        line = this.renderer.bold(line);
      }
      
      content.push(line);
    }

    return {
      title: 'Steps',
      content
    };
  }

  /**
   * Создание секции текущего шага
   * Property 7: Полнота информации о текущем шаге
   * Requirements 4.1: Отображение названия, ID, типа, роли, адаптера, модели, времени
   */
  private createCurrentStepSection(): DisplaySection {
    if (!this.state || this.state.currentStepIndex < 0) {
      return {
        title: 'Current Step',
        content: ['Current Step: None']
      };
    }

    const currentStep = this.state.steps[this.state.currentStepIndex];
    if (!currentStep) {
      return {
        title: 'Current Step',
        content: ['Current Step: None']
      };
    }

    const content: string[] = [
      `Current Step: ${this.renderer.bold(currentStep.name)}`,
      `  ID: ${currentStep.id}`,
      `  Status: ${this.renderer.formatStatus(currentStep.status)}`
    ];

    // Отображение типа шага (Requirements 4.1)
    if (currentStep.type) {
      content.push(`  Type: ${currentStep.type}`);
    }

    if (currentStep.role) {
      content.push(`  Role: ${currentStep.role}`);
    }

    if (currentStep.adapter) {
      content.push(`  Adapter: ${currentStep.adapter}`);
    }

    if (currentStep.model) {
      content.push(`  Model: ${currentStep.model}`);
    }

    if (currentStep.duration !== undefined) {
      const duration = DisplayStateUtils.formatExecutionTime(currentStep.duration);
      content.push(`  Duration: ${duration}`);
    }

    // Отображение артефактов (Requirements 4.2)
    if (currentStep.artifacts && currentStep.artifacts.length > 0) {
      content.push(`  Artifacts: ${currentStep.artifacts.length}`);
      for (const artifact of currentStep.artifacts.slice(0, 3)) {
        content.push(`    - ${artifact}`);
      }
      if (currentStep.artifacts.length > 3) {
        content.push(`    ... and ${currentStep.artifacts.length - 3} more`);
      }
    }

    // Отображение ошибки (Requirements 4.3)
    if (currentStep.error) {
      content.push(`  Error: ${this.renderer.colorize(currentStep.error, TerminalColor.Red)}`);
    }

    return {
      title: 'Current Step',
      content
    };
  }

  /**
   * Создание секции истории последних действий
   * Property 8: Ограничение размера истории
   */
  private createRecentActivitySection(): DisplaySection {
    if (!this.state || this.state.recentActivity.length === 0) {
      return {
        title: 'Recent Activity',
        content: ['Recent Activity: None']
      };
    }

    const content: string[] = ['Recent Activity:'];

    for (const activity of this.state.recentActivity) {
      const icon = activity.status === 'success' ? '✓' : '✗';
      const color = activity.status === 'success' ? TerminalColor.Green : TerminalColor.Red;
      const coloredIcon = this.renderer.colorize(icon, color);
      const duration = DisplayStateUtils.formatExecutionTime(activity.duration);
      
      let line = ` ${coloredIcon} ${activity.stepName}`;
      
      if (activity.artifacts.length > 0) {
        line += ` → ${activity.artifacts.length} artifact(s)`;
      }
      
      line += ` ${this.renderer.dim(`(${duration})`)}`;
      
      content.push(line);
    }

    return {
      title: 'Recent Activity',
      content
    };
  }

  /**
   * Создание секции прогресса
   * Property 9: Корректность вычисления прогресса
   * Property 10: Формат прогресс-бара
   */
  private createProgressSection(): DisplaySection {
    if (!this.state) {
      return { title: '', content: [] };
    }

    const progress = DisplayStateUtils.calculateProgress(
      this.state.completedSteps,
      this.state.totalSteps
    );

    const progressBar = DisplayStateUtils.createProgressBar(progress, 40);
    const elapsedTime = DisplayStateUtils.formatExecutionTime(Date.now() - this.state.startTime);

    const content: string[] = [
      `Progress: ${progressBar} ${progress.toFixed(1)}% (${this.state.completedSteps}/${this.state.totalSteps})`,
      `Elapsed: ${elapsedTime}`
    ];

    return {
      title: 'Progress',
      content
    };
  }

  /**
   * Отрисовка секции
   */
  private renderSection(section: DisplaySection, _startLine: number, width: number): void {
    // Отрисовываем разделитель
    const separator = '─'.repeat(Math.min(width - 2, 60));
    this.renderer.writeLine(this.renderer.dim(separator));

    // Отрисовываем содержимое секции
    for (const line of section.content) {
      this.renderer.writeLine(line);
    }
  }

  /**
   * Обработчик начала процесса
   */
  public onWorkflowStart(config: WorkflowConfig): void {
    if (!this.isInitialized) {
      this.initialize(config);
    }
  }

  /**
   * Обработчик начала шага
   */
  public onStepStart(_step: WorkflowStep, stepNumber: number): void {
    if (!this.state) {
      return;
    }

    const stepIndex = stepNumber - 1;
    this.state = DisplayStateUtils.updateStateOnStepStart(this.state, stepIndex);
    this.render();
  }

  /**
   * Обработчик завершения шага
   */
  public onStepComplete(step: WorkflowStep, history: StepHistory): void {
    if (!this.state) {
      return;
    }

    const stepIndex = this.state.steps.findIndex(s => s.id === step.id);
    if (stepIndex < 0) {
      return;
    }

    const status = history.status === 'success' ? 'completed' : 
                   history.status === 'failed' ? 'failed' : 'skipped';
    
    const duration = history.executionTime;

    this.state = DisplayStateUtils.updateStateOnStepComplete(
      this.state,
      stepIndex,
      status,
      duration,
      history.artifacts,
      history.error
    );

    this.render();
  }

  /**
   * Обработчик ошибки шага
   */
  public onStepError(step: WorkflowStep, error: Error): void {
    if (!this.state) {
      return;
    }

    const stepIndex = this.state.steps.findIndex(s => s.id === step.id);
    if (stepIndex < 0) {
      return;
    }

    this.state = DisplayStateUtils.updateStateOnStepComplete(
      this.state,
      stepIndex,
      'failed',
      0,
      [],
      error.message
    );

    this.render();
  }

  /**
   * Обработчик завершения процесса
   */
  public onWorkflowComplete(state: WorkflowState): void {
    if (!this.state) {
      return;
    }

    // Финальная отрисовка
    this.render();

    // Показываем курсор
    this.renderer.showCursor();

    // Выводим итоговую информацию
    this.renderer.writeLine('');
    this.renderer.writeLine('═'.repeat(60));
    
    if (state.status === 'completed') {
      this.renderer.writeLine(
        this.renderer.colorize('✓ Workflow completed successfully', TerminalColor.Green)
      );
    } else if (state.status === 'failed') {
      this.renderer.writeLine(
        this.renderer.colorize('✗ Workflow failed', TerminalColor.Red)
      );
    }

    const totalTime = DisplayStateUtils.formatExecutionTime(Date.now() - this.state.startTime);
    this.renderer.writeLine(`Total time: ${totalTime}`);
    this.renderer.writeLine(`Completed steps: ${state.completedSteps.length}/${this.state.totalSteps}`);
    this.renderer.writeLine(`Artifacts: ${Object.keys(state.artifacts).length}`);
    
    if (state.errors.length > 0) {
      this.renderer.writeLine(`Errors: ${state.errors.length}`);
    }

    this.renderer.writeLine(`Session: ${state.sessionId}`);
    this.renderer.writeLine('═'.repeat(60));
  }

  /**
   * Очистка ресурсов
   */
  public cleanup(): void {
    // Останавливаем интервал обновления, если он был запущен
    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
    }

    // Показываем курсор
    this.renderer.showCursor();

    // Очищаем ресурсы renderer
    this.renderer.dispose();

    // Сбрасываем состояние
    this.isInitialized = false;
    this.state = null;
  }

  /**
   * Установка директории артефактов
   */
  public setArtifactsDir(artifactsDir: string): void {
    if (this.state) {
      this.state.artifactsDir = artifactsDir;
      this.render();
    }
  }

  /**
   * Получение текущего состояния
   */
  public getState(): DisplayState | null {
    return this.state;
  }

  /**
   * Проверка инициализации
   */
  public isReady(): boolean {
    return this.isInitialized;
  }
}
