import HttpClient from '../../core/transport/httpClient.js';
import StdOutLogger from '../../core/logger/StdOutLogger.js';
// import FileLogger from '../../core/logger/FileLogger.js';

import Repository from './repository.js';
import BenchService from './service.js';
import { parseCli } from './cli.js';

export async function init() {
  const logger = new StdOutLogger();

  try {
    const options = parseCli(process.argv);

    const httpClient = new HttpClient({
      timeoutMs: 300_000, // на случай тяжёлых картинок
      idleTimeoutMs: 15_000,
      defaultHeaders: {
        'Cache-Control': 'no-cache'
      }
    });

    const repository = new Repository({
      httpClient,
      urls: {
        downloadResource: options.url,
      }
    });

    const service = new BenchService({ repository, logger });

    logger.log(`URL: ${options.url}`);

    const { result } = await service.benchSafe({
      requestsQuantity: options.requestsQuantity,
      intervalMs: options.intervalMs,
    });
    
    process.exitCode = result && !result.failure ? 0 : 1;
  } catch (error) {
    logger.error(`Ошибка: ${error.message}`);

    process.exitCode = 1;
  }
}