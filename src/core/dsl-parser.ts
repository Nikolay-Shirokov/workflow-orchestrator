/**
 * Парсер для DSL рабочих процессов
 * Преобразует токены в AST (Abstract Syntax Tree)
 */

import { Token, TokenType, DSLLexer } from './dsl-lexer.js';

/**
 * Узлы AST
 */
export interface ASTNode {
  type: string;
  line: number;
  column: number;
}

export interface WorkflowNode extends ASTNode {
  type: 'Workflow';
  name: string;
  version: string;
  settings: SettingNode[];
  roles: RoleNode[];
  steps: StepNode[];
}

export interface SettingNode extends ASTNode {
  type: 'Setting';
  key: string;
  value: string | number;
}

export interface RoleNode extends ASTNode {
  type: 'Role';
  name: string;
  properties: PropertyNode[];
}

export interface PropertyNode extends ASTNode {
  type: 'Property';
  key: string;
  value: string | number;
}

export interface StepNode extends ASTNode {
  type: 'Step';
  id: string;
  isParallel: boolean;
  properties: PropertyNode[];
  nestedSteps?: StepNode[];
}

export interface ParserError {
  message: string;
  line: number;
  column: number;
}

/**
 * Парсер DSL
 */
export class DSLParser {
  private tokens: Token[];
  private current: number = 0;
  private errors: ParserError[] = [];
  
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }
  
  /**
   * Парсит токены в AST
   */
  parse(): { ast: WorkflowNode | null; errors: ParserError[] } {
    try {
      const ast = this.parseWorkflow();
      return { ast, errors: this.errors };
    } catch (error) {
      if (error instanceof Error) {
        this.errors.push({
          message: error.message,
          line: this.peek().line,
          column: this.peek().column,
        });
      }
      return { ast: null, errors: this.errors };
    }
  }
  
  /**
   * Парсит workflow
   */
  private parseWorkflow(): WorkflowNode {
    const startToken = this.consume(TokenType.WORKFLOW, 'Ожидается "workflow"');
    const name = this.consume(TokenType.IDENTIFIER, 'Ожидается имя workflow').value;
    const version = this.consume(TokenType.VERSION, 'Ожидается версия (например, v1.0)').value;
    
    this.consume(TokenType.LBRACE, 'Ожидается "{"');
    
    const settings: SettingNode[] = [];
    const roles: RoleNode[] = [];
    const steps: StepNode[] = [];
    
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.DESCRIPTION) || this.check(TokenType.ARTIFACTS_DIR)) {
        settings.push(this.parseSetting());
      } else if (this.check(TokenType.ROLE)) {
        roles.push(this.parseRole());
      } else if (this.check(TokenType.STEP) || this.check(TokenType.PARALLEL)) {
        steps.push(this.parseStep());
      } else {
        this.error(`Неожиданный токен: ${this.peek().value}`);
        this.advance();
      }
    }
    
    this.consume(TokenType.RBRACE, 'Ожидается "}"');
    
    return {
      type: 'Workflow',
      name,
      version,
      settings,
      roles,
      steps,
      line: startToken.line,
      column: startToken.column,
    };
  }
  
  /**
   * Парсит настройку (setting)
   */
  private parseSetting(): SettingNode {
    const keyToken = this.advance();
    const key = keyToken.value;
    
    let value: string | number;
    
    if (this.check(TokenType.STRING) || this.check(TokenType.MULTILINE_STRING)) {
      value = this.advance().value;
    } else if (this.check(TokenType.NUMBER)) {
      value = parseFloat(this.advance().value);
    } else {
      this.error('Ожидается строка или число');
      value = '';
    }
    
    return {
      type: 'Setting',
      key,
      value,
      line: keyToken.line,
      column: keyToken.column,
    };
  }
  
  /**
   * Парсит роль
   */
  private parseRole(): RoleNode {
    const startToken = this.consume(TokenType.ROLE, 'Ожидается "role"');
    const name = this.consume(TokenType.IDENTIFIER, 'Ожидается имя роли').value;
    
    this.consume(TokenType.LBRACE, 'Ожидается "{"');
    
    const properties: PropertyNode[] = [];
    
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      properties.push(this.parseProperty());
    }
    
    this.consume(TokenType.RBRACE, 'Ожидается "}"');
    
    return {
      type: 'Role',
      name,
      properties,
      line: startToken.line,
      column: startToken.column,
    };
  }
  
  /**
   * Парсит свойство
   */
  private parseProperty(): PropertyNode {
    const keyToken = this.advance();
    const key = keyToken.value;
    
    let value: string | number;
    
    if (this.check(TokenType.STRING) || this.check(TokenType.MULTILINE_STRING)) {
      value = this.advance().value;
    } else if (this.check(TokenType.NUMBER)) {
      value = parseFloat(this.advance().value);
    } else if (this.check(TokenType.IDENTIFIER)) {
      value = this.advance().value;
    } else if (this.check(TokenType.ADAPTER) || this.check(TokenType.MODEL) || 
               this.check(TokenType.DEFINITION) || this.check(TokenType.TYPE)) {
      // Обработка ключевых слов как значений
      value = this.advance().value;
    } else {
      this.error('Ожидается значение свойства');
      value = '';
    }
    
    return {
      type: 'Property',
      key,
      value,
      line: keyToken.line,
      column: keyToken.column,
    };
  }
  
  /**
   * Парсит шаг
   */
  private parseStep(): StepNode {
    const isParallel = this.match(TokenType.PARALLEL);
    const startToken = this.consume(TokenType.STEP, 'Ожидается "step"');
    const id = this.consume(TokenType.IDENTIFIER, 'Ожидается ID шага').value;
    
    this.consume(TokenType.LBRACE, 'Ожидается "{"');
    
    const properties: PropertyNode[] = [];
    const nestedSteps: StepNode[] = [];
    
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.STEP)) {
        // Вложенный шаг (для parallel)
        nestedSteps.push(this.parseStep());
      } else {
        properties.push(this.parseStepProperty());
      }
    }
    
    this.consume(TokenType.RBRACE, 'Ожидается "}"');
    
    return {
      type: 'Step',
      id,
      isParallel,
      properties,
      nestedSteps: nestedSteps.length > 0 ? nestedSteps : undefined,
      line: startToken.line,
      column: startToken.column,
    };
  }
  
  /**
   * Парсит свойство шага
   */
  private parseStepProperty(): PropertyNode {
    const keyToken = this.advance();
    const key = keyToken.value;
    
    let value: string | number;
    
    // Обработка специальных случаев
    if (key === 'prompt' && this.match(TokenType.FROM)) {
      // prompt from "file.txt"
      value = `from:${this.consume(TokenType.STRING, 'Ожидается путь к файлу').value}`;
    } else if (key === 'input' || key === 'depends_on') {
      // input var1, var2, var3
      const values: string[] = [];
      do {
        if (this.check(TokenType.IDENTIFIER)) {
          values.push(this.advance().value);
        }
      } while (this.match(TokenType.COMMA));
      value = values.join(',');
    } else if (key === 'output') {
      // output var = "value"
      const varName = this.consume(TokenType.IDENTIFIER, 'Ожидается имя переменной').value;
      this.consume(TokenType.EQUALS, 'Ожидается "="');
      const varValue = this.consume(TokenType.STRING, 'Ожидается значение').value;
      value = `${varName}=${varValue}`;
    } else if (this.check(TokenType.STRING) || this.check(TokenType.MULTILINE_STRING)) {
      value = this.advance().value;
    } else if (this.check(TokenType.NUMBER)) {
      value = parseFloat(this.advance().value);
    } else if (this.check(TokenType.IDENTIFIER)) {
      value = this.advance().value;
    } else if (this.check(TokenType.TYPE) || this.check(TokenType.ROLE) || 
               this.check(TokenType.ADAPTER) || this.check(TokenType.MODEL) ||
               this.check(TokenType.SCRIPT) || this.check(TokenType.CONDITION)) {
      // Обработка ключевых слов как значений
      value = this.advance().value;
    } else {
      this.error('Ожидается значение свойства');
      value = '';
    }
    
    return {
      type: 'Property',
      key,
      value,
      line: keyToken.line,
      column: keyToken.column,
    };
  }
  
  /**
   * Проверяет, соответствует ли текущий токен типу
   */
  private check(type: TokenType): boolean {
    if (this.isAtEnd()) {
      return false;
    }
    return this.peek().type === type;
  }
  
  /**
   * Проверяет и потребляет токен, если он соответствует типу
   */
  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }
  
  /**
   * Потребляет токен указанного типа или выдает ошибку
   */
  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }
    
    this.error(message);
    throw new Error(message);
  }
  
  /**
   * Возвращает текущий токен и продвигается вперед
   */
  private advance(): Token {
    if (!this.isAtEnd()) {
      this.current++;
    }
    return this.previous();
  }
  
  /**
   * Возвращает текущий токен без продвижения
   */
  private peek(): Token {
    return this.tokens[this.current];
  }
  
  /**
   * Возвращает предыдущий токен
   */
  private previous(): Token {
    return this.tokens[this.current - 1];
  }
  
  /**
   * Проверяет, достигнут ли конец токенов
   */
  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }
  
  /**
   * Добавляет ошибку
   */
  private error(message: string): void {
    const token = this.peek();
    this.errors.push({
      message,
      line: token.line,
      column: token.column,
    });
  }
}

/**
 * Парсит DSL текст в AST
 */
export function parseDSL(input: string): {
  ast: WorkflowNode | null;
  errors: Array<{ message: string; line: number; column: number }>;
} {
  // Лексический анализ
  const lexer = new DSLLexer(input);
  const { tokens, errors: lexerErrors } = lexer.tokenize();
  
  if (lexerErrors.length > 0) {
    return { ast: null, errors: lexerErrors };
  }
  
  // Синтаксический анализ
  const parser = new DSLParser(tokens);
  const { ast, errors: parserErrors } = parser.parse();
  
  return { ast, errors: parserErrors };
}
