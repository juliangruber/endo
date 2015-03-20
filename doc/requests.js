var path = require('path');
var xtend = require('xtend');
var ecstatic = require('ecstatic');

function parsePermissions(permissions) {
  var map = {};
  for (var name in permissions) {
    map[name] = {
      name: name,
      title: permissions[name].title || name,
      description: permissions[name].description || '',
    };
  }
  return map;
}

function parseExamples(examples) {
  var results = [];
  for (var title in examples) {
    var example = examples[title];
    results.push({
      title: title,
      type: example.syntax || 'string',
      content: typeof example === 'string' ? example : example.content
    });
  }
  return results;
}

function parseFieldGroup(fields, group) {
  var results = [];

  for (var key in fields) {
    var field = fields[key];
    var result = {
      group: group,
      type: field.type,
      field: key,
      description: field.description || ''
    };
    // if ('required' in field) {
    //   result.optional = !field.required;
    // }
    results.push(result);
  }

  return results;
}

function parseFields(fields, prefix) {
  fields || (fields = {});
  var value = { fields: {} };

  //
  // append group name to provided group prefix if it ends with a space
  //
  var appendName = prefix[prefix.length - 1] === ' ';

  for (var name in fields) {
    var group = prefix + (appendName && name || '');
    value.fields[group] = parseFieldGroup(fields[name], group);
  }

  return value;
}

function parseEndpoint(target, context) {
  var value = {};

  value.name = context.name;
  value.version = context.version;

  value.group = context.sectionName || '';
  value.groupTitle = context.section && context.section.title || value.group;

  value.permission = (target.permissions || []).map(function (value) {
    return typeof value === 'string' ? context.permissions[value] : value
  }).filter(function (value) {
    return value
  });

  value.title = target.title;
  value.description = target.description;
  value.type = context.type || (target.method || 'GET').toUpperCase();
  value.url = context.path || target.path;

  value.parameter = parseFields(target.params, 'Parameter');
  value.success = parseFields(target.success, 'Success ');
  value.error = parseFields(target.error, 'Error ');

  value.examples = parseExamples(target.examples || {});

  return value;
}

function parseApi(api, results) {
  results || (results = []);

  var context = {};
  context.version = api.version;
  context.permissions = parsePermissions(api.permissions || {});

  //
  // endpoints and events organized by section
  //
  for (var sectionName in api.sections) {
    context.sectionName = sectionName;
    var section = context.section = api.sections[sectionName] || {};

    // clear any context values that may have been written
    context.path = '';
    context.type = '';

    var endpoints = section.endpoints || {};
    for (var name in endpoints) {
      context.name = name;
      results.push(parseEndpoint(endpoints[name], context));
    }

    var events = section.events || {};
    for (var name in events) {
      context.name = context.path = '#' + sectionName + '/' + name;
      context.type = 'EVENT';
      results.push(parseEndpoint(events[name], context));
    }
  }

  //
  // parse previous api data if present
  //
  if (api.previous) {
    parseApi(api.previous, results);
  }

  return results;
}

function parseProfile(config) {
  //
  // conservatively remap properties manually for apidocjs config
  //
  var api = config.api || {};
  var profile = xtend({}, api, config);

  profile.name || (profile.name = '');
  profile.title = config.doc.title || profile.title || profile.name;

  var basePath = (config.prefix || '') + (api.prefix || '');
  profile.url = (config.doc.url || '') + basePath;

  profile.header = config.doc.header;
  profile.footer = config.doc.footer;
  profile.template = {
    withCompare: !!api.previous,
    withGenerator: false
  };

  return profile;
}

//
// creates handlers to docs for a provided api definition
//
module.exports = function (config) {
  config || (config = {});
  var api = config.api = config.api || {};
  var doc = config.doc = config.doc || {};

  var docPath = (config.prefix || '') + (doc.prefix || '');
  var API_DATA = 'define(' + JSON.stringify({ api: parseApi(api) }) + ')';
  var API_PROJECT = 'define(' + JSON.stringify(parseProfile(config)) + ')';

  //
  // static asset server for map doc template
  //
  var templateAssets = ecstatic({
    root: path.join(__dirname, 'template'),
    cache: 0
  });

  return {
    test: function (req, res) {
      return req.url.indexOf(docPath) === 0;
    },
    handler: function (req, res) {
      var url = req.url.substring(docPath.length);

      if (url.indexOf('/api_data.js') === 0) {
        res.statusCode = 200;
        res.end(API_DATA);
      }
      else if (url.indexOf('/api_project.js') === 0) {
        res.statusCode = 200;
        res.end(API_PROJECT);
      }
      else {
        req.url = url;
        templateAssets(req, res);
      }
    }
  }
}
