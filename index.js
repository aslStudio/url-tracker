#!/usr/bin/env node

const http = require('node:http');
const https = require('node:https');
const { performance } = require('node:perf_hooks');

const REQUEST_COUNT = 10;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 60_000;

function parseAddress(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Адрес должен начинаться с http:// или https://');
  }
  return url;
}

function download(url, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(url, { headers: { 'Accept-Encoding': 'identity' } }, (response) => {
      const status = response.statusCode;

      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirectsLeft === 0) {
          reject(new Error('Слишком много перенаправлений'));
          return;
        }
        let nextUrl;
        try {
          nextUrl = parseAddress(new URL(response.headers.location, url).href);
        } catch (error) {
          reject(error);
          return;
        }
        download(nextUrl, redirectsLeft - 1).then(resolve, reject);
        return;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`Сервер вернул HTTP ${status}`));
        return;
      }

      let bytes = 0;
      response.on('data', (chunk) => { bytes += chunk.length; });
      response.on('end', () => resolve(bytes));
      response.on('error', reject);
      response.on('aborted', () => reject(new Error('Ответ сервера оборвался')));
    });

    request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error('Время ожидания истекло')));
    request.on('error', reject);
  });
}

async function main() {
  if (process.argv.length !== 3) {
    throw new Error('Использование: node index.js <http(s)://адрес>');
  }

  const url = parseAddress(process.argv[2]);
  let totalBytes = 0;
  let totalMilliseconds = 0;

  for (let i = 1; i <= REQUEST_COUNT; i++) {
    const started = performance.now();
    const bytes = await download(url);
    const milliseconds = performance.now() - started;
    totalBytes += bytes;
    totalMilliseconds += milliseconds;
    console.log(`${i}/${REQUEST_COUNT}: ${(milliseconds / 1000).toFixed(3)} с, ${bytes} байт`);
  }

  const totalSeconds = totalMilliseconds / 1000;
  console.log(`Среднее время запроса: ${(totalMilliseconds / REQUEST_COUNT / 1000).toFixed(3)} с`);
  console.log(`Всего скачано: ${totalBytes} байт`);
  console.log(`Скорость скачивания: ${(totalBytes / 1_000_000 / totalSeconds).toFixed(3)} МБ/с`);
}

main().catch((error) => {
  console.error(`Ошибка: ${error.message}`);
  process.exitCode = 1;
});
