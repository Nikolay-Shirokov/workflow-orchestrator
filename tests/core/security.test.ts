/**
 * Тесты для модуля безопасности
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { SecurityManager, SecurityConfig } from '../../src/core/security.js';
import { Logger } from '../../src/core/types.js';

describe('SecurityManager', () => {
  let securityManager: SecurityManager;
  let testDir: string;
  let mockLogger: Logger;

  beforeEach(async () => {
    // Создаем временную директорию для тестов
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'security-test-'));
    
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const config: SecurityConfig = {
      baseDir: testDir,
      allowedDirs: [testDir],
      maxInputLength: 1000,
      enableAuditLog: true,
      auditLogPath: path.join(testDir, 'audit.log'),
      logger: mockLogger,
    };

    securityManager = new SecurityManager(config);
    await securityManager.initialize();
  });

  afterEach(async () => {
    await securityManager.close();
    // Очистка временной директории
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Санитизация входов', () => {
    it('должна удалять опасные символы из ввода', () => {
      const input = 'test; rm -rf /';
      const result = securityManager.sanitizeInput(input);
      
      expect(result.modified).toBe(true);
      expect(result.sanitized).not.toContain(';');
      expect(result.removedPatterns.length).toBeGreaterThan(0);
    });

    it('должна обрезать слишком длинный ввод', () => {
      const input = 'a'.repeat(2000);
      const result = securityManager.sanitizeInput(input);
      
      expect(result.modified).toBe(true);
      expect(result.sanitized.length).toBe(1000);
      expect(result.removedPatterns).toContain('excessive_length');
    });

    it('должна удалять попытки обхода директорий', () => {
      const input = '../../../etc/passwd';
      const result = securityManager.sanitizeInput(input);
      
      expect(result.modified).toBe(true);
      expect(result.sanitized).not.toContain('..');
    });

    it('должна санитизировать вложенные объекты', () => {
      const inputs = {
        name: 'test',
        command: 'ls; rm -rf /',
        nested: {
          value: '../../../etc/passwd',
        },
      };
      
      const sanitized = securityManager.sanitizeInputs(inputs);
      
      expect(typeof sanitized.command).toBe('string');
      expect(sanitized.command as string).not.toContain(';');
      expect(typeof (sanitized.nested as Record<string, unknown>).value).toBe('string');
      expect((sanitized.nested as Record<string, unknown>).value as string).not.toContain('..');
    });

    it('не должна изменять безопасный ввод', () => {
      const input = 'safe input without dangerous characters';
      const result = securityManager.sanitizeInput(input);
      
      expect(result.modified).toBe(false);
      expect(result.sanitized).toBe(input);
      expect(result.removedPatterns.length).toBe(0);
    });
  });

  describe('Валидация путей', () => {
    it('должна разрешать валидные пути внутри baseDir', () => {
      const filePath = path.join(testDir, 'test.txt');
      const result = securityManager.validatePath(filePath);
      
      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toBeDefined();
    });

    it('должна запрещать пути с попытками обхода директорий', () => {
      // Используем относительный путь с .. который будет обнаружен при нормализации
      const filePath = testDir + '/../../../etc/passwd';
      const result = securityManager.validatePath(filePath);
      
      expect(result.valid).toBe(false);
      // Может быть либо PATH_TRAVERSAL_ATTEMPT, либо PATH_OUTSIDE_ALLOWED_DIRS
      expect(['PATH_TRAVERSAL_ATTEMPT', 'PATH_OUTSIDE_ALLOWED_DIRS']).toContain(result.errorCode);
    });

    it('должна запрещать пути вне разрешенных директорий', () => {
      const filePath = '/etc/passwd';
      const result = securityManager.validatePath(filePath);
      
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('PATH_OUTSIDE_ALLOWED_DIRS');
    });

    it('должна безопасно разрешать относительные пути', () => {
      const relativePath = 'subdir/file.txt';
      const resolved = securityManager.resolveSafePath(relativePath);
      
      expect(resolved).toBe(path.join(testDir, relativePath));
      expect(resolved.startsWith(testDir)).toBe(true);
    });

    it('должна выбрасывать ошибку при попытке обхода через resolveSafePath', () => {
      const relativePath = '../../../etc/passwd';
      
      expect(() => {
        securityManager.resolveSafePath(relativePath);
      }).toThrow();
    });
  });

  describe('Управление переменными окружения', () => {
    it('должна валидировать безопасные переменные окружения', () => {
      const envVars = {
        API_KEY: 'test-key',
        NODE_ENV: 'test',
      };
      
      const validated = securityManager.validateEnvVars(envVars);
      
      expect(Object.keys(validated).length).toBe(2);
      expect(validated.API_KEY).toBe('test-key');
    });

    it('должна отфильтровывать запрещенные переменные окружения', () => {
      const envVars = {
        API_KEY: 'test-key',
        LD_PRELOAD: '/malicious/lib.so',
      };
      
      const validated = securityManager.validateEnvVars(envVars);
      
      expect(Object.keys(validated).length).toBe(1);
      expect(validated.LD_PRELOAD).toBeUndefined();
      expect(validated.API_KEY).toBe('test-key');
    });

    it('должна санитизировать значения переменных окружения', () => {
      const envVars = {
        PATH: '/usr/bin; rm -rf /',
      };
      
      const validated = securityManager.validateEnvVars(envVars);
      
      expect(validated.PATH).not.toContain(';');
    });

    it('должна безопасно получать переменную окружения', () => {
      process.env.TEST_VAR = 'test-value';
      
      const value = securityManager.getEnvVar('TEST_VAR');
      
      expect(value).toBe('test-value');
      
      delete process.env.TEST_VAR;
    });

    it('должна возвращать значение по умолчанию для несуществующей переменной', () => {
      const value = securityManager.getEnvVar('NON_EXISTENT_VAR', 'default');
      
      expect(value).toBe('default');
    });

    it('должна запрещать доступ к запрещенным переменным окружения', () => {
      process.env.LD_PRELOAD = '/malicious/lib.so';
      
      const value = securityManager.getEnvVar('LD_PRELOAD', 'default');
      
      expect(value).toBe('default');
      
      delete process.env.LD_PRELOAD;
    });
  });

  describe('Управление правами доступа', () => {
    it('должна устанавливать права доступа к файлу', async () => {
      const filePath = path.join(testDir, 'test.txt');
      await fs.writeFile(filePath, 'test content');
      
      await securityManager.setFilePermissions(filePath, 0o600);
      
      const stats = await fs.stat(filePath);
      // Проверяем, что права были установлены (на Windows это может не работать)
      if (process.platform !== 'win32') {
        expect(stats.mode & 0o777).toBe(0o600);
      }
    });

    it('должна устанавливать права доступа к директории', async () => {
      const dirPath = path.join(testDir, 'testdir');
      await fs.mkdir(dirPath);
      
      await securityManager.setDirectoryPermissions(dirPath, 0o700);
      
      const stats = await fs.stat(dirPath);
      // Проверяем, что права были установлены (на Windows это может не работать)
      if (process.platform !== 'win32') {
        expect(stats.mode & 0o777).toBe(0o700);
      }
    });

    it('должна выбрасывать ошибку при попытке установить права для невалидного пути', async () => {
      const filePath = '/etc/passwd';
      
      await expect(
        securityManager.setFilePermissions(filePath, 0o600)
      ).rejects.toThrow();
    });
  });

  describe('Аудит логирование', () => {
    it('должна создавать файл аудит лога', async () => {
      const auditLogPath = path.join(testDir, 'audit.log');
      const exists = await fs.access(auditLogPath).then(() => true).catch(() => false);
      
      expect(exists).toBe(true);
    });

    it('должна записывать события в аудит лог', async () => {
      // Выполняем операцию, которая должна быть залогирована
      securityManager.sanitizeInput('test; rm -rf /');
      
      // Даем время на запись в файл
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const auditLogPath = path.join(testDir, 'audit.log');
      const content = await fs.readFile(auditLogPath, 'utf-8');
      
      expect(content).toContain('input_sanitized');
    });

    it('должна логировать нарушения безопасности', async () => {
      // Попытка доступа к запрещенному пути
      securityManager.validatePath('/etc/passwd');
      
      // Даем время на запись в файл
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const auditLogPath = path.join(testDir, 'audit.log');
      const content = await fs.readFile(auditLogPath, 'utf-8');
      
      expect(content).toContain('security_violation');
    });
  });

  describe('Интеграционные тесты', () => {
    it('должна обрабатывать полный цикл безопасной работы с файлом', async () => {
      // Санитизация имени файла
      const unsafeName = '../../../test; rm -rf /.txt';
      securityManager.sanitizeInput(unsafeName);
      
      // Создание безопасного пути
      const safePath = securityManager.resolveSafePath('test.txt');
      
      // Валидация пути
      const validation = securityManager.validatePath(safePath, 'write');
      expect(validation.valid).toBe(true);
      
      // Создание файла
      await fs.writeFile(safePath, 'test content');
      
      // Установка прав доступа
      await securityManager.setFilePermissions(safePath, 0o600);
      
      // Проверка, что файл существует и доступен
      const content = await fs.readFile(safePath, 'utf-8');
      expect(content).toBe('test content');
    });

    it('должна предотвращать цепочку атак', async () => {
      // Попытка использовать несколько векторов атаки
      const maliciousInput = '../../../etc/passwd; rm -rf /';
      
      // Санитизация
      const sanitized = securityManager.sanitizeInput(maliciousInput);
      expect(sanitized.modified).toBe(true);
      
      // Попытка создать путь из санитизированного ввода
      expect(() => {
        securityManager.resolveSafePath(sanitized.sanitized);
      }).not.toThrow();
      
      // Валидация результирующего пути
      const safePath = path.join(testDir, 'safe.txt');
      const validation = securityManager.validatePath(safePath);
      expect(validation.valid).toBe(true);
    });
  });
});
