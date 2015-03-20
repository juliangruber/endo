var url = require('url');

function getEvents(api) {
  var events = [];

  //
  // walk api sections for event definitions
  //
  for (var sectionName in api.sections) {
    var section = api.sections[sectionName];
    events = events.concat(section.events || []);
  }

  return events;
}

//
// creates handlers to serve a provided api definition
//
module.exports = function (config) {
  config || (config = {});
  var api = config.api || {};
  var events = api.events || [];

  return {

    test: function(stream, data) {
      //
      // stream data should contain matching api name and version keys
      //
      return data && data.apiVersion == api.version && data.apiName == api.name;
    },

    handler: function(stream, data) {
      //
      // iterate api events and test for an appropriate handler
      //
      for (var i = 0, length = events.length; i < length; ++i) {
        var event = events[i];
        if (event.test(data)) {
          return event.handler(stream, data);
        }
      }
    }

  };
}
