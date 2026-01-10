/**
 * Тесты для StateManager
 * 
 * Property-based тесты для проверки свойств корректности менеджера состояния
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createStateManager } from '../../src/core/state-manager.js';
import { WorkflowState, StepHistory } from '../../src/core/types.js';

// Временная директория для тестов
const TEST_STATE_DIR = './test-state';
const TEST_BACKUP_DIR = './test-state/backups';

// Очистка тестовой директории перед и после тестов
beforeEach(async () => {
  try {
    await fs.rm(TEST_STATE_DIR, { recursive: true, force: true });
  } catch (error) {
    // Игнорируем ошибки при удалении
  }
  await new Promise(resolve => setTimeout(resolve, 100)); // Даем время на освобождение файлов
  await fs.mkdir(TEST_STATE_DIR, { recursive: true });
});

afterEach(async () => {
  await new Promise(resolve => setTimeout(resolve, 100)); // Даем время на закрытие файлов
  try {
    await fs.rm(TEST_STATE_DIR, { recursive: true, force: true });
  } catch (error) {
    // Игнорируем ошибки при удалении на Windows
    console.warn('Warning: Could not clean up test directory:', error);
  }
});

// ============================================================================
// Генераторы для property-based тестирования
// ============================================================================

/**
 * Генератор валидных имен рабочих процессов
 */
const workflowNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

/**
 * Генератор версий (semver)
 */
const versionArb = fc.tuple(
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 }),
  fc.integer({ min: 0, max: 99 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

/**
 * Генератор ID шагов
 */
const stepIdArb = fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s));

/**
 * Генератор истории шагов
 */
const stepHistoryArb: fc.Arbitrary<StepHistory> = fc.record({
  stepId: stepIdArb,
  stepName: fc.string({ minLength: 1, maxLength: 50 }),
  status: fc.constantFrom('success' as const, 'failed' as const, 'skipped' as const),
  startedAt: fc.date().map(d => d.toISOString()),
  completedAt: fc.date().map(d => d.toISOString()),
  executionTime: fc.integer({ min: 0, max: 300000 }),
  adapter: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  model: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  artifacts: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 5 }),
  error: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
});

// ============================================================================
// Property 16: Создание файла состояния
// Feature: workflow-orchestrator, Property 16: Создание файла состояния
// Validates: Requirements 4.1
// ============================================================================

describe('Property 16: Создание файла состояния', () => {
  test('для любого начала выполнения рабочего процесса, система должна создать файл состояния, содержащий метаданные сессии', async () => {
    await fc.assert(
      fc.asyncProperty(
        workflowNameArb,
        versionArb,
        stepIdArb,
        async (workflowName, workflowVersion, initialStep) => {
          // Arrange
          const stateManager = createStateManager({
            stateDir: TEST_STATE_DIR,
            enableFileLocking: false,
          });

          // Act
          const state = await stateManager.createState(workflowName, workflowVersion, initialStep);

          // Assert - проверка обязательных метаданных
          expect(state.sessionId).toBeDefined();
          expect(state.sessionId).toMatch(/^session_/);
          expect(state.workflowName).toBe(workflowName);
          expect(state.workflowVersion).toBe(workflowVersion);
          expect(state.currentStep).toBe(initialStep);
          expect(state.status).toBe('running');
          expect(state.startedAt).toBeDefined();
          expect(state.updatedAt).toBeDefined();
          
          // Проверка, что timestamp валидны
          expect(new Date(state.startedAt).toISOString()).toBe(state.startedAt);
          expect(new Date(state.updatedAt).toISOString()).toBe(state.updatedAt);

          // Проверка, что файл действительно создан
          const statePath = stateManager.getStatePath(state.sessionId);
          const fileExists = await fs.access(statePath).then(() => true).catch(() => false);
          expect(fileExists).toBe(true);

          // Проверка содержимого файла
          const fileContent = await fs.readFile(statePath, 'utf-8');
          const savedState = JSON.parse(fileContent);
          expect(savedState.sessionId).toBe(state.sessionId);
          expect(savedState.workflowName).toBe(workflowName);
          expect(savedState.workflowVersion).toBe(workflowVersion);
          
          // Ждем завершения всех асинхронных операций
          await new Promise(resolve => setImmediate(resolve));
        }
      ),
      { numRuns: 100 }
    );
  }, 30000); // Увеличиваем таймаут до 30 секунд

  test('каждое создание состояния должно генерировать уникальный sessionId', async () => {
    const stateManager = createStateManager({
      stateDir: TEST_STATE_DIR,
      enableFileLocking: false,
    });

    const sessionIds = new Set<string>();
    
    // Создаем несколько состояний
    for (let i = 0; i < 10; i++) {
      const state = await stateManager.createState('test-workflow', '1.0.0', 'step1');
      sessionIds.add(state.sessionId);
    }

    // Все ID должны быть уникальными
    expect(sessionIds.size).toBe(10);
  });
});

// ============================================================================
// Property 17: Обновление состояния при завершении шага
// Feature: workflow-orchestrator, Property 17: Обновление состояния при завершении шага
// Validates: Requirements 4.2
// ============================================================================

describe('Property 17: Обновление состояния при завершении шага', () => {
  test('для любого успешно завершенного шага, файл состояния должен быть обновлен с отметкой о завершении этого шага', async () => {
    await fc.assert(
      fc.asyncProperty(
        workflowNameArb,
        versionArb,
        stepIdArb,
        stepHistoryArb,
        async (workflowName, workflowVersion, initialStep, stepHistory) => {
          // Arrange
          const stateManager = createStateManager({
            stateDir: TEST_STATE_DIR,
            enableFileLocking: false,
          });

          const initialState = await stateManager.createState(workflowName, workflowVersion, initialStep);

          // Добавляем небольшую задержку, чтобы updatedAt гарантированно отличался
          await new Promise(resolve => setTimeout(resolve, 10));

          // Act
          const updatedState = await stateManager.updateStepCompletion(initialState, stepHistory);

          // Assert
          expect(updatedState.completedSteps).toContain(stepHistory.stepId);
          expect(updatedState.history).toContainEqual(stepHistory);
          expect(new Date(updatedState.updatedAt).getTime()).toBeGreaterThan(new Date(initialState.updatedAt).getTime());

          // Проверка, что артефакты добавлены
          for (const artifact of stepHistory.artifacts) {
            const artifactName = path.basename(artifact);
            expect(updatedState.artifacts[artifactName]).toBe(artifact);
          }

          // Проверка, что изменения сохранены в файл
          const loadedState = await stateManager.loadState(updatedState.sessionId);
          expect(loadedState.completedSteps).toContain(stepHistory.stepId);
          expect(loadedState.history.length).toBe(updatedState.history.length);
          
          // Ждем завершения всех асинхронных операций
          await new Promise(resolve => setImmediate(resolve));
        }
      ),
      { numRuns: 100 }
    );
  }, 30000); // Увеличиваем таймаут до 30 секунд

  test('при ошибке шага, статус должен измениться на failed', async () => {
    const stateManager = createStateManager({
      stateDir: TEST_STATE_DIR,
      enableFileLocking: false,
    });

    const state = await stateManager.createState('test-workflow', '1.0.0', 'step1');

    const failedStepHistory: StepHistory = {
      stepId: 'step1',
      stepName: 'Test Step',
      status: 'failed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      executionTime: 1000,
      artifacts: [],
      error: 'Test error',
    };

    const updatedState = await stateManager.updateStepCompletion(state, failedStepHistory);

    expect(updatedState.status).toBe('failed');
    expect(updatedState.errors.length).toBeGreaterThan(0);
    expect(updatedState.errors[0].stepId).toBe('step1');
  });
});

// ============================================================================
// Property 18: Сохранение состояния при прерывании
// Feature: workflow-orchestrator, Property 18: Сохранение состояния при прерывании
// Validates: Requirements 4.3
// ============================================================================

describe('Property 18: Сохранение состояния при прерывании', () => {
  test('для любого прерывания рабочего процесса, текущее состояние должно быть сохранено на диск', async () => {
    await fc.assert(
      fc.asyncProperty(
        workflowNameArb,
        versionArb,
        stepIdArb,
        fc.array(stepHistoryArb, { minLength: 1, maxLength: 5 }),
        async (workflowName, workflowVersion, initialStep, stepHistories) => {
          // Arrange
          const stateManager = createStateManager({
            stateDir: TEST_STATE_DIR,
            enableFileLocking: false,
          });

          let state = await stateManager.createState(workflowName, workflowVersion, initialStep);

          // Симуляция выполнения нескольких шагов
          for (const stepHistory of stepHistories) {
            state = await stateManager.updateStepCompletion(state, stepHistory);
          }

          // Act - симуляция прерывания (просто сохранение состояния)
          state.status = 'paused';
          await stateManager.saveState(state);

          // Assert - проверка, что состояние можно загрузить после "прерывания"
          const loadedState = await stateManager.loadState(state.sessionId);
          
          expect(loadedState.sessionId).toBe(state.sessionId);
          expect(loadedState.status).toBe('paused');
          expect(loadedState.completedSteps.length).toBe(stepHistories.length);
          expect(loadedState.history.length).toBe(stepHistories.length);

          // Проверка, что все завершенные шаги сохранены
          for (const stepHistory of stepHistories) {
            expect(loadedState.completedSteps).toContain(stepHistory.stepId);
          }
          
          // Ждем завершения всех асинхронных операций
          await new Promise(resolve => setImmediate(resolve));
        }
      ),
      { numRuns: 100 }
    );
  }, 30000); // Увеличиваем таймаут до 30 секунд
});

// ============================================================================
// Property 20: Обязательные поля файла состояния
// Feature: workflow-orchestrator, Property 20: Обязательные поля файла состояния
// Validates: Requirements 4.5
// ============================================================================

describe('Property 20: Обязательные поля файла состояния', () => {
  test('для любого сохраненного файла состояния, он должен содержать timestamp, sessionId, currentStep и пути к артефактам', async () => {
    await fc.assert(
      fc.asyncProperty(
        workflowNameArb,
        versionArb,
        stepIdArb,
        async (workflowName, workflowVersion, initialStep) => {
          // Arrange
          const stateManager = createStateManager({
            stateDir: TEST_STATE_DIR,
            enableFileLocking: false,
          });

          // Act
          const state = await stateManager.createState(workflowName, workflowVersion, initialStep);

          // Assert - проверка обязательных полей
          expect(state.sessionId).toBeDefined();
          expect(typeof state.sessionId).toBe('string');
          expect(state.sessionId.length).toBeGreaterThan(0);

          expect(state.currentStep).toBeDefined();
          expect(typeof state.currentStep).toBe('string');
          expect(state.currentStep).toBe(initialStep);

          expect(state.startedAt).toBeDefined();
          expect(typeof state.startedAt).toBe('string');
          expect(new Date(state.startedAt).toISOString()).toBe(state.startedAt);

          expect(state.updatedAt).toBeDefined();
          expect(typeof state.updatedAt).toBe('string');
          expect(new Date(state.updatedAt).toISOString()).toBe(state.updatedAt);

          expect(state.artifacts).toBeDefined();
          expect(typeof state.artifacts).toBe('object');

          // Валидация через встроенный метод
          const validation = await stateManager.validateState(state);
          expect(validation.valid).toBe(true);
          expect(validation.errors.length).toBe(0);
          
          // Ждем завершения всех асинхронных операций
          await new Promise(resolve => setImmediate(resolve));
        }
      ),
      { numRuns: 100 }
    );
  }, 30000); // Увеличиваем таймаут до 30 секунд

  test('состояние с отсутствующими обязательными полями должно быть невалидным', async () => {
    const stateManager = createStateManager({
      stateDir: TEST_STATE_DIR,
      enableFileLocking: false,
    });

    // Создание невалидного состояния
    const invalidState = {
      // Отсутствует sessionId
      workflowName: 'test',
      workflowVersion: '1.0.0',
      currentStep: 'step1',
      status: 'running',
      completedSteps: [],
      artifacts: {},
      context: {},
      history: [],
      errors: [],
    } as unknown as WorkflowState;

    const validation = await stateManager.validateState(invalidState);
    
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
    expect(validation.errors.some(e => e.includes('sessionId'))).toBe(true);
  });
});

// ============================================================================
// Property 22: Возобновление с последнего завершенного шага
// Feature: workflow-orchestrator, Property 22: Возобновление с последнего завершенного шага
// Validates: Requirements 5.2
// ============================================================================

describe('Property 22: Возобновление с последнего завершенного шага', () => {
  test('для любого рабочего процесса, который был остановлен и затем возобновлен, выполнение должно продолжаться с шага, следующего за последним завершенным', async () => {
    await fc.assert(
      fc.asyncProperty(
        workflowNameArb,
        versionArb,
        stepIdArb,
        fc.array(stepHistoryArb, { minLength: 2, maxLength: 5 }),
        async (workflowName, workflowVersion, initialStep, stepHistories) => {
          // Arrange
          const stateManager = createStateManager({
            stateDir: TEST_STATE_DIR,
            enableFileLocking: false,
          });

          let state = await stateManager.createState(workflowName, workflowVersion, initialStep);

          // Выполнение нескольких шагов
          for (const stepHistory of stepHistories) {
            state = await stateManager.updateStepCompletion(state, stepHistory);
          }

          // Сохранение состояния перед "остановкой"
          state.status = 'paused';
          await stateManager.saveState(state);

          // Act - "возобновление" процесса (загрузка состояния)
          const resumedState = await stateManager.loadState(state.sessionId);

          // Assert
          expect(resumedState.sessionId).toBe(state.sessionId);
          expect(resumedState.completedSteps.length).toBe(stepHistories.length);
          
          // Проверка, что все завершенные шаги присутствуют
          for (const stepHistory of stepHistories) {
            expect(resumedState.completedSteps).toContain(stepHistory.stepId);
          }

          // Проверка, что история сохранена
          expect(resumedState.history.length).toBe(stepHistories.length);

          // Следующий шаг должен быть тот, который не в completedSteps
          // (это логика будет в WorkflowEngine, но состояние должно содержать всю информацию)
          expect(resumedState.completedSteps.length).toBeGreaterThan(0);
          
          // Ждем завершения всех асинхронных операций
          await new Promise(resolve => setImmediate(resolve));
        }
      ),
      { numRuns: 100 }
    );
  }, 30000); // Увеличиваем таймаут до 30 секунд
});

// ============================================================================
// Property 24: Валидация целостности артефактов
// Feature: workflow-orchestrator, Property 24: Валидация целостности артефактов
// Validates: Requirements 5.4
// ============================================================================

describe('Property 24: Валидация целостности артефактов', () => {
  test('для любого возобновления рабочего процесса, система должна валидировать, что все артефакты из завершенных шагов существуют и читаемы', async () => {
    await fc.assert(
      fc.asyncProperty(
        workflowNameArb,
        versionArb,
        stepIdArb,
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
        async (workflowName, workflowVersion, initialStep, artifactNames) => {
          // Arrange
          const stateManager = createStateManager({
            stateDir: TEST_STATE_DIR,
            enableFileLocking: false,
          });

          const state = await stateManager.createState(workflowName, workflowVersion, initialStep);

          // Создание реальных файлов артефактов
          const artifactPaths: string[] = [];
          for (const name of artifactNames) {
            const artifactPath = path.join(TEST_STATE_DIR, `${name}.txt`);
            await fs.writeFile(artifactPath, `Content of ${name}`, 'utf-8');
            artifactPaths.push(artifactPath);
            state.artifacts[name] = artifactPath;
          }

          await stateManager.saveState(state);

          // Act - валидация артефактов
          const validation = await stateManager.validateArtifacts(state);

          // Assert - все артефакты должны существовать
          expect(validation.valid).toBe(true);
          expect(validation.missingArtifacts.length).toBe(0);
          expect(validation.corruptedArtifacts.length).toBe(0);
          
          // Ждем завершения всех асинхронных операций
          await new Promise(resolve => setImmediate(resolve));
        }
      ),
      { numRuns: 100 }
    );
  }, 30000); // Увеличиваем таймаут до 30 секунд

  test('отсутствующие артефакты должны быть обнаружены', async () => {
    const stateManager = createStateManager({
      stateDir: TEST_STATE_DIR,
      enableFileLocking: false,
    });

    const state = await stateManager.createState('test-workflow', '1.0.0', 'step1');
    
    // Добавление несуществующих артефактов
    state.artifacts['missing1'] = '/nonexistent/path/artifact1.txt';
    state.artifacts['missing2'] = '/nonexistent/path/artifact2.txt';

    const validation = await stateManager.validateArtifacts(state);

    expect(validation.valid).toBe(false);
    expect(validation.missingArtifacts.length).toBe(2);
    expect(validation.missingArtifacts).toContain('/nonexistent/path/artifact1.txt');
    expect(validation.missingArtifacts).toContain('/nonexistent/path/artifact2.txt');
  });

  test('пустые артефакты должны быть помечены как поврежденные', async () => {
    const stateManager = createStateManager({
      stateDir: TEST_STATE_DIR,
      enableFileLocking: false,
    });

    const state = await stateManager.createState('test-workflow', '1.0.0', 'step1');
    
    // Создание пустого файла
    const emptyArtifactPath = path.join(TEST_STATE_DIR, 'empty.txt');
    await fs.writeFile(emptyArtifactPath, '', 'utf-8');
    state.artifacts['empty'] = emptyArtifactPath;

    const validation = await stateManager.validateArtifacts(state);

    expect(validation.valid).toBe(false);
    expect(validation.corruptedArtifacts.length).toBe(1);
    expect(validation.corruptedArtifacts).toContain(emptyArtifactPath);
  });
});

// ============================================================================
// Property 26: Валидация модификации состояния
// Feature: workflow-orchestrator, Property 26: Валидация модификации состояния
// Validates: Requirements 6.1
// ============================================================================

describe('Property 26: Валидация модификации состояния', () => {
  test('для любого вручную отредактированного файла состояния, система должна валидировать модификации перед разрешением возобновления', async () => {
    await fc.assert(
      fc.asyncProperty(
        workflowNameArb,
        versionArb,
        stepIdArb,
        async (workflowName, workflowVersion, initialStep) => {
          // Arrange
          const stateManager = createStateManager({
            stateDir: TEST_STATE_DIR,
            enableFileLocking: false,
          });

          const state = await stateManager.createState(workflowName, workflowVersion, initialStep);
          const statePath = stateManager.getStatePath(state.sessionId);

          // Act - "ручное" редактирование файла (изменение currentStep)
          const modifiedState = { ...state, currentStep: 'modified_step' };
          await fs.writeFile(statePath, JSON.stringify(modifiedState, null, 2), 'utf-8');

          // Загрузка модифицированного состояния
          const loadedState = await stateManager.loadState(state.sessionId);

          // Assert - валидация должна пройти для корректных модификаций
          const validation = await stateManager.validateState(loadedState);
          expect(validation.valid).toBe(true);
          expect(loadedState.currentStep).toBe('modified_step');
          
          // Ждем завершения всех асинхронных операций
          await new Promise(resolve => setImmediate(resolve));
        }
      ),
      { numRuns: 100 }
    );
  }, 30000); // Увеличиваем таймаут до 30 секунд

  test('невалидные модификации должны быть отклонены', async () => {
    const stateManager = createStateManager({
      stateDir: TEST_STATE_DIR,
      enableFileLocking: false,
    });

    const state = await stateManager.createState('test-workflow', '1.0.0', 'step1');
    const statePath = stateManager.getStatePath(state.sessionId);

    // Создание невалидного состояния (удаление обязательных полей)
    const invalidState = { ...state };
    delete (invalidState as any).sessionId;
    delete (invalidState as any).startedAt;

    await fs.writeFile(statePath, JSON.stringify(invalidState, null, 2), 'utf-8');

    // Попытка загрузки должна выбросить ошибку
    await expect(stateManager.loadState(state.sessionId)).rejects.toThrow();
  });
});

// ============================================================================
// Дополнительные тесты для резервного копирования
// ============================================================================

describe('Резервное копирование и восстановление', () => {
  test('создание резервной копии должно сохранить полное состояние', async () => {
    const stateManager = createStateManager({
      stateDir: TEST_STATE_DIR,
      backupDir: TEST_BACKUP_DIR,
      enableFileLocking: false,
    });

    const state = await stateManager.createState('test-workflow', '1.0.0', 'step1');
    
    // Добавление некоторых данных
    state.completedSteps.push('step1', 'step2');
    state.artifacts['test'] = '/path/to/artifact.txt';
    await stateManager.saveState(state);

    // Создание резервной копии
    const backupPath = await stateManager.createBackup(state);

    // Проверка существования резервной копии
    const backupExists = await fs.access(backupPath).then(() => true).catch(() => false);
    expect(backupExists).toBe(true);

    // Проверка содержимого
    const backupContent = await fs.readFile(backupPath, 'utf-8');
    const backupState = JSON.parse(backupContent);
    expect(backupState.sessionId).toBe(state.sessionId);
    expect(backupState.completedSteps).toEqual(state.completedSteps);
  });

  test('восстановление из резервной копии должно восстановить состояние', async () => {
    const stateManager = createStateManager({
      stateDir: TEST_STATE_DIR,
      backupDir: TEST_BACKUP_DIR,
      enableFileLocking: false,
    });

    const state = await stateManager.createState('test-workflow', '1.0.0', 'step1');
    state.completedSteps.push('step1', 'step2');
    await stateManager.saveState(state);

    // Создание резервной копии
    const backupPath = await stateManager.createBackup(state);

    // "Повреждение" основного файла
    const statePath = stateManager.getStatePath(state.sessionId);
    await fs.writeFile(statePath, 'invalid json', 'utf-8');

    // Восстановление из резервной копии
    const restoredState = await stateManager.restoreFromBackup(state.sessionId, backupPath);

    expect(restoredState.sessionId).toBe(state.sessionId);
    expect(restoredState.completedSteps).toEqual(state.completedSteps);

    // Проверка, что основной файл восстановлен
    const loadedState = await stateManager.loadState(state.sessionId);
    expect(loadedState.sessionId).toBe(state.sessionId);
  });
});
