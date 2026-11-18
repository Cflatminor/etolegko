const DEFAULT_REQUESTS = 10;
const TIMEOUT_MS = 30_000;

const UNITS = [
  { limit: 1024 ** 3, name: 'ГБ' },
  { limit: 1024 ** 2, name: 'МБ' },
  { limit: 1024, name: 'КБ' },
  { limit: 1, name: 'байт' },
];

function formatBytes(bytes) {
  const unit = UNITS.find((u) => bytes >= u.limit) ?? UNITS.at(-1);
  const value = bytes / unit.limit;
  return `${value.toFixed(unit.name === 'байт' ? 0 : 2)} ${unit.name}`;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const [url, count] = args;

  if (!url) {
    console.error('Ошибка: укажите URL.\nПример: node bench.js https://example.com/image.jpg 10');
    process.exit(1);
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error();
  } catch {
    console.error('Ошибка: URL должен начинаться с http:// или https://');
    process.exit(1);
  }

  let requests = DEFAULT_REQUESTS;
  if (count !== undefined) {
    requests = Number(count);
    if (!Number.isInteger(requests) || requests < 1) {
      console.error('Ошибка: количество запросов должно быть целым числом >= 1');
      process.exit(1);
    }
  }

  return { url: parsedUrl.toString(), requests };
}

async function measureOnce(url) {
  const startedAt = performance.now();

  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
  }

  const elapsedMs = performance.now() - startedAt;
  return { bytes, elapsedMs };
}

async function main() {
  const { url, requests } = parseArgs(process.argv);

  console.log(`URL: ${url}`);
  console.log(`Запросов: ${requests}\n`);
  console.log('  # | время, мс | размер');

  const results = [];

  for (let i = 1; i <= requests; i++) {
    try {
      const { bytes, elapsedMs } = await measureOnce(url);
      results.push({ bytes, elapsedMs });
      console.log(
        `${String(i).padStart(3)} | ${elapsedMs.toFixed(0).padStart(9)} | ${formatBytes(bytes).padStart(7)}`
      );
    } catch (err) {
      console.error(`Запрос ${i} не удался: ${err.message}`);
      process.exit(1);
    }
  }

  const totalBytes = results.reduce((sum, r) => sum + r.bytes, 0);
  const avgMs = results.reduce((sum, r) => sum + r.elapsedMs, 0) / results.length;
  const avgSpeed = totalBytes / (results.reduce((sum, r) => sum + r.elapsedMs, 0) / 1000);

  console.log('');
  console.log(`Среднее время запроса: ${avgMs.toFixed(0)} мс`);
  console.log(`Всего скачано: ${formatBytes(totalBytes)} (${totalBytes.toLocaleString('ru-RU')} байт)`);
  console.log(`Средняя скорость: ${formatBytes(avgSpeed)}/с`);
}

main();
