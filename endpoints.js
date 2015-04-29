var paramify = require('paramify');
var semver = require('semver');
var url = require('url');

var endpoints = exports;

function updatePermissions(target, parent) {
  if (!target.permissions) {
    target.permissions = [];
  }
  else if (typeof target.permissions === 'string') {
    target.permissions = [ target.permissions ];
  }

  // TODO: set semantics
  if (parent) {
    target.permissions = parent.permissions.concat(target.permissions || []);
  }
}

//
// stupid little default implementation for parsing and normalizing endpoints
//
endpoints.parse = function (api, versions) {
  versions || (versions = {});
  var version = api.version = api.version || '*';
  var routes = versions[version] = versions[version] = {};

  //
  // endpoints are organized into sections
  //
  for (var sectionName in api.sections) {
    var section = api.sections[sectionName];
    updatePermissions(section);
    var endpoints = section.endpoints || {};

    for (var name in endpoints) {
      var endpoint = endpoints[name];
      endpoint.version = version;
      updatePermissions(endpoint, section);

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
};

//
// default route matcher -- looks up endpoint by semver version in path
//
endpoints.handler = function (next, config) {
  var versions = config.endpoints = endpoints.parse(config.api);

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
        // TODO: cache transform or replace with route matcher that does curlies
        var mungedRoute = route.replace(/\{(.*)\}/g, ':$1');
        if (request.method == endpoint.method && match(mungedRoute)) {
          //
          // add match details to request and invoke endpoint handler
          //
          // TODO: clean this up
          request.endpoint = endpoint;
          request.params = match.params;
          return next(request);
        }
      }
    }

    //
    // fallback handler for when a valid endpoint is not found
    //
    return next(request);
  };
};
