/**
 * @typedef {'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'} HttpMethod
 */

/** @type {Readonly<Record<'GET'|'POST'|'PUT'|'PATCH'|'DELETE', HttpMethod>>} */
export const HttpMethod = Object.freeze({
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
});

/**
 * @typedef {'JSON' | 'TEXT' | 'BLOB' | 'ARRAY_BUFFER' | 'STREAM'} HttpResponseType
 */

/** @type {Readonly<Record<'JSON'|'TEXT'|'BLOB'|'ARRAY_BUFFER'|'STREAM', HttpResponseType>>} */
export const HttpResponseType = Object.freeze({
  JSON: 'JSON',
  TEXT: 'TEXT',
  BLOB: 'BLOB',
  ARRAY_BUFFER: 'ARRAY_BUFFER',
  STREAM: 'STREAM',
});

class IdleTimeout {
  #controller = new AbortController();
  #idleMs;
  #timer = null;

  /**
   * @param {number} idleMs
   */
  constructor(idleMs) {
    if (!Number.isFinite(idleMs) || idleMs <= 0) {
      throw new Error('IdleTimeout: idleMs должен быть положительным числом');
    }

    this.#idleMs = idleMs;
    this.touch();
  }

  /** @returns {AbortSignal} */
  get signal() {
    return this.#controller.signal;
  }

  touch() {
    this.clear();

    this.#timer = setTimeout(() => {
      this.#controller.abort(
        new DOMException(`Поток простаивал дольше ${this.#idleMs} мс`, 'TimeoutError')
      );
    }, this.#idleMs);
  }

  clear() {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }
}

export class HttpError extends Error {
  /**
   * @param {string} message
   * @param {object} details
   * @param {number} details.status HTTP-статус ответа
   * @param {string} details.statusText
   * @param {*} details.data разобранное тело ответа (может быть телом ошибки)
   * @param {Headers} details.headers заголовки ответа
   */
  constructor(message, { status, statusText, data, headers }) {
    super(message);

    this.name = 'HttpError';
    this.status = status;
    this.statusText = statusText;
    this.data = data;
    this.headers = headers;
  }
}

/**
 * @typedef {object} HttpClientOptions
 * @property {Record<string, string>} [defaultHeaders]
 * @property {number} [timeoutMs=30000]
 * @property {number} [idleTimeoutMs=15000]
 */

/**
 * @typedef {object} RequestOptions
 * @property {string} url
 * @property {HttpMethod} [method='GET']
 * @property {Record<string, string|number>} [params={}]
 * @property {Record<string, string|number|boolean|null|undefined>} [query]
 * @property {Object|FormData|URLSearchParams|string} [body]
 * @property {Record<string, string>} [headers={}]
 * @property {HttpResponseType} [responseType='JSON']
 * @property {number} [timeoutMs]
 * @property {number} [idleTimeoutMs]
 * @property {AbortSignal} [signal]
 */

/**
 * @template T
 * @typedef {object} HttpResponse
 * @property {T} data тело ответа
 * @property {number} status
 * @property {Headers} headers
 * @property {Response} raw нативный объект Response
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_IDLE_TIMEOUT_MS = 15_000;

export class HttpClient {
  static methods = HttpMethod;
  static responseTypes = HttpResponseType;

  #defaultHeaders;
  #timeoutMs;
  #idleTimeoutMs;

  /**
   * @param {HttpClientOptions} [options]
   */
  constructor({
    defaultHeaders = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  } = {}) {
    this.#defaultHeaders = { ...defaultHeaders };
    this.#timeoutMs = timeoutMs;
    this.#idleTimeoutMs = idleTimeoutMs;
  }

  /**
   * @template [T=any]
   * @param {RequestOptions} options
   * @returns {Promise<HttpResponse<T>>}
   * @throws {HttpError}
   */
  async request({
    url,
    method = HttpMethod.GET,
    params = {},
    query,
    body,
    headers = {},
    responseType = HttpResponseType.JSON,
    timeoutMs = this.#timeoutMs,
    idleTimeoutMs = this.#idleTimeoutMs,
    signal,
  }) {
    if (!url) {
      throw new Error('Параметр url обязателен для выполнения запроса');
    }

    const resolvedUrl = this.#buildUrl(url, params, query);
    const requestHeaders = this.#mergeHeaders(this.#defaultHeaders, headers);

    const signals = [AbortSignal.timeout(timeoutMs)];
    const idleController = idleTimeoutMs ? new IdleTimeout(idleTimeoutMs) : null;

    if (idleController) signals.push(idleController.signal);
    if (signal) signals.push(signal);

    const init = {
      method,
      headers: requestHeaders,
      signal: AbortSignal.any(signals),
    };

    if (body !== undefined && method !== HttpMethod.GET && method !== HttpMethod.DELETE) {
      init.body = this.#prepareBody(body, requestHeaders);
    }

    try {
      const response = await fetch(resolvedUrl, init);
      const data = await this.#parseBody(response, responseType, idleController);

      if (!response.ok) {
        if (responseType === HttpResponseType.STREAM) {
          idleController?.clear();
          await response.body?.cancel();
        }

        throw new HttpError(`HTTP ${response.status} ${response.statusText}`, {
          status: response.status,
          statusText: response.statusText,
          data,
          headers: response.headers,
        });
      }

      if (responseType !== HttpResponseType.STREAM) {
        idleController?.clear();
      }

      return {
        data,
        status: response.status,
        headers: response.headers,
        raw: response,
      };
    } catch (error) {
      idleController?.clear();
      throw error;
    }
  }

  /**
   * @template [T=any]
   * @param {string} url
   * @param {Omit<RequestOptions, 'url' | 'method' | 'body'>} [options]
   * @returns {Promise<HttpResponse<T>>}
   * @throws {HttpError}
   */
  get(url, options = {}) {
    return this.request({ ...options, url, method: HttpMethod.GET });
  }

  /**
   * @template [T=any]
   * @param {string} url
   * @param {Omit<RequestOptions, 'url' | 'method'>} [options]
   * @returns {Promise<HttpResponse<T>>}
   * @throws {HttpError}
   */
  post(url, options = {}) {
    return this.request({ ...options, url, method: HttpMethod.POST });
  }

  /**
   * @template [T=any]
   * @param {string} url
   * @param {Omit<RequestOptions, 'url' | 'method'>} [options]
   * @returns {Promise<HttpResponse<T>>}
   * @throws {HttpError}
   */
  put(url, options = {}) {
    return this.request({ ...options, url, method: HttpMethod.PUT });
  }

  /**
   * @template [T=any]
   * @param {string} url
   * @param {Omit<RequestOptions, 'url' | 'method'>} [options]
   * @returns {Promise<HttpResponse<T>>}
   * @throws {HttpError}
   */
  patch(url, options = {}) {
    return this.request({ ...options, url, method: HttpMethod.PATCH });
  }

  /**
   * @template [T=any]
   * @param {string} url
   * @param {Omit<RequestOptions, 'url' | 'method' | 'body'>} [options]
   * @returns {Promise<HttpResponse<T>>}
   * @throws {HttpError}
   */
  delete(url, options = {}) {
    return this.request({ ...options, url, method: HttpMethod.DELETE });
  }

  #prepareBody(body, headers) {
    if (body instanceof FormData || body instanceof URLSearchParams || typeof body === 'string') {
      return body;
    }

    const contentTypeKey = Object.keys(headers).find(
      (key) => key.toLowerCase() === 'content-type'
    );
    const contentTypeValue = contentTypeKey ? headers[contentTypeKey].toLowerCase() : '';

    if (contentTypeValue.includes('application/x-www-form-urlencoded')) {
      return new URLSearchParams(body).toString();
    }

    if (!contentTypeKey) {
      headers['Content-Type'] = 'application/json';
    }

    return JSON.stringify(body);
  }

  #mergeHeaders(baseHeaders, customHeaders) {
    const result = { ...baseHeaders };
    for (const [key, value] of Object.entries(customHeaders)) {
      const existingKey = Object.keys(result).find(
        (k) => k.toLowerCase() === key.toLowerCase()
      );
      if (existingKey) {
        delete result[existingKey];
      }
      result[key] = value;
    }
    return result;
  }

  #buildUrl(rawUrl, params, query) {
    const isAbsolute = /^https?:\/\//i.test(rawUrl);
    const parsed = new URL(rawUrl, isAbsolute ? undefined : 'http://localhost');

    parsed.pathname = parsed.pathname.replace(/:([A-Za-z0-9_]+)/g, (match, key) => {
      return key in params ? encodeURIComponent(params[key]) : match;
    });

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          parsed.searchParams.append(key, String(value));
        }
      }
    }

    return isAbsolute ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
  }

  async #parseBody(response, responseType, idleController) {
    if (response.status === 204 || response.body === null) {
      idleController?.clear();

      return null;
    }

    switch (responseType) {
      case HttpResponseType.STREAM:
        return this.#wrapStream(response.body, idleController);
      case HttpResponseType.TEXT:
        return response.text();
      case HttpResponseType.BLOB:
        return response.blob();
      case HttpResponseType.ARRAY_BUFFER:
        return response.arrayBuffer();
      case HttpResponseType.JSON:
      default: {
        const text = await response.text();

        if (!text) return null;
        
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
    }
  }

  /**
   * @param {ReadableStream<Uint8Array> | null} body
   * @param {IdleTimeout | null} idleController
   */
  async *#wrapStream(body, idleController) {
    try {
      for await (const chunk of body) {
        idleController?.touch();
        yield chunk;
      }
    } finally {
      idleController?.clear();
    }
  }
}

export default HttpClient;