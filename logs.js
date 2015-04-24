var now = require('performance-now')

var logs = exports;

//
// endpoint logging middleware
//
logs.handler = function (handler, config) {
  //
  // use custom log handler if provided, otherwise defer to console.log
  //
  var logger = typeof config.log === 'function' ? config.log : console.log;

  return function (request) {

    var start = now();
    var log = {
      request: {
        protocol: request.httpVersion ? [
          'HTTP', request.httpVersionMajor, request.httpVersionMinor
        ] : 'WS',
        method: request.method,
        headers: request.headers,
        path: request.url,
        search: request.search
      }
    };

    return Promise.resolve(handler(request)).then(function (response) {
      log.auth = request.auth;

      log.api = {
        version: request.apiVersion,
        params: request.params,
        route: request.route
      };

      log.response = {
        status: response.status,
        headers: response.headers
      };
      log.time = now() - start;

      logger(log)

      // TODO: instrument req/res bodies to measure sizes, times?
      return response;

    });
  };
};

// TODO: proper logging
logs.error = console.error;

