/**
 * Главный модуль DSL
 * Предоставляет единый интерфейс для работы с DSL
 */

import { parseDSL } from './dsl-parser.js';
import { translateDSL, generateYAML, generateJSON } from './dsl-translator.js';
import { WorkflowConfig } from './types.js';

export interface DSLResult {
  success: boolean;
  config?: WorkflowConfig;
  yaml?: string;
  json?: string;
  errors: Array<{
    message: string;
    line: number;
    column: number;
  }>;
}

/**
 * Компилирует DSL текст в WorkflowConfig
 */
export async function compileDSL(input: string): Promise<DSLResult> {
  // Парсинг DSL в AST
  const { ast, errors: parseErrors } = parseDSL(input);
  
  if (parseErrors.length > 0 || !ast) {
    return {
      success: false,
      errors: parseErrors,
    };
  }
  
  // Трансляция AST в WorkflowConfig
  const { config, errors: translateErrors } = translateDSL(ast);
  
  if (translateErrors.length > 0 || !config) {
    return {
      success: false,
      errors: translateErrors,
    };
  }
  
  // Генерация YAML и JSON
  try {
    const yaml = await generateYAML(config);
    const json = generateJSON(config);
    
    return {
      success: true,
      config,
      yaml,
      json,
      errors: [],
    };
  } catch (error) {
    return {
      success: false,
      errors: [
        {
          message: error instanceof Error ? error.message : 'Ошибка генерации YAML/JSON',
          line: 0,
          column: 0,
        },
      ],
    };
  }
}

/**
 * Валидирует DSL текст без компиляции
 */
export function validateDSL(input: string): {
  valid: boolean;
  errors: Array<{
    message: string;
    line: number;
    column: number;
  }>;
} {
  const { ast, errors: parseErrors } = parseDSL(input);
  
  if (parseErrors.length > 0 || !ast) {
    return {
      valid: false,
      errors: parseErrors,
    };
  }
  
  const { errors: translateErrors } = translateDSL(ast);
  
  return {
    valid: translateErrors.length === 0,
    errors: translateErrors,
  };
}

// Экспорт всех компонентов
export { parseDSL } from './dsl-parser.js';
export { translateDSL, generateYAML, generateJSON } from './dsl-translator.js';
export { DSLLexer, TokenType } from './dsl-lexer.js';
export { DSLParser } from './dsl-parser.js';
export { DSLTranslator } from './dsl-translator.js';
