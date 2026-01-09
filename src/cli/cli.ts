#!/usr/bin/env node

/**
 * CLI entry point для Workflow Orchestrator
 */

import { runCLI } from './index.js';

// Запуск CLI с аргументами командной строки
runCLI(process.argv).catch((error) => {
  console.error('Критическая ошибка:', error);
  process.exit(1);
});
