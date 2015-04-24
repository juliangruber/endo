var engine = require('engine.io-stream');
var http = require('http');
var JSONStream = require('JSONStream');
var split = require('split');
var timestamp = require('monotonic-timestamp');
var xtend = require('xtend');

var endpoints = require('./endpoints');
var errors = require('./errors');
var logs = require('./logs');


exports.headers = { 'content-type': 'application/json' };

exports.serve = function serve(config) {
  var baseHeaders = xtend(config.headers, exports.headers);

  //
  // base routing logic for invoking correct endpoint
  //
  var handler = endpoints.handler(errors.NotFound, config);

  //
  // add loggging, if requested
  //
  if (config.log) {
    handler = logs.handler(handler, config)
  }

  //
  // add error handler
  //
  handler = errors.handler(handler, config)

  function handleRequest(request, response) {

    function writeResponse(data) {
      if (!response.headersSent) {
        var headers = xtend(data.headers, baseHeaders);
        response.writeHead(data.status || 200, headers);
      }
      response.end(JSON.stringify(data.body, null, '  '));
    }

    function writeError(error) {
      logs.error('RESPONSE STREAM ERROR', error)
      //
      // normalize errors as JSON responses
      //
      writeResponse(errors.response(error));
    }

    //
    // look up handler for request
    //
    return handler(request).then(function (data) {
      var body = data.body;

      if (body && typeof body.pipe === 'function') {
        //
        // write headers and pipe body to response stream
        //
        response.writeHead(data.status || 200, xtend(data.headers, baseHeaders));
        var transform = JSONStream.stringifyObject();
        return body.pipe(transform).pipe(response);
      }

      //
      // write data with non-stream bodiy as plain response
      //
      writeResponse(data);

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

      var event = { url: request.url };

      //
      // run event request payload through standard request processing
      //
      return handler(request).then(function (data) {
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
        writeEvent({ error: error });
      });
    }

    stream.on('error', function (error) {
      logs.error('SOCKET ERROR', error);
    })
    .pipe(split(JSON.parse))
    .on('data', handleRequestEvent);
  }

  //
  // spin up http server to handle requests
  //
  var server = http.createServer(handleRequest);

  return new Promise(function (resolve, reject) {
    server.listen(config.port, config.host, function (error) {
      if (error) {
        return reject(error);
      }

      //
      // attach websocket server if requested
      //
      if (config.socketPath) {
        engine(handleEvent).attach(server, config.socketPath);
      }

      resolve(server);
    });
  });
}
