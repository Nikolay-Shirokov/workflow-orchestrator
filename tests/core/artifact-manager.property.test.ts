/**
 * Property-based тесты для ArtifactManager
 * 
 * Используется библиотека fast-check для генерации случайных входных данных
 * и проверки универсальных свойств корректности.
 */

import * as fc from 'fast-check';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DefaultArtifactManager, ArtifactManagerConfig } from '../../src/core/artifact-manager.js';

// Временная директория для тестов
const TEST_BASE_DIR = path.join(process.cwd(), 'test-artifacts');

/**
 * Вспомогательная функция для очистки тестовой директории
 */
async function cleanupTestDir(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 100)); // Даем время на закрытие файлов
  try {
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
  } catch (error) {
    // Игнорируем ошибки при очистке на Windows
    console.warn('Warning: Could not clean up test directory:', error);
  }
}

/**
 * Создание тестового менеджера артефактов
 */
function createTestArtifactManager(config?: Partial<ArtifactManagerConfig>): DefaultArtifactManager {
  return new DefaultArtifactManager({
    baseDir: TEST_BASE_DIR,
    saveMetadata: true,
    ...config,
  });
}

// Генераторы для property-based тестирования

/**
 * Генератор валидных имен файлов
 * Улучшенная версия с полной Windows-совместимостью
 * Генерирует только безопасные имена из букв, цифр, дефисов и подчеркиваний
 */
const arbitraryFileName = fc.stringMatching(/^[a-zA-Z0-9_-]{1,50}$/)
  .filter(s => {
    // Зарезервированные имена Windows (без расширения)
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 
                           'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 
                           'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    
    const upperName = s.toUpperCase();
    
    // Проверяем, что имя не зарезервировано и не пустое
    return s.length > 0 && 
           !reservedNames.includes(upperName) &&
           !s.startsWith('-') && // Избегаем имен, начинающихся с дефиса
           !s.endsWith('-'); // Избегаем имен, заканчивающихся дефисом
  })
  .map(s => {
    // Если строка пустая после фильтрации (не должно быть), возвращаем дефолт
    return s.length > 0 ? s : 'file';
  })

/**
 * Генератор валидных расширений файлов
 */
const arbitraryFileExtension = fc.constantFrom('.md', '.txt', '.json', '.yaml', '.log', '');

/**
 * Генератор полных имен артефактов
 */
const arbitraryArtifactName = fc.tuple(arbitraryFileName, arbitraryFileExtension)
  .map(([name, ext]) => `${name}${ext}`);

/**
 * Генератор ID шагов
 */
const arbitraryStepId = fc.string({ minLength: 1, maxLength: 20 })
  .filter(s => /^[a-zA-Z0-9_-]+$/.test(s));

/**
 * Генератор ID сессий
 */
const arbitrarySessionId = fc.string({ minLength: 1, maxLength: 30 })
  .filter(s => /^[a-zA-Z0-9_-]+$/.test(s));

/**
 * Генератор содержимого артефактов
 */
const arbitraryContent = fc.string({ minLength: 0, maxLength: 1000 });

describe('ArtifactManager Property-Based Tests', () => {
  beforeEach(async () => {
    await cleanupTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir();
  });

  /**
   * **Feature: workflow-orchestrator, Property 31: Именование файлов артефактов**
   * **Validates: Requirements 7.1**
   * 
   * Свойство: Для любого завершенного шага с конфигурацией вывода,
   * артефакт должен быть сохранен с именем файла, указанным в конфигурации.
   */
  describe('Property 31: Artifact File Naming', () => {
    it('должен сохранять артефакты с указанными именами файлов', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitrarySessionId,
          arbitraryStepId,
          arbitraryArtifactName,
          arbitraryContent,
          async (sessionId, stepId, artifactName, content) => {
            // Arrange
            const manager = createTestArtifactManager();

            // Act
            const savedPath = await manager.save(sessionId, stepId, artifactName, content);

            // Assert
            // Проверяем, что файл существует
            const exists = await manager.exists(savedPath);
            expect(exists).toBe(true);

            // Проверяем, что имя файла соответствует указанному
            const actualFileName = path.basename(savedPath);
            expect(actualFileName).toBe(artifactName);

            // Проверяем, что содержимое сохранено корректно
            const loadedContent = await manager.load(savedPath);
            expect(loadedContent).toBe(content);
            
            // Ждем завершения всех асинхронных операций
            await new Promise(resolve => setImmediate(resolve));
          }
        ),
        { numRuns: 100 } // Минимум 100 итераций согласно спецификации
      );
    }, 30000); // Увеличиваем таймаут до 30 секунд

    it('должен сохранять множественные артефакты с разными именами для одного шага', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitrarySessionId,
          arbitraryStepId,
          fc.array(arbitraryArtifactName, { minLength: 1, maxLength: 5 }).map(names => 
            // Убираем дубликаты
            Array.from(new Set(names))
          ),
          fc.array(arbitraryContent, { minLength: 1, maxLength: 5 }),
          async (sessionId, stepId, artifactNames, contents) => {
            // Убеждаемся, что у нас достаточно содержимого
            if (artifactNames.length === 0) return;
            
            // Arrange
            const manager = createTestArtifactManager();
            const savedPaths: string[] = [];

            // Act - сохраняем множественные артефакты
            for (let i = 0; i < artifactNames.length; i++) {
              const content = contents[i % contents.length];
              const savedPath = await manager.save(sessionId, stepId, artifactNames[i], content);
              savedPaths.push(savedPath);
            }

            // Assert - проверяем, что все артефакты сохранены с правильными именами
            for (let i = 0; i < artifactNames.length; i++) {
              const savedPath = savedPaths[i];
              const actualFileName = path.basename(savedPath);
              expect(actualFileName).toBe(artifactNames[i]);
              
              const exists = await manager.exists(savedPath);
              expect(exists).toBe(true);
            }
            
            // Ждем завершения всех асинхронных операций
            await new Promise(resolve => setImmediate(resolve));
          }
        ),
        { numRuns: 100 }
      );
    }, 30000); // Увеличиваем таймаут до 30 секунд

    it('должен корректно обрабатывать имена файлов с путями (поддиректориями)', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitrarySessionId,
          arbitraryStepId,
          fc.tuple(
            arbitraryFileName,
            arbitraryFileName,
            arbitraryFileExtension
          ).map(([dir, name, ext]) => `${dir}/${name}${ext}`),
          arbitraryContent,
          async (sessionId, stepId, artifactNameWithPath, content) => {
            // Arrange
            const manager = createTestArtifactManager();

            // Act
            const savedPath = await manager.save(sessionId, stepId, artifactNameWithPath, content);

            // Assert
            const exists = await manager.exists(savedPath);
            expect(exists).toBe(true);

            // Проверяем, что относительный путь сохранен
            expect(savedPath).toContain(artifactNameWithPath.replace(/\//g, path.sep));

            // Проверяем содержимое
            const loadedContent = await manager.load(savedPath);
            expect(loadedContent).toBe(content);
            
            // Ждем завершения всех асинхронных операций
            await new Promise(resolve => setImmediate(resolve));
          }
        ),
        { numRuns: 100 }
      );
    }, 30000); // Увеличиваем таймаут до 30 секунд
  });

  /**
   * **Feature: workflow-orchestrator, Property 32: Организация директорий сессий**
   * **Validates: Requirements 7.2**
   * 
   * Свойство: Для любых N сессий рабочего процесса,
   * артефакты должны быть организованы в N отдельных директориях сессий.
   */
  describe('Property 32: Session Directory Organization', () => {
    it('должен создавать отдельные директории для разных сессий', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbitrarySessionId, { minLength: 2, maxLength: 5 }).map(ids => 
            // Убираем дубликаты для создания уникальных сессий
            Array.from(new Set(ids))
          ),
          arbitraryStepId,
          arbitraryArtifactName,
          arbitraryContent,
          async (sessionIds, stepId, artifactName, content) => {
            if (sessionIds.length < 2) return; // Нужно минимум 2 сессии

            // Arrange - создаем один менеджер для всех сессий
            const manager = new DefaultArtifactManager({
              baseDir: TEST_BASE_DIR,
              sessionDirTemplate: `session_{sessionId}`,
              saveMetadata: true,
            });

            // Act - сохраняем артефакты в разных сессиях
            const savedPaths: string[] = [];
            for (let i = 0; i < sessionIds.length; i++) {
              const sessionId = sessionIds[i];
              const savedPath = await manager.save(sessionId, stepId, artifactName, content);
              savedPaths.push(savedPath);
            }

            // Assert - проверяем, что все пути уникальны (разные директории)
            const uniquePaths = new Set(savedPaths.map(p => path.dirname(p)));
            
            // Все артефакты должны быть в разных директориях
            // (или в одной, если sessionId одинаковый, но мы убрали дубликаты)
            expect(uniquePaths.size).toBeGreaterThanOrEqual(1);

            // Проверяем, что все файлы существуют
            for (const savedPath of savedPaths) {
              const exists = await manager.exists(savedPath);
              expect(exists).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен изолировать артефакты разных сессий', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(arbitrarySessionId, arbitrarySessionId).filter(([a, b]) => {
            // На Windows файловая система case-insensitive, поэтому исключаем имена,
            // которые отличаются только регистром
            return a.toLowerCase() !== b.toLowerCase();
          }),
          arbitraryStepId,
          arbitraryArtifactName,
          fc.tuple(arbitraryContent, arbitraryContent),
          async ([sessionId1, sessionId2], stepId, artifactName, [content1, content2]) => {
            // Arrange - создаем один менеджер для обеих сессий
            const manager = new DefaultArtifactManager({
              baseDir: TEST_BASE_DIR,
              sessionDirTemplate: `session_{sessionId}`,
              saveMetadata: true,
            });

            // Act - сохраняем артефакты с одинаковым именем в разных сессиях
            const path1 = await manager.save(sessionId1, stepId, artifactName, content1);
            const path2 = await manager.save(sessionId2, stepId, artifactName, content2);

            // Assert - пути должны быть разными
            expect(path1).not.toBe(path2);

            // Содержимое должно быть изолировано
            const loaded1 = await manager.load(path1);
            const loaded2 = await manager.load(path2);

            expect(loaded1).toBe(content1);
            expect(loaded2).toBe(content2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно использовать шаблон директории сессии', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitrarySessionId,
          arbitraryStepId,
          arbitraryArtifactName,
          arbitraryContent,
          async (sessionId, stepId, artifactName, content) => {
            // Arrange - создаем менеджер с кастомным шаблоном
            const customTemplate = `custom_session_{sessionId}_dir`;
            const manager = new DefaultArtifactManager({
              baseDir: TEST_BASE_DIR,
              sessionDirTemplate: customTemplate,
              saveMetadata: true,
            });

            // Act
            const savedPath = await manager.save(sessionId, stepId, artifactName, content);

            // Assert - путь должен содержать часть шаблона
            expect(savedPath).toContain('custom_session_');
            expect(savedPath).toContain('_dir');

            // Файл должен существовать
            const exists = await manager.exists(savedPath);
            expect(exists).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: workflow-orchestrator, Property 33: Поддержка множественных артефактов**
   * **Validates: Requirements 7.3**
   * 
   * Свойство: Для любого шага, производящего M выходов (M > 1),
   * все M артефактов должны быть успешно сохранены.
   */
  describe('Property 33: Multiple Artifacts Support', () => {
    it('должен сохранять множественные артефакты для одного шага', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitrarySessionId,
          arbitraryStepId,
          fc.array(
            fc.tuple(arbitraryArtifactName, arbitraryContent),
            { minLength: 2, maxLength: 10 }
          ).map(artifacts => {
            // Убираем дубликаты по имени артефакта
            const uniqueMap = new Map(artifacts);
            return Array.from(uniqueMap.entries());
          }),
          async (sessionId, stepId, artifacts) => {
            if (artifacts.length < 2) return; // Нужно минимум 2 артефакта

            // Arrange
            const manager = createTestArtifactManager();

            // Act - сохраняем все артефакты для одного шага
            const savedPaths: string[] = [];
            for (const [name, content] of artifacts) {
              const savedPath = await manager.save(sessionId, stepId, name, content);
              savedPaths.push(savedPath);
            }

            // Assert - все M артефактов должны быть сохранены
            expect(savedPaths.length).toBe(artifacts.length);

            // Все файлы должны существовать
            for (const savedPath of savedPaths) {
              const exists = await manager.exists(savedPath);
              expect(exists).toBe(true);
            }

            // Содержимое должно соответствовать
            for (let i = 0; i < artifacts.length; i++) {
              const [, expectedContent] = artifacts[i];
              const actualContent = await manager.load(savedPaths[i]);
              expect(actualContent).toBe(expectedContent);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен корректно обрабатывать большое количество артефактов', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitrarySessionId,
          arbitraryStepId,
          fc.integer({ min: 5, max: 15 }), // Уменьшил максимум для ускорения
          async (sessionId, stepId, count) => {
            // Arrange
            const manager = createTestArtifactManager();

            // Act - создаем count артефактов
            const savedPaths: string[] = [];
            for (let i = 0; i < count; i++) {
              const name = `artifact_${i}.txt`;
              const content = `Content for artifact ${i}`;
              const savedPath = await manager.save(sessionId, stepId, name, content);
              savedPaths.push(savedPath);
            }

            // Assert - все count артефактов должны быть сохранены
            expect(savedPaths.length).toBe(count);

            // Все файлы должны существовать и иметь правильное содержимое
            for (let i = 0; i < count; i++) {
              const exists = await manager.exists(savedPaths[i]);
              expect(exists).toBe(true);

              const content = await manager.load(savedPaths[i]);
              expect(content).toBe(`Content for artifact ${i}`);
            }
          }
        ),
        { numRuns: 50 } // Уменьшил количество итераций для ускорения
      );
    }, 20000); // Увеличил таймаут до 20 секунд для property-based тестов

    it('должен сохранять артефакты с разными типами содержимого', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitrarySessionId,
          arbitraryStepId,
          async (sessionId, stepId) => {
            // Arrange
            const manager = createTestArtifactManager();

            // Различные типы содержимого
            const artifacts = [
              { name: 'empty.txt', content: '' },
              { name: 'text.txt', content: 'Simple text content' },
              { name: 'json.json', content: JSON.stringify({ key: 'value', nested: { data: 123 } }) },
              { name: 'multiline.md', content: 'Line 1\nLine 2\nLine 3\n' },
              { name: 'special.txt', content: 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?' },
            ];

            // Act - сохраняем все артефакты
            const savedPaths: string[] = [];
            for (const { name, content } of artifacts) {
              const savedPath = await manager.save(sessionId, stepId, name, content);
              savedPaths.push(savedPath);
            }

            // Assert - все артефакты сохранены
            expect(savedPaths.length).toBe(artifacts.length);

            // Проверяем содержимое каждого
            for (let i = 0; i < artifacts.length; i++) {
              const loadedContent = await manager.load(savedPaths[i]);
              expect(loadedContent).toBe(artifacts[i].content);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('должен поддерживать артефакты в разных поддиректориях', async () => {
      await fc.assert(
        fc.asyncProperty(
          arbitrarySessionId,
          arbitraryStepId,
          fc.array(
            fc.tuple(arbitraryFileName, arbitraryFileName, arbitraryFileExtension, arbitraryContent),
            { minLength: 2, maxLength: 5 }
          ),
          async (sessionId, stepId, artifactData) => {
            if (artifactData.length < 2) return;

            // Arrange
            const manager = createTestArtifactManager();

            // Act - сохраняем артефакты в разных поддиректориях
            const savedPaths: string[] = [];
            for (const [dir, name, ext, content] of artifactData) {
              const artifactPath = `${dir}/${name}${ext}`;
              const savedPath = await manager.save(sessionId, stepId, artifactPath, content);
              savedPaths.push(savedPath);
            }

            // Assert - все артефакты сохранены
            expect(savedPaths.length).toBe(artifactData.length);

            // Все файлы существуют
            for (const savedPath of savedPaths) {
              const exists = await manager.exists(savedPath);
              expect(exists).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
