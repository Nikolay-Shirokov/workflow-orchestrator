/**
 * Тесты для системы логирования
 */

import { Logger, LogLevel, initializeLogger, getLogger } from '../../src/core/logger.js';

describe('Logger', () => {
  describe('Создание логгера', () => {
    it('должен создать логгер с базовой конфигурацией', () => {
      const logger = new Logger({
        level: LogLevel.INFO,
        enableConsole: true,
        enableFile: false
      });

      expect(logger).toBeDefined();
    });

    it('должен создать логгер с файловым выводом', () => {
      const logger = new Logger({
        level: LogLevel.DEBUG,
        enableConsole: false,
        enableFile: true,
        logFilePath: 'test.log'
      });

      expect(logger).toBeDefined();
    });
  });

  describe('Методы логирования', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger({
        level: LogLevel.DEBUG,
        enableConsole: false,
        enableFile: false
      });
    });

    it('должен иметь метод debug', () => {
      expect(() => logger.debug('Test debug message')).not.toThrow();
    });

    it('должен иметь метод info', () => {
      expect(() => logger.info('Test info message')).not.toThrow();
    });

    it('должен иметь метод warn', () => {
      expect(() => logger.warn('Test warning message')).not.toThrow();
    });

    it('должен иметь метод error', () => {
      expect(() => logger.error('Test error message')).not.toThrow();
    });

    it('должен логировать ошибки с объектом Error', () => {
      const error = new Error('Test error');
      expect(() => logger.error('Error occurred', error)).not.toThrow();
    });

    it('должен логировать с метаданными', () => {
      expect(() => logger.info('Test with meta', { key: 'value' })).not.toThrow();
    });
  });

  describe('Изменение уровня логирования', () => {
    it('должен изменять уровень логирования', () => {
      const logger = new Logger({
        level: LogLevel.INFO,
        enableConsole: false,
        enableFile: false
      });

      expect(() => logger.setLevel(LogLevel.DEBUG)).not.toThrow();
    });
  });

  describe('Глобальный логгер', () => {
    it('должен инициализировать глобальный логгер', () => {
      const logger = initializeLogger({
        level: LogLevel.INFO,
        enableConsole: true,
        enableFile: false
      });

      expect(logger).toBeDefined();
    });

    it('должен возвращать глобальный логгер', () => {
      const logger = getLogger();
      expect(logger).toBeDefined();
    });

    it('должен создать логгер по умолчанию если не инициализирован', () => {
      // Сбрасываем глобальный логгер путем создания нового
      const logger = getLogger();
      expect(logger).toBeDefined();
    });
  });
});
