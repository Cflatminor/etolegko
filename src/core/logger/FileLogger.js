import fs from 'fs';

import BaseLogger from './BaseLogger.js';

export default class FileLogger extends BaseLogger {
  /** @type {string} */
  #filePath;

  /**
   * @param {object} [options]
   * @param {string} [options.filePath]
   */
  constructor({ filePath = 'bench.log' } = {}) {
    super();

    this.#filePath = filePath;
  }

  /**
   * @protected
   * @param {string} line
   */
  write(line) {
    fs.appendFileSync(this.#filePath, `${line}\n`);
  }
}