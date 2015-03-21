var http = require('http');
var engine = require('engine.io-stream');
var split = require('split');

//
// returns a simple server to handle api requests and events
//
module.exports = function(app) {

  var requests = app.requests;
  var events = app.events || [];

  var server = http.createServer(function(req, res) {
    for (var i in requests) {
      // TODO .test(req, cb)? or promises?
      if (requests[i].test(req))  {
        return requests[i].handler(req, res);
      }
    }

    res.statusCode = 404;
    res.end('Not Found');
  });

  function routeEvent(stream) {
    var write = stream.write;

    stream.write = function() {
      if (typeof arguments[0] == 'object') {
        arguments[0] = JSON.stringify(arguments[0]) + '\n';
      }
      write.apply(stream, arguments);
    };

    if (err) {
      return stream.write({ error: err.message });
    }

    stream
      .on('error', function(err) {
        console.error(err)
      })
      .pipe(split(JSON.parse))
      .on('data', function(data) {
        for(i in events) {
          if (events[i].test(stream, data, token)) {
            events[i].handler(stream, data, token);
          }
        }
      });
  }

  //
  // if there are events, attach the websocket server
  //
  if (events.length || Object.keys(events)) {
    engine(routeEvent).attach(server, '/server');
  }

  return server;
};
