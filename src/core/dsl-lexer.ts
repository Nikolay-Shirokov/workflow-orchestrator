/**
 * Лексер для DSL рабочих процессов
 * Токенизирует входной текст DSL в последовательность токенов
 */

export enum TokenType {
  // Ключевые слова
  WORKFLOW = 'WORKFLOW',
  ROLE = 'ROLE',
  STEP = 'STEP',
  PARALLEL = 'PARALLEL',
  TYPE = 'TYPE',
  PROMPT = 'PROMPT',
  FROM = 'FROM',
  INPUT = 'INPUT',
  OUTPUT = 'OUTPUT',
  DEPENDS_ON = 'DEPENDS_ON',
  CONDITION = 'CONDITION',
  SCRIPT = 'SCRIPT',
  ADAPTER = 'ADAPTER',
  MODEL = 'MODEL',
  DEFINITION = 'DEFINITION',
  DESCRIPTION = 'DESCRIPTION',
  ARTIFACTS_DIR = 'ARTIFACTS_DIR',
  
  // Литералы
  IDENTIFIER = 'IDENTIFIER',
  STRING = 'STRING',
  MULTILINE_STRING = 'MULTILINE_STRING',
  NUMBER = 'NUMBER',
  VERSION = 'VERSION',
  
  // Символы
  LBRACE = 'LBRACE',        // {
  RBRACE = 'RBRACE',        // }
  COMMA = 'COMMA',          // ,
  EQUALS = 'EQUALS',        // =
  DOT = 'DOT',              // .
  
  // Специальные
  EOF = 'EOF',
  NEWLINE = 'NEWLINE',
  COMMENT = 'COMMENT',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export interface LexerError {
  message: string;
  line: number;
  column: number;
}

/**
 * Лексер для DSL
 */
export class DSLLexer {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;
  private errors: LexerError[] = [];
  
  // Ключевые слова
  private keywords: Map<string, TokenType> = new Map([
    ['workflow', TokenType.WORKFLOW],
    ['role', TokenType.ROLE],
    ['step', TokenType.STEP],
    ['parallel', TokenType.PARALLEL],
    ['type', TokenType.TYPE],
    ['prompt', TokenType.PROMPT],
    ['from', TokenType.FROM],
    ['input', TokenType.INPUT],
    ['output', TokenType.OUTPUT],
    ['depends_on', TokenType.DEPENDS_ON],
    ['condition', TokenType.CONDITION],
    ['script', TokenType.SCRIPT],
    ['adapter', TokenType.ADAPTER],
    ['model', TokenType.MODEL],
    ['definition', TokenType.DEFINITION],
    ['description', TokenType.DESCRIPTION],
    ['artifacts_dir', TokenType.ARTIFACTS_DIR],
  ]);
  
  constructor(input: string) {
    this.input = input;
  }
  
  /**
   * Токенизирует весь входной текст
   */
  tokenize(): { tokens: Token[]; errors: LexerError[] } {
    const tokens: Token[] = [];
    
    while (!this.isAtEnd()) {
      const token = this.nextToken();
      if (token) {
        // Пропускаем комментарии и пустые строки
        if (token.type !== TokenType.COMMENT) {
          tokens.push(token);
        }
      }
    }
    
    tokens.push({
      type: TokenType.EOF,
      value: '',
      line: this.line,
      column: this.column,
    });
    
    return { tokens, errors: this.errors };
  }
  
  /**
   * Получает следующий токен
   */
  private nextToken(): Token | null {
    this.skipWhitespace();
    
    if (this.isAtEnd()) {
      return null;
    }
    
    const startLine = this.line;
    const startColumn = this.column;
    const char = this.peek();
    
    // Комментарии
    if (char === '/' && this.peekNext() === '/') {
      return this.readComment(startLine, startColumn);
    }
    
    // Многострочные строки
    if (char === '"' && this.peekNext() === '"' && this.peekAhead(2) === '"') {
      return this.readMultilineString(startLine, startColumn);
    }
    
    // Обычные строки
    if (char === '"') {
      return this.readString(startLine, startColumn);
    }
    
    // Версии (v1.0, v2.1.3)
    if (char === 'v' && this.isDigit(this.peekNext())) {
      return this.readVersion(startLine, startColumn);
    }
    
    // Числа
    if (this.isDigit(char)) {
      return this.readNumber(startLine, startColumn);
    }
    
    // Идентификаторы и ключевые слова
    if (this.isAlpha(char) || char === '_') {
      return this.readIdentifier(startLine, startColumn);
    }
    
    // Символы
    switch (char) {
      case '{':
        this.advance();
        return { type: TokenType.LBRACE, value: '{', line: startLine, column: startColumn };
      case '}':
        this.advance();
        return { type: TokenType.RBRACE, value: '}', line: startLine, column: startColumn };
      case ',':
        this.advance();
        return { type: TokenType.COMMA, value: ',', line: startLine, column: startColumn };
      case '=':
        this.advance();
        return { type: TokenType.EQUALS, value: '=', line: startLine, column: startColumn };
      case '.':
        this.advance();
        return { type: TokenType.DOT, value: '.', line: startLine, column: startColumn };
      default:
        this.errors.push({
          message: `Неожиданный символ: '${char}'`,
          line: startLine,
          column: startColumn,
        });
        this.advance();
        return null;
    }
  }
  
  /**
   * Читает комментарий
   */
  private readComment(line: number, column: number): Token {
    let value = '';
    this.advance(); // /
    this.advance(); // /
    
    while (!this.isAtEnd() && this.peek() !== '\n') {
      value += this.peek();
      this.advance();
    }
    
    return { type: TokenType.COMMENT, value, line, column };
  }
  
  /**
   * Читает многострочную строку (""")
   */
  private readMultilineString(line: number, column: number): Token {
    let value = '';
    this.advance(); // "
    this.advance(); // "
    this.advance(); // "
    
    while (!this.isAtEnd()) {
      if (this.peek() === '"' && this.peekNext() === '"' && this.peekAhead(2) === '"') {
        this.advance(); // "
        this.advance(); // "
        this.advance(); // "
        break;
      }
      
      value += this.peek();
      this.advance();
    }
    
    return { type: TokenType.MULTILINE_STRING, value, line, column };
  }
  
  /**
   * Читает обычную строку
   */
  private readString(line: number, column: number): Token {
    let value = '';
    this.advance(); // "
    
    while (!this.isAtEnd() && this.peek() !== '"') {
      if (this.peek() === '\\') {
        this.advance();
        if (!this.isAtEnd()) {
          // Обработка escape-последовательностей
          const escaped = this.peek();
          switch (escaped) {
            case 'n':
              value += '\n';
              break;
            case 't':
              value += '\t';
              break;
            case 'r':
              value += '\r';
              break;
            case '"':
              value += '"';
              break;
            case '\\':
              value += '\\';
              break;
            default:
              value += escaped;
          }
          this.advance();
        }
      } else {
        value += this.peek();
        this.advance();
      }
    }
    
    if (this.isAtEnd()) {
      this.errors.push({
        message: 'Незакрытая строка',
        line,
        column,
      });
    } else {
      this.advance(); // закрывающая "
    }
    
    return { type: TokenType.STRING, value, line, column };
  }
  
  /**
   * Читает версию (v1.0)
   */
  private readVersion(line: number, column: number): Token {
    let value = '';
    this.advance(); // v
    value += 'v';
    
    while (!this.isAtEnd() && (this.isDigit(this.peek()) || this.peek() === '.')) {
      value += this.peek();
      this.advance();
    }
    
    return { type: TokenType.VERSION, value, line, column };
  }
  
  /**
   * Читает число
   */
  private readNumber(line: number, column: number): Token {
    let value = '';
    
    while (!this.isAtEnd() && (this.isDigit(this.peek()) || this.peek() === '.')) {
      value += this.peek();
      this.advance();
    }
    
    return { type: TokenType.NUMBER, value, line, column };
  }
  
  /**
   * Читает идентификатор или ключевое слово
   */
  private readIdentifier(line: number, column: number): Token {
    let value = '';
    
    while (!this.isAtEnd() && (this.isAlphaNumeric(this.peek()) || this.peek() === '_')) {
      value += this.peek();
      this.advance();
    }
    
    // Проверяем, является ли это ключевым словом
    const tokenType = this.keywords.get(value) || TokenType.IDENTIFIER;
    
    return { type: tokenType, value, line, column };
  }
  
  /**
   * Пропускает пробелы
   */
  private skipWhitespace(): void {
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
        this.advance();
      } else {
        break;
      }
    }
  }
  
  /**
   * Проверяет, является ли символ буквой
   */
  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
  }
  
  /**
   * Проверяет, является ли символ цифрой
   */
  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }
  
  /**
   * Проверяет, является ли символ буквой или цифрой
   */
  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }
  
  /**
   * Возвращает текущий символ без продвижения
   */
  private peek(): string {
    if (this.isAtEnd()) {
      return '\0';
    }
    return this.input[this.position];
  }
  
  /**
   * Возвращает следующий символ без продвижения
   */
  private peekNext(): string {
    if (this.position + 1 >= this.input.length) {
      return '\0';
    }
    return this.input[this.position + 1];
  }
  
  /**
   * Возвращает символ на расстоянии offset без продвижения
   */
  private peekAhead(offset: number): string {
    if (this.position + offset >= this.input.length) {
      return '\0';
    }
    return this.input[this.position + offset];
  }
  
  /**
   * Продвигается на один символ вперед
   */
  private advance(): void {
    if (!this.isAtEnd()) {
      if (this.input[this.position] === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.position++;
    }
  }
  
  /**
   * Проверяет, достигнут ли конец входного текста
   */
  private isAtEnd(): boolean {
    return this.position >= this.input.length;
  }
}
