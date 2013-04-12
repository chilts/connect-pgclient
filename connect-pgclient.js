// ----------------------------------------------------------------------------
//
// connect-pgclient.js - Connect middleware to manage Postgres connections.
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

function pgclient(options) {
    var options = options || { transaction : false };

    var log = options.log || function() {};

    // return the (configured) middleware
    return function pgclient(req, res, next) {
        log('connect-pgclient: entry');
        // if we already have a DB, then just next()
        if (req.db) {
            log('connect-pgclient: req.db already exists');
            return next();
        }

        // proxy end() to end the transaction (if needed) and release the client
        var origEnd = res.end;
        res.end = function(data, encoding) {
            log('connect-pgclient: wrapper res.end() called');
            res.end = origEnd;

            // if there is nothing to do, just call the original res.end()
            if (!req.db) {
                log('connect-pgclient: no req.db, calling res.end()');
                return res.end(data, encoding);
            }

            var finish = function() {
                log('connect-pgclient: releasing client, calling res.end()');
                req.db.done();
                delete req.db;
                res.end(data, encoding);
            };

            // if there is no transaction, then just finish up
            if ( !req.db.transaction ) {
                log('connect-pgclient: no transaction in progress');
                return finish();
            }

            // we have a transaction, so commit it
            log('connect-pgclient: calling COMMIT on the current transaction');

            // ToDo: presumably, if this req is in error, we want to ROLLBACK here  instead! (But how do we detect?)
            req.db.client.query('COMMIT', function(err) {
                if (err) {
                    // what do we do here ... log it?
                    log('connect-pgclient: error when calling COMMIT ' + err);
                    console.warn(err);
                }
                log('connect-pgclient: transaction finished');
                finish();
            });
        };

        // get a client to the db
        log('connect-pgclient: getting new Pg client');
        pg.connect(options.config, function(err, client, done) {
            if (err) {
                log('connect-pgclient: error when getting new client');
                return next(err);
            }

            log('connect-pgclient: got client');

            // save the db stuff to the request
            req.db = {
                client       : client,
                done         : done,
                transaction  : false,
            };

            if ( !options.transaction ) {
                log('connect-pgclient: no transaction needed');
                // no transaction needed
                return next();
            }

            // start a transaction
            log('connect-pgclient: starting transaction');
            req.db.client.query('BEGIN', function(err) {
                if (err) {
                    log('connect-pgclient: error when starting transaction');
                    done();
                    return next(err);
                }
                log('connect-pgclient: transaction started');
                req.db.transaction = true;
                next();
            });
        });
    }
}

// ----------------------------------------------------------------------------
// expose the middleware

exports = module.exports = pgclient;

// ----------------------------------------------------------------------------
