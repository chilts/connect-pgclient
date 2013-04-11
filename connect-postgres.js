// ----------------------------------------------------------------------------
//
// connect-postgres.js - Connect middleware to manage Postgres connections.
//
// Copyright 2013 Andrew Chilton <andychilton@gmail.com>
//
// ----------------------------------------------------------------------------
//
// options = {
//     config      : { ... }, // same as -> https://github.com/brianc/node-postgres/wiki/Client#parameters
//     transaction : <boolean>, // default: false, whether to start and finish a transaction
// };
//
// ----------------------------------------------------------------------------

var pg = require('pg');

// ----------------------------------------------------------------------------

function postgres(options) {
    var options = options || { transaction : false };

    var log = options.log || function() {};

    // return the (configured) middleware
    return function postgres(req, res, next) {
        log('connect-postgres: entry');
        // if we already have a DB, then just next()
        if (req.db) {
            log('connect-postgres: req.db already exists');
            return next();
        }

        // proxy end() to end the transaction (if needed) and release the client
        var origEnd = res.end;
        res.end = function(data, encoding) {
            log('connect-postgres: wrapper res.end() called');
            res.end = origEnd;

            // if there is nothing to do, just call the original res.end()
            if (!req.db) {
                log('connect-postgres: no req.db, calling res.end()');
                return res.end(data, encoding);
            }

            var finish = function() {
                log('connect-postgres: releasing client, calling res.end()');
                req.db.done();
                delete req.db;
                res.end(data, encoding);
            };

            // if there is no transaction, then just finish up
            if ( !req.db.transaction ) {
                log('connect-postgres: no transaction in progress');
                return finish();
            }

            // we have a transaction, so commit it
            log('connect-postgres: calling COMMIT on the current transaction');

            // ToDo: presumably, if this req is in error, we want to ROLLBACK here  instead! (But how do we detect?)
            req.db.client.query('COMMIT', function(err) {
                if (err) {
                    // what do we do here ... log it?
                    log('connect-postgres: error when calling COMMIT ' + err);
                    console.warn(err);
                }
                log('connect-postgres: transaction finished');
                finish();
            });
        };

        // get a client to the db
        log('connect-postgres: getting new Pg client');
        pg.connect(options.config, function(err, client, done) {
            if (err) {
                log('connect-postgres: error when getting new client');
                return next(err);
            }

            log('connect-postgres: got client');

            // save the db stuff to the request
            req.db = {
                client       : client,
                done         : done,
                transaction  : false,
            };

            if ( !options.transaction ) {
                log('connect-postgres: no transaction needed');
                // no transaction needed
                return next();
            }

            // start a transaction
            log('connect-postgres: starting transaction');
            req.db.client.query('BEGIN', function(err) {
                if (err) {
                    log('connect-postgres: error when starting transaction');
                    done();
                    return next(err);
                }
                log('connect-postgres: transaction started');
                req.db.transaction = true;
                next();
            });
        });
    }
}

// ----------------------------------------------------------------------------
// expose the middleware

exports = module.exports = postgres;

// ----------------------------------------------------------------------------
