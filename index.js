var engine = require('engine.io-stream');
var http = require('http');
var timestamp = require('monotonic-timestamp');
var paramify = require('paramify')
var semver = require('semver');
var split = require('split');
var url = require('url');
var xtend = require('xtend');

function notFound(request) {
  return {
    status: 404,
    path: request.url,
    message: 'Not Found: ' + request.url
  };
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

//
// stupid simple server, invokes request handlers, expects stream or JSON body
//
module.exports = function serve (config, callback) {
  var headers = xtend({ 'content-type': 'application/json' }, config.headers);
  var router = defaultRouter(config.api);

  function getMetadata(request, body) {
    var meta = {};
    meta.path = request.path || request.url;
    meta.streaming = body && typeof body.pipe === 'function';
    meta.body = meta.streaming ? null : body;

    //
    // get metadata from stream body or prototype of naked JSONable body
    //
    var base = meta.streaming ? body : body.__proto__ || {};
    meta.status = base.status || 200;
    meta.headers = xtend({}, headers, base.headers);
    return meta;
  }

  function routeRequest(request, response) {

    var route = router(request);

    if (!route) {
      var error = notFound(request)
      response.writeHead(error.status, headers);
      return response.end(JSON.stringify(error));
    }

    //
    // add match params to request and invoke handler
    //
    request.params = route[1].params;
    Promise.resolve(route[0].handler(request)).then(function (body) {

      var meta = getMetadata(request, body);
      response.writeHead(meta.status, meta.headers);

      //
      // stream bodies get piped directly to response, passing through metadata
      //
      if (meta.streaming) {
        body.pipe(response)
      }
      else {
        response.end(JSON.stringify(body));
      }

    }).catch(function (error) {
      response.writeHead(error.status || 500, headers);
      response.end(JSON.stringify(error));
    });
  }

  //
  // handler for websocket requests
  //
  function routeEvent(stream) {

    function writeEvent(payload) {
      stream.write(JSON.stringify(payload) + '\n');
    }

    function handleEvent(request) {
      //
      // run event request payload through standard request routing
      //
      var route = router(request);

      if (!route) {
        return writeEvent(notFound(request));
      }

      //
      // add match params to request and invoke handler
      //
      request.params = route[1].params;
      Promise.resolve(route[0].handler(request)).then(function (body) {

        var meta = getMetadata(request, body);

        //
        // non-streaming handler responses result in a single event record
        //
        if (!meta.streaming) {
          return writeEvent(meta);
        }

        //
        // streaming responses get an associated subscription id
        //
        meta.subscriptionId = timestamp();
        writeEvent(meta);

        //
        // write data chunks to socket
        //
        data.on('data', function (data) {
          meta.body = data;
          writeEvent(meta);
        });

        //
        // write null error key to signal end
        //
        data.on('close', function () {
          meta.error = meta.body = null;
          writeEvent(meta);
        });

        //
        // pass along error, signaling stream end
        //
        data.on('error', function (error) {
          meta.body = null;
          meta.error = error;
          meta.status = error.status || 500;
          writeEvent(meta);
        });

      }).catch(function (error) {
        //
        // pass along unhandled exceptions
        //
        writeEvent({
          status: error.status || 500,
          path: request.path || request.url,
          error: error
        });
      });
    }

    stream
      .on('error', function (error) {
        // TODO: logging
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
