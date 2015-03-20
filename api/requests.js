var url = require('url');
var paramify = require('paramify');

function getRoutes(api) {
  var routes = {};

  //
  // endpoints are organized by section
  //
  for (var sectionName in api.sections) {
    var section = api.sections[sectionName];
    var endpoints = section.endpoints || {};

    for (var name in endpoints) {
      var endpoint = endpoints[name];

      if (endpoint.path) {
        //
        // add endpoint descriptor to route map
        //
        routes[endpoint.path] = endpoint;

        //
        // normalize method names
        //
        endpoint.method = (endpoint.method || 'GET').toUpperCase();
      }
    }
  }

  return routes;
}

//
// creates handlers to serve a provided api definition
//
module.exports = function (config) {
  config || (config = {});
  var api = config.api || {};

  var basePath = (config.prefix || '') + (api.prefix || '');
  var routes = getRoutes(api);

  return {

    test: function (req, res) {
      return req.url.indexOf(basePath) === 0;
    },

    handler: function (req, res) {
      // strip base path prefix from request url
      req.url = req.url.substring(basePath.length);

      var match = paramify(url.parse(req.url).pathname);

      //
      // iterate available routes
      //
      for (var route in routes) {
        var endpoint = routes[route];

        //
        // match route by method and path info
        //
        if (req.method == endpoint.method && match(route)) {
          return endpoint.handler(req, res);
        }
      }

      res.statusCode = 501;
      res.end('Not Implemented');
    }

  };
}
