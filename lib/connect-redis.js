/*!
 * Connect - Redis
 * Copyright(c) 2012 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var debug = require('debug')('connect:redis');

/**
 * One day in seconds.
 */

var oneDay = 86400;

/**
 * Return the `RedisStore` extending `express`'s session Store.
 *
 * @param {object} express session
 * @return {Function}
 * @api public
 */

module.exports = function(session){

  /**
   * Express's session Store.
   */

  var Store = session.Store;

  /**
   * Initialize RedisStore with the given `options`.
   *
   * @param {Object} options
   * @api public
   */

  function RedisStore(options) {
    var self = this;

    options = options || {};
    Store.call(this, options);
    this.prefix = null == options.prefix
      ? 'sess:'
      : options.prefix;

    if (options.url) {
      var url = require('url').parse(options.url);
      if (url.protocol === 'redis:') {
        if (url.auth) {
          var userparts = url.auth.split(":");
          options.user = userparts[0];
          if (userparts.length === 2) {
            options.pass = userparts[1];
          }
        }
        options.host = url.hostname;
        options.port = url.port;
        if (url.pathname) {
          options.db   = url.pathname.replace("/", "", 1);
        }
      }
    }

    this.client = options.client || new require('redis').createClient(options.port || options.socket, options.host, options);

    if (options.pass) {
      this.client.auth(options.pass, function(err){
        if (err) throw err;
      });    
    }

    this.ttl =  options.ttl;

    if (options.db) {
      self.client.select(options.db);
      self.client.on("connect", function() {
        self.client.send_anyways = true;
        self.client.select(options.db);
        self.client.send_anyways = false;
      });
    }

    self.client.on('error', function () { self.emit('disconnect'); });
    self.client.on('connect', function () { self.emit('connect'); });
  };

  /**
   * Inherit from `Store`.
   */

  RedisStore.prototype.__proto__ = Store.prototype;

  /**
   * Attempt to fetch session by the given `sid`.
   *
   * @param {String} sid
   * @param {Function} fn
   * @api public
   */

  RedisStore.prototype.get = function(sid, fn){
    sid = this.prefix + sid;
    debug('GET "%s"', sid);
    this.client.get(sid, function(err, data){
      if (err) return fn(err);
      if (!data) return fn();
      var result;
      data = data.toString();
      debug('GOT %s', data);
      try {
        result = JSON.parse(data); 
      } catch (err) {
        return fn(err);
      }
      return fn(null, result);
    });
  };

  /**
   * Commit the given `sess` object associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Session} sess
   * @param {Function} fn
   * @api public
   */

  RedisStore.prototype.set = function(sid, sess, fn){
    sid = this.prefix + sid;
    try {
      var maxAge = sess.cookie.maxAge
        , ttl = this.ttl
        , sess = JSON.stringify(sess);

      ttl = ttl || ('number' == typeof maxAge
          ? maxAge / 1000 | 0
          : oneDay);

      debug('SETEX "%s" ttl:%s %s', sid, ttl, sess);
      this.client.setex(sid, ttl, sess, function(err){
        err || debug('SETEX complete');
        fn && fn.apply(this, arguments);
      });
    } catch (err) {
      fn && fn(err);
    } 
  };
	/**
	 * Touch the given `sess` object associated with the given `sid`. so the ttl update
	 *
	 * @param {String} sid
	 * @param {Session} sess
	 * @param {Function} fn
	 * @api public
	 */

	RedisStore.prototype.touch = function(sid, sess, fn){
		sid = this.prefix + sid;
		try {
			var maxAge = sess.cookie.maxAge
				, ttl = this.ttl
				, sess = JSON.stringify(sess);

			ttl = ttl || ('number' == typeof maxAge
				? maxAge / 1000 | 0
				: oneDay);

			debug('EXPIRE "%s" ttl:%s %s', sid, ttl, sess);
			this.client.expire(sid, ttl, function(err){
				err || debug('EXPIRE complete');
				fn && fn.apply(this, arguments);
			});
		} catch (err) {
			fn && fn(err);
		}
	};
  /**
   * Destroy the session associated with the given `sid`.
   *
   * @param {String} sid
   * @api public
   */

  RedisStore.prototype.destroy = function(sid, fn){
    sid = this.prefix + sid;
    this.client.del(sid, fn);
  };

  return RedisStore;
};
