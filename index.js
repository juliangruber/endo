var engine = require('engine.io-stream');
var http = require('http');
var JSONStream = require('JSONStream');
var split = require('split');
var timestamp = require('monotonic-timestamp');
var xtend = require('xtend');

var docs = require('endoc');
var endpoints = require('./endpoints');
var errors = require('./errors');
var logs = require('./logs');


exports.serve = function serve(config) {
  //
  // bottom out with a 404
  //
  var notFound = function (request) {
    throw new errors.NotFound(request.url);
  };

  //
  // invoke default base handler or one provided with config
  //
  var handler = (config.handler || exports.handler)(notFound, config);

  //
  // routing logic for identifying the correct endpoint
  //
  handler = endpoints.handler(handler, config);

  //
  // serve api docs, if requested
  //
  if (config.docs) {
    handler = docs.handler(handler, config);
  }

  //
  // add loggging, if requested
  //
  if (config.log) {
    handler = logs.handler(handler, config);
  }

  //
  // add error handler
  //
  // TODO: cluster so we can fail hard
  handler = errors.handler(handler, config);

  function handleRequest(request, response) {

    function writeResponse(data) {
      //
      // set default content-type
      //
      var body = data.body;
      var headers = xtend(data.headers, config.headers);

      //
      // return values encoded as buffers bypass JSON encoding
      //
      if (body !== void 0 && !Buffer.isBuffer(body)) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(body, null, '  ');
      }
      //
      // only write headers if they haven't already been sent
      //
      if (!response.headersSent) {
        response.writeHead(data.status || 200, headers);
      }
      response.end(body);
    }

    function writeError(error) {
      errors.log('RESPONSE STREAM ERROR', error.stack)
      writeResponse(errors.response(error));
    }

    //
    // look up handler for request
    //
    return Promise.resolve(handler(request)).then(function (data) {
      var body = data.body;

      if (body && typeof body.pipe === 'function') {
        //
        // write headers and pipe body to response stream
        //
        response.writeHead(data.status || 200, data.headers);
        var transform = JSONStream.stringifyObject();
        return body.pipe(transform).pipe(response);
      }

      //
      // write data with non-stream bodiy as plain response
      //
      writeResponse(data);

    }).catch(writeError);
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

      var event = { url: request.url };

      //
      // run event request payload through standard request processing
      //
      return Promise.resolve(handler(request)).then(function (data) {
        var body = data.body;

        if (body && typeof body.pipe === 'function') {
          //
          // streaming responses get an associated subscription id
          //
          event.subscriptionId = timestamp();

          //
          // write event record head, providing any handler metadata
          //
          writeEvent({
            status: body.status,
            headers: body.headers
          });

          // TODO: differentiate between array-like and map-like object streams
          return body.on('data', function (chunk) {
            //
            // write data chunks to socket
            //
            writeEvent({
              key: chunk[0],
              value: chunk[1]
            });
          })
          .on('close', function () {
            //
            // write null error key to signal request end
            //
            writeEvent({ error: null });
          })
        }

        //
        // non-streaming handler responses result in a single event record
        //
        return writeEvent(data);

      })
      .catch(function (error) {
        errors.log('SOCKET STREAM ERROR', error)
        writeEvent({ error: error });
      });
    }

    stream.on('error', function (error) {
      errors.log('SOCKET ERROR', error);
    })
    .pipe(split(JSON.parse))
    .on('data', handleRequestEvent);
  }

  //
  // spin up http server to handle requests
  //
  var server = http.createServer(handleRequest);

  server.on('error', function (error) {
    errors.log('SERVER ERROR', error);
  });

  return new Promise(function (resolve, reject) {
    server.listen(config.port, config.host, function (error) {
      if (error) {
        return reject(error);
      }

      //
      // attach websocket server if requested
      //
      if (config.sockets) {
        engine(handleEvent).attach(server, config.sockets.path || '/ws');
      }

      resolve(server);
    });
  });
}

exports.handler = function (next) {
  return function (request) {
    if (request.endpoint && typeof request.endpoint.handler === 'function') {
      return request.endpoint.handler(request);
    }
    return next(request);
  }
}
