# endo

Light-weight server for authoring simple self-documenting HTTP and WebSocket APIs.


## JSON-orientation

We assume handlers deal explicitly in JSON unless otherwise noted. Endpoint "handlers" are function which take an HTTP request object and return a stream or a JSON-able object.

Handlers can override status `status` and/or `headers` by adding keys to the returned stream object, or adding them to the prototype of a returned value intended for JSON serialization. Overriding the value's `toJSON` method allows additional control over serialization behavior. While this makes it possible for handlers arbitrary control over the shape of responses, these design choices are intended to optimize for simplifying the construction of typical JSON endpoints.


## WebSockets vs. HTTP

All endpoints can be exposed over HTTP, WebSockets, or both. APIs for WebSockets interaction are symmetrical with HTTP interaction, and handlers are completely agnostic to the underlying transport -- the same handler logic is invoked, the exact same way, regardless of which transport is being used.


## Procedures vs. Streams

Handlers returning JSON-serialized values are analogous to RPC calls. When defining the API, the "arguments" of this call can be defined by a request body schema, and the return value defined by a response body schema. The request and response schemas can have any structure, and the handler should adhere to them (we could even enforce this at runtime in dev environments).

TODO: should we special-case strings (and/or buffers) and bypass JSON serialization for these? If so, should we also write a reasonable `Content-Type` if one's not provided?

Response values for JSON serialization may optionally be returned as promises. Alternatively, handlers may return a stream object that can be piped to the WebSocket or HTTP response stream.


## Subscriptions vs. Queries


## Semver Endpoint Paths

The leading path component represents API version by default. It is parsed as a semver range, allowing detailed control over version ranges when requesting a particular API endpoint. These paths are all valid ranges which include the `1.0.0` version of an API (along with many more):

```
/v1/some/endpoint
/1.0.0/some/endpoint
/v1.0.0/some/endpoint
/1.x/some/endpoint
/v1.x/some/endpoint
/~1.0.0/some/endpiont
/^1.0/some/endpiont
```

TODO: should we redirect to a canonical versioned URL?
