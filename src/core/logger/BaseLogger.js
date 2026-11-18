/**
 * @typedef {object} LoggerInterface
 * @property {(...args: any[]) => void} log
 * @property {(...args: any[]) => void} error
 */

/**
 * Базовый логгер: определяет контракт и общее форматирование.
 * Наследники реализуют только методы записи write/writeError.
 *
 * @implements {LoggerInterface}
 */
export default class BaseLogger {
  constructor() {
    if (new.target === BaseLogger) {
      throw new Error('BaseLogger: используйте конкретную реализацию (StdoutLogger, SilentLogger, FileLogger)');
    }
  }

  /**
   * @protected
   * @param {any[]} args
   * @returns {string}
   */
  format(args) {
    return args
      .map((arg) => {
        if (typeof arg === 'string') return arg;

        if (arg instanceof Error) return arg.stack || arg.message;

        if (arg === undefined) return 'undefined';

        try {
            return JSON.stringify(arg);
        } catch {
            return String(arg);
        }
      })
      .join(' ');
  }

  /**
   * @protected
   * @param {string} line
   * @returns {void}
   */
  write(line) {
    throw new Error('BaseLogger: метод write должен быть переопределён');
  }

  /**
   * @protected
   * @param {string} line
   * @returns {void}
   */
  writeError(line) {
    this.write(line);
  }

  /**
   * @public
   * @param {...any} args
   * @returns {void}
   */
  log(...args) {
    this.write(this.format(args));
  }

  /**
   * @public
   * @param {...any} args
   * @returns {void}
   */
  error(...args) {
    this.writeError(this.format(args));
  }
}