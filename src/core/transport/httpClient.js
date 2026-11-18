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
 * @typedef {'JSON' | 'TEXT' | 'BLOB' | 'ARRAY_BUFFER'} HttpResponseType
 */

/** @type {Readonly<Record<'JSON'|'TEXT'|'BLOB'|'ARRAY_BUFFER', HttpResponseType>>} */
export const HttpResponseType = Object.freeze({
  JSON: 'JSON',
  TEXT: 'TEXT',
  BLOB: 'BLOB',
  ARRAY_BUFFER: 'ARRAY_BUFFER',
});

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

export class HttpClient {
  static methods = HttpMethod;
  static responseTypes = HttpResponseType;

  #defaultHeaders;
  #timeoutMs;

  /**
   * @param {HttpClientOptions} [options]
   */
  constructor({ defaultHeaders = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.#defaultHeaders = { ...defaultHeaders };
    this.#timeoutMs = timeoutMs;
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
    signal,
  }) {
    if (!url) {
      throw new Error('Параметр url обязателен для выполнения запроса');
    }

    const resolvedUrl = this.#buildUrl(url, params, query);
    const requestHeaders = this.#mergeHeaders(this.#defaultHeaders, headers);

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    const init = {
      method,
      headers: requestHeaders,
      signal: combinedSignal,
    };

    if (body !== undefined && method !== HttpMethod.GET && method !== HttpMethod.DELETE) {
      init.body = this.#prepareBody(body, requestHeaders);
    }

    const response = await fetch(resolvedUrl, init);
    const data = await this.#parseBody(response, responseType);

    if (!response.ok) {
      throw new HttpError(`HTTP ${response.status} ${response.statusText}`, {
        status: response.status,
        statusText: response.statusText,
        data,
        headers: response.headers,
      });
    }

    return {
      data,
      status: response.status,
      headers: response.headers,
      raw: response,
    };
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

  async #parseBody(response, responseType) {
    if (response.status === 204) return null;

    switch (responseType) {
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
}

export default HttpClient;