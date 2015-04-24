var errors = function (handler, config) {
  return function (request) {
    return Promise.resolve(handler(request)).catch(errors.response || config.catch)
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

  if (config.dev) {
    body.stack = error.stack
  }
  return {
    status: error.status || 500,
    headers: { 'content-type': 'application/json' },
    body: body
  };
}

//
// 404 error class
//
function NotFound(request) {
  this.status = 404;
  this.message = 'Not Found: ' + request.url;
  this.stack = Error().stack;
}
NotFound.prototype = Object.create(Error.prototype);
NotFound.prototype.name = 'NotFoundError';
NotFound.prototype.constructor = NotFound;

errors.NotFound = NotFound;

module.exports = errors;
