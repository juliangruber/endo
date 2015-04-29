var now = require('performance-now')

var logs = exports;

//
// endpoint logging middleware
//
logs.handler = function (next, config) {
  //
  // use custom log handler if provided, otherwise defer to console.log
  //
  var format = typeof config.log === 'function' ? config.log : logs.format;

  return function (request) {
    request.endo = {};
    request.endo.start = now();

    return Promise.resolve(next(request)).then(function (response) {
      request.endo.end = now();

      // TODO: instrument req/res bodies to measure sizes, times?
      return Promise.resolve(format(request, response)).then(function () {
        return response;
      });

    });
  };
};

logs.format = function (request, response) {
  var endpoint = request.endpoint;
  console.log([
    request.httpVersion ? 'HTTP/' + request.httpVersion : 'WS',
    request.method,
    request.path + request.search || '',
    endpoint ? ('endpoint:' + endpoint.path + '@' + endpoint.version) : '',
    'time:' + (request.endo.end - request.endo.start)
  ].join(' '));
};
