/**
 * @typedef {object} CliOptions
 * @property {string} url
 * @property {number} requests
 * @property {number} intervalMs
 */

/**
 * @param {string[]} argv
 * @returns {CliOptions}
 * @throws {Error}
 */
export function parseCli(argv) {
  const [url, quantityArg, intervalArg] = argv.slice(2);
  const requestsQuantity = quantityArg === undefined ? 10 : Number(quantityArg);
  const intervalMs = intervalArg === undefined ? 500 : Number(intervalArg);

  if (!url) {
    throw new Error('Укажите URL.\nПример: node index.js https://example.com/image.jpg 10 500');
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(url);

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error();
    }
  } catch {
    throw new Error('URL должен начинаться с http:// или https://');
  }

  if (!Number.isInteger(requestsQuantity) || requestsQuantity < 1) {
    throw new Error('Количество запросов должно быть целым числом >= 1');
  }

  if (!Number.isInteger(intervalMs) || intervalMs < 0) {
    throw new Error('Интервал должен быть целым числом >= 0');
  }

  return { url: parsedUrl.toString(), requestsQuantity, intervalMs };
}
