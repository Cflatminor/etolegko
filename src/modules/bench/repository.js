import HttpClient from '../../core/transport/httpClient.js';

/**
 * @typedef {import('../../core/transport/httpClient.js').HttpResponse} HttpResponse
 * @typedef {import('../../core/transport/httpClient.js').HttpError} HttpError
 */

/** @typedef {{ httpClient: HttpClient, urls: Record<string, string> }} RepositoryDependencies */

export default class Repository {
  /**
   * @param {RepositoryDependencies} dependencies
   */
  constructor(dependencies) {
    this.#validateDependencies(dependencies);

    /** @type {HttpClient} */
    this.httpClient = dependencies.httpClient;

    /** @type {Record<string, string>} */
    this.urls = dependencies.urls;
  }

  /**
   * @private
   * @method validateDependencies
   * @param {RepositoryDependencies} dependencies
   * @returns {void}
   * @throws {Error}
   */
  #validateDependencies(dependencies) {
    if (!dependencies.httpClient) {
      throw new Error('Repository: httpClient обязателен');
    }
    if (!dependencies.urls || Object.keys(dependencies.urls).length === 0) {
      throw new Error('Repository: urls обязательны');
    }
  }

  /**
   * @public
   * @method downloadResource
   * @returns {Promise<HttpResponse<AsyncIterable<Uint8Array>>>}
   * @throws {HttpError}
   */
  downloadResource() {
    return this.httpClient.get(this.urls.downloadResource, {
      responseType: HttpClient.responseTypes.STREAM,
    });
  }
}