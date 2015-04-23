var engine = require('engine.io-stream');
var http = require('http');
var timestamp = require('monotonic-timestamp');
var paramify = require('paramify')
var semver = require('semver');
var split = require('split');
var url = require('url');
var xtend = require('xtend');

//
// garbage little utils for routes (as a stopgap until we gets better routing)
//
function parseEndpoints(api, versions) {
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
      parseEndpoints(api.previous, versions)
    }
  }

  return versions;
}

//
// 404 error class
//
function NotFoundError(request) {
  this.status = 404;
  this.message = 'Not Found: ' + request.url;
  this.stack = Error().stack;
}
NotFoundError.prototype = Object.create(Error.prototype);
NotFoundError.prototype.name = 'NotFoundError';
NotFoundError.prototype.constructor = NotFoundError

//
// crappy little default router that parsers semver from url paths
//
function defaultRouter(api) {
  var versions = parseEndpoints(api);

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
          // add params to request and return match context
          //
          request.params = match.params;
          return {
            request: request,
            handler: endpoint.handler
          };
        }
      }
    }

    throw new NotFoundError(request);
  };
}

var defaultHeaders = { 'content-type': 'application/json' };

exports.serve = function serve(config) {
  var baseHeaders = xtend(config.headers, defaultHeaders);
  var router = defaultRouter(config.api);

  //
  // logic for identifying and invoking the correct endpoint
  //
  function process(request) {
    //
    // resolve as promise for error trapping
    // resolves to request for convenient chaining
    //
    return Promise.resolve(request)
      .then(router)
      .then(function (route) {
        return route.handler(route.request);
      })
      .then(exports.normalizeResponse)
  }

  function handleRequest(request, response) {

    function writeJSON(data) {
      var headers = xtend(data.headers, baseHeaders);
      response.writeHead(data.status || 200, headers);
      response.end(JSON.stringify(data.body, null, '  '));
    }

    function writeError(error) {
      //
      // normalize errors as JSON responses
      //
      writeJSON({
        status: error.status || 500,
        body: {
          name: error.name,
          message: error.message,
          // TODO: only write stack in dev mode
          stack: error.stack
        }
      });
    }

    //
    // look up handler for request
    //
    return process(request).then(function (data) {
      if (typeof data.pipe !== 'function') {
        //
        // write non-stream data as JSON response
        //
        return writeJSON(data);
      }
      //
      // extract metadata from own-props on stream, if available
      //
      var status = data.hasOwnProperty('status') && data.status;
      var headers = data.hasOwnProperty('headers') && data.headers;
      response.writeHead(status || 200, xtend(headers, baseHeaders));

      //
      // stream responses get piped to response stream
      //
      data.pipe(response);
    })
    .catch(writeError)
  }

  //
  // handler for websocket requests
  //
  function handleEvent(stream) {

    //
    // helper for normalizing and serializing event data
    //
    function handleRequestEvent(request) {

      function writeEvent(data) {
        stream.write(JSON.stringify(xtend(event, data)) + '\n');
      }

      function writeError(error) {
        writeEvent({ error: error });
      }

      var event = {
        url: request.url
      };

      //
      // run event request payload through standard request processing
      //
      return process(request).then(function (data) {

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
      .on('data', handleRequestEvent);
  }

  //
  // spin up http server to handle requests
  //
  var server = http.createServer(handleRequest);

  return Promise.resolve(null).then(function () {
    server.listen(config.port, config.host, function (error) {
      if (error) {
        throw error;
      }

      //
      // attach websocket server if requested
      //
      if (config.socketPath) {
        engine(handleEvent).attach(server, config.socketPath);
      }

      return server;
    });
  });
}

//
// all response normalization/validation logic should happen in one place
//
exports.normalizeResponse = function (data) {
  // TODO
  return data;
};
