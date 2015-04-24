var errors = exports;

//
// 404 error class
//
function NotFound(request) {
  if (!(this instanceof NotFound)) {
    return new NotFound(request);
  }

  this.status = 404;
  this.message = 'Not Found: ' + request.url;
  this.stack = Error().stack;
}
errors.NotFound = NotFound

NotFound.prototype = Object.create(Error.prototype);
NotFound.prototype.name = 'NotFoundError';
NotFound.prototype.constructor = NotFound;


//
// trap and format errors
//
errors.handler = function (handler, config) {
  var formatter = config.catch || errors.response;
  return function (request) {
    return Promise.resolve(handler(request)).catch(formatter)
  };
};

//
// expose default error response formatter
//
errors.response = function (error) {
  var body = {
    name: error.name,
    message: error.message
  };

  if (errors.verbose || true) {
    body.stack = error.stack
  }
  return {
    status: error.status || 500,
    body: body
  };
}
