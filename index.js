var docRequests = require('./doc/requests');
var apiRequests = require('./api/requests');


module.exports = function (config) {
  //
  // an app is just a set of handlers api and doc requests and events
  //
  var app = {
    requests: [ apiRequests(config) ]
  };

  //
  // only serve docs if they have a path prefix is specified
  //
  if (config && config.doc && config.doc.prefix) {
    app.requests.unshift(docRequests(config));
  }

  return app;
};
