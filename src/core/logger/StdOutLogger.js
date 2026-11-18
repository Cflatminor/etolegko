import BaseLogger from './BaseLogger.js';

export default class StdOutLogger extends BaseLogger {
  /**
   * @protected
   * @param {string} line
   */
  write(line) {
    console.log(line);
  }

  /**
   * @protected
   * @param {string} line
   */
  writeError(line) {
    console.error(line);
  }
}