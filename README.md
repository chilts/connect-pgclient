```
 _______  _______  _        _        _______  _______ _________                
(  ____ \(  ___  )( (    /|( (    /|(  ____ \(  ____ \\__   __/                
| (    \/| (   ) ||  \  ( ||  \  ( || (    \/| (    \/   ) (                   
| |      | |   | ||   \ | ||   \ | || (__    | |         | |                   
| |      | |   | || (\ \) || (\ \) ||  __)   | |         | |                   
| |      | |   | || | \   || | \   || (      | |         | |                   
| (____/\| (___) || )  \  || )  \  || (____/\| (____/\   | |                   
(_______/(_______)|/    )_)|/    )_)(_______/(_______/   )_(                   
                                                                               
        _______  _______  _______ _________ _______  _______  _______  _______ 
       (  ____ )(  ___  )(  ____ \\__   __/(  ____ \(  ____ )(  ____ \(  ____ \
       | (    )|| (   ) || (    \/   ) (   | (    \/| (    )|| (    \/| (    \/
 _____ | (____)|| |   | || (_____    | |   | |      | (____)|| (__    | (_____ 
(_____)|  _____)| |   | |(_____  )   | |   | | ____ |     __)|  __)   (_____  )
       | (      | |   | |      ) |   | |   | | \_  )| (\ (   | (            ) |
       | )      | (___) |/\____) |   | |   | (___) || ) \ \__| (____/\/\____) |
       |/       (_______)\_______)   )_(   (_______)|/   \__/(_______/\_______)
```                                                                               

This module is aimed at taking the pain away from managing your Postgres connections from within a connect/express
app. Too many times has ```res.redirect()``` been used and left the DB connection hanging.

```bash
npm install connect-postgres
```

```connect-postgres``` helps you manage (and free) your Postgres database connections so you don't have to. It
automatically gets a client from ```node-pg``` at the start of the request and calls ```done()``` at the end of the
request to automatically return the client back to pg's pool. This way you'll never lose any clients by accidentally
not calling ```done```.

## Example ##

```javascript
var postgres = require('connect-postgres');

var dbMiddleware = postgres({
    config : {
        database : 'dbname',
        user     : 'me',
        host     : 'dbserver.internal',
    },
});

app.get(
    '/',
    dbMiddleware,
    function(req, res, next) {
        // here you can use req.db.client to perform queries
        next();
    },
    function(req, res) {
        res.send('Ok');
    }
    // req.db.done is automatically called to release the client
);
```

## What does this package solve? ##

If you are trying to do your Pg clients manually, then there are various cases which you might forget about where you
should call ```done()```. Here is an example when you have a client but call ```res.redirect()``` and forget to release
it again:

```javascript
app.get(
    '/',
    connectToDb,
    selectSomethingFromDb,
    function(req, res) {
        if ( somethingWasntFound ) {
            return res.redirect('/');
            // bang, you just lost a DB client
        }
        next();
    },
    // must remember to release here, otherwise you'll lose another DB client
    disconnectFromDb,
    function(req, res) {
        res.send('Ok');
    }
);
```

Using ```connect-postgres``` you'll be able to do this:

```javascript
app.get(
    '/',
     // middleware you created using connect-postgres
    dbMiddleware,
    selectSomethingFromDb,
    function(req, res) {
        if ( somethingWasntFound ) {
            return res.redirect('/');
            // client is automatically released
        }
        next();
    },
    function(req, res) {
        res.send('Ok');
    }
    // client is automatically released
);
```

## Usage ##

Once you have setup and called your ```connect-postgres``` middleware, you Postgres client is available on the
```req``` object as follows:

```javascript
// the node-pg client
req.db.client

// the done function which node-pg needs to return the client to the pool
req.db.done

// boolean to show us whether we are in the middle of a transaction
req.db.transaction
```

In general, you should only ever use the ```req.db.client``` property of ```req.db```.

## Options ##

* config - the database connection params as defined in [node-postgres](https://github.com/brianc/node-postgres/wiki/Client#parameters)
* transaction - (default: false) States whether to BEGIN and COMMIT a transaction for you.
* log - (default: no-op) a function to call with log messages to help with debugging (usually dev only)

## Examples ##

### Connect to DB for Every Request ###

You may or may not want to do this, but it shows a good example for starters:

```javascript
var postgres = require('connect-postgres');

app.use(postgres({
    config : {
        database : 'dbname',
        user     : 'me',
        host     : 'dbserver.internal',
    },
}));
```

If you would like ```connect-postgres``` to BEGIN and COMMIT a transaction for you, then just pass the
```transaction``` param as ```true``` into the options.

```javascript
var postgres = require('connect-postgres');

app.use(postgres({
    config : {
        database : 'dbname',
        user     : 'me',
        host     : 'dbserver.internal',
    },
    transaction : true,
}));
```

### Connect to the DB within Specific Routes ###

The database clients are released back to ```node-pg``` even if the request ends in ```res.send()```,
```res.redirect()```, ```res.json()```, ```res.render()``` or even in error ```next(err)```.

For example:

```javascript
// Postgres middleware which gets a Pg client and releases it after
// the request has been fulfilled.
var connectToDb = postgres({
    config : {
        database : 'dbname',
        user     : 'me',
        host     : 'dbserver.internal',
    },
});

// Postgres middleware which gets a Pg client, starts a transaction
// and commits and releases it after the request has been fulfilled.
var connectToDbWithTransaction = postgres({
    config : {
        database : 'dbname',
        user     : 'me',
        host     : 'dbserver.internal',
    },
    transaction : true,
});

// a route which always succeeds - Pg client is released ok
app.get(
    '/',
    connectToDb,
    function(req, res) {
        res.send('My Homepage - Under Construction!');
    }
);

// a route which redirects 50% of the time - Pg client is released ok
app.get(
    '/random',
    connectToDb,
    function(req, res) {
        if ( Math.random() < 0.5 ) {
            // even though we're not calling node-pg's done(), connect-postgres does it for us even here
            res.redirect('/');
        }
        else {
            res.send('My Homepage - Under Construction!');
        }
    }
);

// a route which dies 50% of the time - Pg client is released ok
app.get(
    '/roulette',
    connectToDbWithTransaction,
    function(req, res, next) {
        // this is how you get your freshly minted Postgres client
        req.db.client("SELECT now()", next);
    },
    function(req, res, next) {
        if ( Math.random() < 0.5 ) {
            // even though we're not calling node-pg's done(), connect-postgres does it for us even here
            next(new Error("Die die die!"));
        }
        else {
            res.send('My Homepage - Under Construction!');
        }
    }
);
```

## How it Works ##

Using [brianc](https://github.com/brianc/)'s excellent [pg](https://npmjs.org/package/pg) library, we connect to the
database and store both the ```client``` and the ```done``` function onto the ```req``` so that we can use the client
in our routes, but also automatically call ```done``` when the request has finished.

```connect-postgres``` works much like connect's ```session``` middleware in that it wraps ```res.end()``` so that we
can get control both before and after the request has been fulfilled, which allows us to give the client back to pg's
pool automatically no matter what happened during the request.

## Caveat ##

When you use ```connect-postgres``` to give you a client and automatically start a transaction, if the request ends up
in error, the transaction still has ```COMMIT``` performed. In this error case, I think ```ROLLBACK``` should be called
instead but I'm not yet sure how to detect if the request is in the error state.

(Note: remember that this is *after* the request has been fulfilled, which is after any error middleware has been run.)

# Author #

Written by [Andrew Chilton](http://chilts.org/) - [Blog](http://chilts.org/blog/) -
[Twitter](https://twitter.com/andychilton).

# License #

* [Copyright 2013 Andrew Chilton.  All rights reserved.](http://chilts.mit-license.org/2013/)

(Ends)
