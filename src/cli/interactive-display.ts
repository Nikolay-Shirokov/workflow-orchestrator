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
  DisplayStepStatus,
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
  private signalHandlers?: {
    sigint: NodeJS.SignalsListener;
    sigterm: NodeJS.SignalsListener;
  };
  private lastRenderedLines: string[] = [];

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
    const roles = workflowConfig.roles ?? {};
    const steps = workflowConfig.steps.map(step => {
      const roleConfig = step.role ? roles[step.role] : undefined;

      return {
        id: step.id,
        name: step.name,
        type: step.type,
        role: step.role,
        adapter: step.adapter ?? roleConfig?.adapter,
        model: step.model ?? roleConfig?.model
      };
    });

    this.state = DisplayStateUtils.createInitialState(
      workflowConfig.name,
      workflowConfig.version || '1.0',
      '', // artifactsDir будет установлен позже
      steps
    );

    this.isInitialized = true;

    // Очищаем основной буфер перед входом в альтернативный
    // Это важно при возобновлении, чтобы не оставались артефакты от ResumeSelector
    this.renderer.clearScreen();
    this.renderer.moveCursor(1, 1);

    // Входим в альтернативный буфер
    this.renderer.enterAlternateBuffer();

    // Скрываем курсор для чистого отображения
    this.renderer.hideCursor();

    // Очищаем экран и позиционируем курсор
    this.renderer.clearScreen();
    this.renderer.moveCursor(1, 1);

    // Подписываемся на изменение размера терминала
    this.renderer.onResize(() => {
      this.lastRenderedLines = []; // Сброс кеша при resize
      this.render();
    });

    // Начальная отрисовка
    this.render();

    // Запускаем интервал обновления
    if (this.config.interactive?.refreshInterval) {
      this.renderInterval = setInterval(() => {
        this.render();
      }, this.config.interactive.refreshInterval);
    }

    // Устанавливаем обработчики сигналов
    this.setupSignalHandlers();
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

    const size = this.renderer.getSize();

    const sections: DisplaySection[] = [
      this.createHeaderSection(),
      this.createArtifactsSection(),
      this.createStepsSection(),
      this.createCurrentStepSection(),
      this.createRecentActivitySection(),
      this.createProgressSection()
    ];

    const lines: string[] = [];
    const separator = this.renderer.dim('-'.repeat(Math.min(size.width - 2, 60)));
    let firstSection = true;

    for (const section of sections) {
      if (lines.length >= size.height) {
        break;
      }

      if (!firstSection) {
        lines.push(separator);
      }
      firstSection = false;

      for (const line of section.content) {
        if (lines.length >= size.height) {
          break;
        }
        lines.push(line);
      }
    }

    // Дифференциальная перерисовка
    this.renderDiff(lines);
    this.lastRenderedLines = lines;
  }

  /**
   * Умная перерисовка - только изменившиеся строки
   */
  private renderDiff(newLines: string[]): void {
    const oldLines = this.lastRenderedLines;

    // Полная перерисовка при первом вызове или изменении размера
    if (oldLines.length === 0 || oldLines.length !== newLines.length) {
      this.renderFull(newLines);
      return;
    }

    // Построчное обновление
    for (let i = 0; i < newLines.length; i++) {
      if (newLines[i] !== oldLines[i]) {
        this.renderer.moveCursor(1, i + 1);
        this.renderer.clearLine();
        this.renderer.write(newLines[i]);
      }
    }
  }

  /**
   * Полная перерисовка экрана
   */
  private renderFull(lines: string[]): void {
    this.renderer.clearScreen();
    this.renderer.moveCursor(1, 1);

    const lastIndex = lines.length - 1;
    lines.forEach((line, index) => {
      if (index === lastIndex) {
        this.renderer.write(line);
      } else {
        this.renderer.writeLine(line);
      }
    });
  }

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
   * Property 12: Отображение параллельных шагов
   * Requirements 4.1: Отображение названия, ID, типа, роли, адаптера, модели, времени
   * Requirements 9.1, 9.2, 9.3: Отображение параллельных шагов с индикатором
   */
  private createCurrentStepSection(): DisplaySection {
    // Проверка наличия параллельных шагов (Requirements 9.1)
    if (this.state?.parallelSteps && this.state.parallelSteps.length > 0) {
      const content: string[] = [
        `${this.renderer.colorize('⚡', TerminalColor.Yellow)} Parallel Execution:` // Индикатор параллельного выполнения (Requirements 9.3)
      ];

      // Отображение всех параллельных шагов (Requirements 9.1)
      for (const parallelStep of this.state.parallelSteps) {
        const icon = this.renderer.getStatusIcon(parallelStep.status as DisplayStepStatus);
        const color = this.renderer.getStatusColor(parallelStep.status as DisplayStepStatus);
        const coloredIcon = this.renderer.colorize(icon, color);
        
        content.push(`  ${coloredIcon} ${parallelStep.stepName} ${this.renderer.dim(`[${parallelStep.stepId}]`)}`);
      }

      return {
        title: 'Current Step',
        content
      };
    }

    // Обычное отображение текущего шага
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
  public onWorkflowStart(config: WorkflowConfig): void {
    if (!this.isInitialized) {
      this.initialize(config);
    }
  }

  /**
   * Синхронизация с загруженным состоянием (для resume)
   * Обновляет статусы шагов на основе completedSteps и history
   */
  public syncWithState(workflowState: WorkflowState): void {
    if (!this.state) {
      return;
    }

    // Обновляем статусы шагов на основе completedSteps
    const completedStepIds = new Set(workflowState.completedSteps);

    // Создаем карту истории для получения информации о выполненных шагах
    const historyMap = new Map(
      workflowState.history.map(h => [h.stepId, h])
    );

    // Обновляем каждый шаг
    const updatedSteps = this.state.steps.map(step => {
      const history = historyMap.get(step.id);

      if (completedStepIds.has(step.id) && history) {
        // Шаг выполнен - обновляем статус и информацию
        return {
          ...step,
          status: history.status as DisplayStepStatus,
          duration: history.executionTime,
          artifacts: history.artifacts,
          error: history.error
        };
      }

      return step;
    });

    // Подсчитываем количество завершенных шагов
    const completedCount = updatedSteps.filter(s => s.status === 'completed').length;

    // Обновляем состояние
    this.state = {
      ...this.state,
      steps: updatedSteps,
      completedSteps: completedCount
    };

    this.render();
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

    try {
      // Останавливаем обновления
      this.pauseRendering();

      // Последняя отрисовка в альтернативном буфере
      this.render();

      // Показываем курсор, но НЕ выходим из альтернативного буфера
      // Выход произойдет позже в finalize() после обработки открытия файла
      this.renderer.showCursor();

    } catch (error) {
      // Даже при ошибке восстанавливаем терминал
      try {
        this.renderer.showCursor();
        this.renderer.exitAlternateBuffer();
      } catch {}
      this.isInitialized = false;
      return;
    }

    // Безопасный вывод итоговой информации
    try {
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
      } else if (state.status === 'paused') {
        this.renderer.writeLine(
          this.renderer.colorize('⏸ Workflow paused', TerminalColor.Yellow)
        );
      }

      const totalTime = DisplayStateUtils.formatExecutionTime(Date.now() - this.state.startTime);
      this.renderer.writeLine(`Total time: ${totalTime}`);
      this.renderer.writeLine(`Completed steps: ${state.completedSteps.length}/${this.state.totalSteps}`);

      if (state.status === 'paused') {
        this.renderer.writeLine(`Current step: ${state.currentStep}`);
      }

      this.renderer.writeLine(`Artifacts: ${Object.keys(state.artifacts).length}`);

      if (state.errors.length > 0) {
        this.renderer.writeLine(`Errors: ${state.errors.length}`);
      }

      this.renderer.writeLine(`Session: ${state.sessionId}`);

      if (state.status === 'paused') {
        this.renderer.writeLine('');
        this.renderer.writeLine('→ To resume:');
        this.renderer.writeLine(`  resume ${state.sessionId} <config-file>`);
      }

      this.renderer.writeLine('═'.repeat(60));

      // Для паузы НЕ добавляем пустую строку в конце - выйдем из буфера сразу
      if (state.status !== 'paused') {
        this.renderer.writeLine('');
      }
    } catch (error) {
      // Логируем, но не прерываем
      console.error('Error outputting final information:', error);
    }

    // НЕ сбрасываем isInitialized, чтобы finalize() мог быть вызван
  }

  /**
   * Финализация интерактивного режима - выход из альтернативного буфера
   * Должен вызываться после onWorkflowComplete() и всех интерактивных действий
   */
  public finalize(): void {
    if (!this.isInitialized) {
      return;
    }

    try {
      this.renderer.exitAlternateBuffer();

      // После выхода из альтернативного буфера добавляем несколько переводов строк
      // чтобы гарантировать, что последующий вывод будет виден
      process.stdout.write('\n\n');
    } catch (error) {
      // Последняя попытка выйти из буфера
      try {
        this.renderer.exitAlternateBuffer();
        process.stdout.write('\n\n');
      } catch {}
    }

    this.isInitialized = false;
  }

  /**
   * Обработчик требования ввода пользователя
   * Requirements 10.1, 10.2, 10.3: Отображение сообщения, пауза обновления, возобновление
   * 
   * @param step - Шаг, требующий ввода
   * @param message - Сообщение для пользователя
   */
  public onUserInputRequired(step: WorkflowStep, message: string): void {
    if (!this.state) {
      return;
    }

    this.pauseRendering();

    this.renderer.writeLine('');
    this.renderer.writeLine('─'.repeat(60));
    this.renderer.writeLine(
      this.renderer.colorize('⏸ Требуется ввод пользователя', TerminalColor.Yellow)
    );
    this.renderer.writeLine(`  Шаг: ${this.renderer.bold(step.name)}`);
    this.renderer.writeLine(`  ${message}`);
    this.renderer.writeLine('─'.repeat(60));
    this.renderer.writeLine('');
  }

  /**
   * Возобновление обновления интерфейса после ввода пользователя
   * Requirements 10.3: Возобновление после ввода
   */
  public resumeRendering(): void {
    // Возобновляем обновление интерфейса
    if (!this.renderInterval && this.config.interactive?.refreshInterval) {
      this.renderInterval = setInterval(() => {
        this.render();
      }, this.config.interactive.refreshInterval);
    }

    // Перерисовываем интерфейс
    this.render();
  }

  /**
   * Приостановка обновления интерфейса
   * Requirements 10.2: Пауза обновления
   */
  public pauseRendering(): void {
    // Останавливаем интервал обновления
    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
    }
  }

  /**
   * Отображение интерактивного меню для выбора опций
   * Requirements 10.1.4: Интеграция InteractiveMenu
   * 
   * @param options - Список опций меню
   * @param config - Конфигурация меню
   * @returns Promise с выбранным значением
   */
  public async showMenu(
    options: MenuOption[],
    config?: { title?: string; defaultIndex?: number }
  ): Promise<string> {
    // Приостанавливаем обновление интерфейса
    this.pauseRendering();

    // Показываем курсор для интерактивного меню
    this.renderer.showCursor();

    // Добавляем перевод строки для отделения меню от основного интерфейса
    this.renderer.writeLine('');

    // Создаем и отображаем меню
    const { InteractiveMenu } = await import('./interactive-menu.js');
    const menu = new InteractiveMenu(this.renderer);
    
    try {
      const result = await menu.show(options, config);
      return result;
    } finally {
      // Скрываем курсор после выбора
      this.renderer.hideCursor();
      
      // Возобновляем обновление интерфейса
      this.resumeRendering();
    }
  }

  /**
   * Обработчик начала параллельного выполнения
   * Requirements 9.1: Отображение параллельных шагов
   */
  public onParallelStart(steps: WorkflowStep[]): void {
    if (!this.state) {
      return;
    }

    // Создаем информацию о параллельных шагах
    const parallelSteps = steps.map(step => ({
      stepId: step.id,
      stepName: step.name,
      status: 'running'
    }));

    // Обновляем состояние
    this.state = {
      ...this.state,
      parallelSteps
    };

    this.render();
  }

  /**
   * Обработчик завершения параллельного выполнения
   * Requirements 9.1: Обновление статусов параллельных шагов
   */
  public onParallelComplete(results: Array<{ stepId: string; status: string }>): void {
    if (!this.state) {
      return;
    }

    // Обновляем статусы параллельных шагов
    if (this.state.parallelSteps) {
      this.state.parallelSteps = this.state.parallelSteps.map(parallelStep => {
        const result = results.find(r => r.stepId === parallelStep.stepId);
        if (result) {
          return {
            ...parallelStep,
            status: result.status
          };
        }
        return parallelStep;
      });
    }

    this.render();

    // Очищаем параллельные шаги после небольшой задержки
    setTimeout(() => {
      if (this.state) {
        this.state.parallelSteps = undefined;
        this.render();
      }
    }, 1000);
  }

  /**
   * Очистка ресурсов
   */
  public cleanup(): void {
    try {
      // Удаляем обработчики сигналов
      if (this.signalHandlers) {
        process.off('SIGINT', this.signalHandlers.sigint);
        process.off('SIGTERM', this.signalHandlers.sigterm);
        this.signalHandlers = undefined;
      }

      // Останавливаем интервал обновления, если он был запущен
      if (this.renderInterval) {
        clearInterval(this.renderInterval);
        this.renderInterval = null;
      }
    } catch {}

    // КРИТИЧНО: Восстановление терминала должно выполниться
    try {
      this.renderer.showCursor();
      this.renderer.exitAlternateBuffer();
    } catch (error) {
      // Последняя попытка хотя бы показать курсор
      try {
        this.renderer.showCursor();
      } catch {}
    }

    try {
      this.renderer.dispose();
    } catch {}

    this.isInitialized = false;
    this.state = null;
    this.lastRenderedLines = [];
  }

  /**
   * Установка обработчиков сигналов для корректного завершения
   */
  private setupSignalHandlers(): void {
    // Увеличиваем лимит слушателей для тестов (0 = неограниченно)
    const currentMaxListeners = process.getMaxListeners();
    if (currentMaxListeners !== 0) {
      process.setMaxListeners(0);
    }

    const sigintHandler: NodeJS.SignalsListener = () => {
      this.handleInterruption();
    };

    const sigtermHandler: NodeJS.SignalsListener = () => {
      this.handleInterruption();
    };

    process.on('SIGINT', sigintHandler);
    process.on('SIGTERM', sigtermHandler);

    this.signalHandlers = {
      sigint: sigintHandler,
      sigterm: sigtermHandler
    };
  }

  /**
   * Обработка прерывания процесса
   */
  private handleInterruption(): void {
    try {
      this.cleanup();
    } finally {
      process.exit(130); // 128 + SIGINT(2)
    }
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
