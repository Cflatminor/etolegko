import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import BenchService from '../src/modules/bench/service.js';
import { HttpError } from '../src/core/transport/httpClient.js';

describe('BenchService', () => {
  function createMockStream(bytes, chunksCount = 2) {
    const chunkSize = Math.floor(bytes / chunksCount);
    const remainder = bytes % chunksCount;

    const chunks = Array.from({ length: chunksCount }, (_, i) => {
      const size = i === chunksCount - 1 ? chunkSize + remainder : chunkSize;
      return new Uint8Array(size);
    });

    return Readable.from(chunks);
  }

  function createSut(downloadImpl) {
    const logger = {
      log: mock.fn(),
      error: mock.fn(),
    };

    const repository = {
      downloadResource: mock.fn(
        downloadImpl ?? (async () => ({ data: createMockStream(1024), status: 200 }))
      ),
    };

    const service = new BenchService({ repository, logger });

    return { service, repository, logger };
  }

  it('корректно считает общий объём, среднее время и скорость', async () => {
    const { service, repository } = createSut();

    const summary = await service.bench({ requestsQuantity: 3, intervalMs: 0 });

    assert.equal(repository.downloadResource.mock.calls.length, 3);
    assert.equal(summary.totalBytes, 3072);
    assert.equal(summary.results.length, 3);
    assert.ok(summary.avgMs >= 0);
    assert.ok(summary.avgSpeed > 0);
  });

  it('возвращает результат успешного прогона без ошибок', async () => {
    const { service, logger } = createSut(async () => ({
      data: createMockStream(512),
      status: 200,
    }));

    const outcome = await service.benchSafe({ requestsQuantity: 2, intervalMs: 0 });

    assert.equal(outcome.error, undefined);
    assert.equal(outcome.result.totalBytes, 1024);
    assert.equal(outcome.result.results.length, 2);
    assert.equal(logger.error.mock.calls.length, 0);
  });

  it('при успешном прогоне в лог уходит таблица замеров', async () => {
    const { service, logger } = createSut();

    await service.benchSafe({ requestsQuantity: 3, intervalMs: 0 });

    assert.ok(logger.log.mock.calls.length >= 4);
  });

  it('перехватывает HttpError и возвращает объект с ошибкой', async () => {
    const httpError = new HttpError('HTTP 404 Not Found', {
      status: 404,
      statusText: 'Not Found',
      data: { message: 'Resource missing' },
      headers: new Headers(),
    });

    const { service, logger } = createSut(async () => {
      throw httpError;
    });

    const outcome = await service.benchSafe({ requestsQuantity: 1, intervalMs: 0 });

    assert.equal(outcome.result, undefined);
    assert.equal(outcome.error, httpError);
    assert.equal(logger.error.mock.calls.length, 1);
  });

  it('пробрасывает неожиданные сетевые исключения выше', async () => {
    const networkError = new TypeError('fetch failed');
    const { service } = createSut(async () => {
      throw networkError;
    });

    await assert.rejects(
      () => service.benchSafe({ requestsQuantity: 1, intervalMs: 0 }),
      networkError
    );
  });

  it('валидирует некорректные параметры запуска', async () => {
    const { service } = createSut();

    await assert.rejects(
      () => service.bench({ requestsQuantity: 0, intervalMs: 100 }),
      /requestsQuantity должен быть целым числом >= 1/
    );

    await assert.rejects(
      () => service.bench({ requestsQuantity: 1, intervalMs: -1 }),
      /intervalMs должен быть целым числом >= 0/
    );
  });

  it('гасит сетевую недоступность, не пробрасывая её', async () => {
    const networkError = new TypeError('fetch failed', {
      cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
    });
    const { service, logger } = createSut(async () => {
      throw networkError;
    });

    const outcome = await service.benchSafe({ requestsQuantity: 1, intervalMs: 0 });

    assert.equal(outcome.result, undefined);
    assert.equal(outcome.error, networkError);
    assert.equal(logger.error.mock.calls.length, 1);
  });
});
