var auth = exports;

auth.handler = function (handler, config) {
  // TODO
  return function (request) {
    return handler(request);
  };
};

