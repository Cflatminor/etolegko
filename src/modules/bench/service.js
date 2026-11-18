/** @typedef {import('../../core/logger/BaseLogger.js').LoggerInterface} LoggerInterface */
/** @typedef {import('../../core/transport/httpClient.js').HttpError} HttpError */

/** @typedef {import('./repository.js').default} Repository */

const DEFAULT_REQUESTS_QUANTITY = 10;
const DEFAULT_INTERVAL_MS = 500;

const UNITS = [
  { limit: 1024 ** 3, name: 'ГБ', digits: 2 },
  { limit: 1024 ** 2, name: 'МБ', digits: 2 },
  { limit: 1024, name: 'КБ', digits: 2 },
  { limit: 1, name: 'байт', digits: 0 },
];

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  const unit = UNITS.find((u) => bytes >= u.limit) ?? UNITS.at(-1);

  return `${(bytes / unit.limit).toFixed(unit.digits)} ${unit.name}`;
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default class BenchService {
  /**
   * @param {{
   *   repository: Repository,
   *   logger?: LoggerInterface,
   * }} dependencies
   */
  constructor(dependencies) {
    this.#validateDependencies(dependencies);

    /** @type {Repository} */
    this.repository = dependencies.repository;

    /** @type {LoggerInterface} */
    this.logger = dependencies.logger ?? console;
  }


  /**
   * @private
   * @param {Array<{ bytes: number, elapsedMs: number }>} results
   * @returns {{ totalBytes: number, avgMs: number, avgSpeed: number }}
   */
  #summarize(results) {
    const totalBytes = results.reduce((sum, r) => sum + r.bytes, 0);
    const totalMs = results.reduce((sum, r) => sum + r.elapsedMs, 0);

    return {
      totalBytes,
      avgMs: totalMs / results.length,
      avgSpeed: totalMs > 0 ? totalBytes / (totalMs / 1000) : 0
    };
  }

  /**
   * @private
   * @param {{ requestsQuantity: number, intervalMs: number }} options
   * @returns {void}
   * @throws {Error}
   */
  #validateOptions({ requestsQuantity, intervalMs }) {
    if (!Number.isInteger(requestsQuantity) || requestsQuantity < 1) {
      throw new Error('BenchService: requestsQuantity должен быть целым числом >= 1');
    }
    if (!Number.isInteger(intervalMs) || intervalMs < 0) {
      throw new Error('BenchService: intervalMs должен быть целым числом >= 0');
    }
  }

  /**
   * @private
   * @param {{ repository: Repository }} dependencies
   * @returns {void}
   */
  #validateDependencies(dependencies) {
    if (!dependencies.repository) {
      throw new Error('BenchService: repository обязателен');
    }
  }

  /**
   * Бенчмарк: N последовательных запросов с интервалом.
   * Каждый следующий запрос стартует только после полной загрузки предыдущего
   * (плюс пауза intervalMs, пауза не учитывается в замерах скорости).
   *
   * @param {object} [options]
   * @param {number} [options.requestsQuantity=10]
   * @param {number} [options.intervalMs=500]
   * @returns {Promise<{
   *   totalBytes: number,
   *   avgMs: number,
   *   avgSpeed: number,
   *   results: Array<{ bytes: number, elapsedMs: number }>,
   * }>}
   * @throws {HttpError}
   */
  async bench({ requestsQuantity = DEFAULT_REQUESTS_QUANTITY, intervalMs = DEFAULT_INTERVAL_MS } = {}) {
    this.#validateOptions({ requestsQuantity, intervalMs });

    this.logger.log(`Запросов: ${requestsQuantity}, интервал: ${intervalMs} мс`);
    this.logger.log('  # | время, мс | размер');

    /** @type {Array<{ bytes: number, elapsedMs: number }>} */
    const results = [];

    for (let i = 1; i <= requestsQuantity; i++) {
      const startedAt = performance.now();
      const response = await this.repository.downloadResource();
      const elapsedMs = performance.now() - startedAt;

      const bytes = response.data.byteLength;
      results.push({ bytes, elapsedMs });

      this.logger.log(
        `${String(i).padStart(3)} | ${elapsedMs.toFixed(0).padStart(9)} | ${formatBytes(bytes).padStart(7)}`
      );

      if (i < requestsQuantity && intervalMs > 0) {
        await sleep(intervalMs);
      }
    }

    const summary = this.#summarize(results);

    this.logger.log('');
    this.logger.log(`Среднее время запроса: ${summary.avgMs.toFixed(0)} мс`);
    this.logger.log(`Всего скачано: ${formatBytes(summary.totalBytes)}`);
    this.logger.log(`Средняя скорость: ${formatBytes(summary.avgSpeed)}/с`);

    return { ...summary, results };
  }

  /**
   * @param {object} [options]
   * @returns {Promise<{ result?: object, error?: HttpError }>}
   */
  async benchSafe(options = {}) {
    try {
      const result = await this.bench(options);

      return { result };
    } catch (error) {
      if (error.name === 'HttpError') {
        this.logger.error(`[${error.status}]`, error.data);

        return { error };
      }

      if (error.cause?.code || error.name === 'TimeoutError') {
        this.logger.error(`Сетевая ошибка: ${error.message}`);

        return { error };
      }

      throw error;
    }
  }
}
