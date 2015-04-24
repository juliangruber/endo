var paramify = require('paramify');
var semver = require('semver');
var url = require('url');

var endpoints = exports;

//
// stupid little default implementation for routing endpoints
//
endpoints.parse = function (api, versions) {
  versions || (versions = {});
  var routes = versions[api.version || '*'] = versions[api.version || '*'] = {};

  //
  // endpoints are organized into groups
  //
  for (var groupName in api.groups) {
    var group = api.groups[groupName];
    var endpoints = group.endpoints || {};

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

    //
    // parse previous api routes if provided
    //
    if (api.previous) {
      endpoints.parse(api.previous, versions)
    }
  }

  return versions;
}

//
// default router, parsers semver from url paths
//
endpoints.handler = function (handler, config) {
  var versions = endpoints.parse(config.api);

  return function (request) {
    var path = request.url;
    var components = url.parse(path).pathname.split('/').slice(1);
    var candidates = {};

    var range = decodeURIComponent(components.shift());
    var validRange = semver.validRange(range);

    //
    // find a candidate set of allowable versions for route matching
    //
    Object.keys(versions).forEach(function (version) {
      if (semver.satisfies(version, validRange)) {
        candidates[version] = versions[version];
      }
    });

    var match = paramify('/' + components.join('/'));

    //
    // iterate over available routes for all candidate versions (descending)
    //
    for (var version in candidates) {
      var candidate = candidates[version]
      for (var route in candidate) {
        endpoint = candidate[route]

        //
        // match route by method and path info
        //
        if (request.method == endpoint.method && match(route)) {
          //
          // add match details to request and invoke endpoint handler
          //
          request.apiVersion = version;
          request.params = match.params;
          request.route = route;
          return endpoint.handler(request);
        }
      }
    }

    //
    // fallback handler for when a valid endpoint is not found
    //
    return handler(request);
  };
}