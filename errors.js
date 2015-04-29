var errors = exports;

//
// 401 error class
//
function Unauthorized(message) {
  Error.call(this);
  Error.captureStackTrace(this, this.constructor);

  this.status = 401;
  this.message = message;
}

errors.Unauthorized = Unauthorized;
Unauthorized.prototype = Object.create(Error.prototype);
Unauthorized.prototype.name = 'UnauthorizedError';
Unauthorized.prototype.constructor = Unauthorized;

//
// 404 error class
//
function NotFound(message) {
  Error.call(this);
  Error.captureStackTrace(this, this.constructor);

  this.status = 404;
  this.message = message;
}

errors.NotFound = NotFound;
NotFound.prototype = Object.create(Error.prototype);
NotFound.prototype.name = 'NotFoundError';
NotFound.prototype.constructor = NotFound;


//
// trap and format errors
//
errors.handler = function (next, config) {
  var formatter = config.catch || errors.response;
  return function (request) {
    try {
      return Promise.resolve(next(request)).catch(formatter)
    }
    catch (error) {
      return formatter(error);
    }
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

errors.log = console.error;
