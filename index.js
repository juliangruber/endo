var engine = require('engine.io-stream');
var http = require('http');
var timestamp = require('monotonic-timestamp');
var paramify = require('paramify')
var semver = require('semver');
var split = require('split');
var url = require('url');
var xtend = require('xtend');

function notFound(request) {
  // TODO: custom Error instance
  var error = new Error('Not Found: ' + request.url);
  error.status = 400;
  return error;
}

//
// garbage little utils for routes (as a stopgap until gets better routing)
//
function parseRoutes(api, versions) {
  var routes = versions = versions = {};

  if (!api.noSemver) {
    routes = versions[api.version || '*'] = versions[api.version || '*'] = {};
  }

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
    if (!api.noSemver && api.previous) {
      parseRoutes(api.previous, versions)
    }
  }

  return versions;
}

//
// crappy little default router that parsers semver from url paths
//
function defaultRouter(api) {
  var routes = parseRoutes(api);

  return function (request) {

    var path = request.url;
    var components = url.parse(path).pathname.split('/').slice(1);
    var candidates = {};

    if (api.noSemver) {
      candidates[''] = routes;
    }
    else {
      var range = decodeURIComponent(components.shift())
      var validRange = semver.validRange(range);
      try {
        Object.keys(routes).forEach(function (version) {
          if (semver.satisfies(version, validRange)) {
            candidates[version] = routes[version];
          }
        });
      }
      catch (e) {
        // TODO: rethrow for invalid version?
        return null;
      }
    }

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
          return [ endpoint, match ];
        }
      }
    }
  }
}

var defaultHeaders = { 'content-type': 'application/json' };

//
// stupid simple server, invokes request handlers, expects stream or JSON body
//
module.exports = function serve (config, callback) {
  var router = defaultRouter(config.api);
  var baseHeaders = xtend(config.headers, defaultHeaders);

  function getHeaders(data) {
    return xtend(data.headers, baseHeaders);
  }

  function routeRequest(request, response) {

    function writeResponse(data) {
      response.writeHead(data.status || 200, getHeaders(data));
      response.end(JSON.stringify(data.body)); 
    }

    function writeError(error) {
      //
      // normalize errors as responses
      //
      error.status || (error.status = 500);
      error.body || (error.body = error.message);
      writeResponse(error);
    }

    //
    // look up handler for request
    //
    var route = router(request);
    if (!route) {
      return writeError(notFound(request));
    }

    //
    // add match params to request and invoke handler
    //
    request.params = route[1].params;
    Promise.resolve(route[0].handler(request)).then(function (data) {

      //
      // stream bodies get piped directly to response, passing through metadata
      //
      if (typeof data.pipe === 'function') {
        response.writeHead(data.status || 200, getHeaders(data));
        data.pipe(response)
      }
      else {
        writeResponse(data);
      }

    }).catch(writeError);
  }

  //
  // handler for websocket requests
  //
  function routeEvent(stream) {

    //
    // helper for normalizing and serializing event data
    //

    function handleEvent(request) {
      var event = {
        url: request.url
      };

      function writeEvent(data) {
        stream.write(JSON.stringify(xtend(event, data)) + '\n');
      }

      function writeError(error) {
        writeEvent({ error: error });
      }

      //
      // run event request payload through standard request routing
      //
      var route = router(request);

      if (!route) {
        return writeEvent({
          url: request.url,
          error: notFound(request)
        });
      }

      //
      // add match params to request and invoke handler
      //
      request.params = route[1].params;
      Promise.resolve(route[0].handler(request)).then(function (data) {

        //
        // non-streaming handler responses result in a single event record
        //
        if (typeof data.pipe !== 'function') {
          return writeEvent(data);
        }

        //
        // streaming responses get an associated subscription id
        //
        event.subscriptionId = timestamp();

        //
        // write event record head, providing any handler metadata
        //
        writeEvent({
          status: data.status,
          headers: data.headers
        });

        //
        // write data chunks to socket
        //
        data.on('data', function (chunk) {
          writeEvent({ body: chunk });
        });

        //
        // write null error key to signal end
        //
        data.on('close', function () {
          writeEvent({ error: null });
        });

        //
        // pass along error, signaling stream end
        //
        data.on('error', writeError);

      }).catch(writeError);
    }

    stream
      .on('error', function (error) {
        // TODO: proper logging
        console.error('ERROR: ' + error);
      })
      .pipe(split(JSON.parse))
      .on('data', handleEvent);
  }

  //
  // spin up http server to handle requests
  //
  var server = http.createServer(routeRequest);

  server.listen(config.port, config.host, callback);

  //
  // attach websocket server if requested
  //
  if (config.socketPath) {
    engine(routeEvent).attach(server, config.socketPath);
  }
};
