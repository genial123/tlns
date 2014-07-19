var util = require('util'),
    path = require('path'),
    fs = require('fs-extra'),
    async = require('async'),
    colors = require('colors');


/*
 * Pad numbers with zeros
 */

var pad = exports.pad = function(i, n) {
    i = i.toString();
    while (i.length < n)
        i = '0' + i;
    return i;
};


/*
 * Resolve cwd if necessary
 */

var rcwd = exports.rcwd = function(paths) {
    if (Object.prototype.toString.call(paths) != '[object Array]')
        return (paths.indexOf('/') === 0) ? paths : path.join(process.cwd(), paths);

    var results = [];
    paths.forEach(function(p) {
        results.push((p.indexOf('/') === 0) ? p : path.join(process.cwd(), p));
    });
    return results;
};


/*
 * Check path existance
 */

var checkp = exports.checkp = function(p, callback) {
    fs.exists(p, function(ex) {
        if (!ex) return callback('Path does not exist: "' + p + '"');
        callback(null);
    });
};


/*
 * Colored logging
 */

var log = exports.log = function(m, color) {
    var date = new Date();
    var hrs = pad(date.getHours(), 2);
    var min = pad(date.getMinutes(), 2);
    var sec = pad(date.getSeconds(), 2);
    var str = util.format('[%s:%s:%s] %s', hrs, min, sec, m);

    if (color) color.split('.').forEach(function(col) { str = str[col]; });
    console.log(str);
};


/*
 * Exit with error
 */

var exit = exports.exit = function(m) {
    log(util.format('Error: %s', m), 'red');
    process.exit(1);
};


/*
 * Find files by walking recursively
 */

var walk = exports.walk = function(dir, fn, statFn, callback) {
    if (!statFn) {
        statFn = fn;
        fn = function(ep) { return ep; };
    }
    if (!callback) {
        callback = statFn;
        statFn = fs.stat;
    }

    var wAnnounce = 10;

    var walkd = function(target, cb) {
        fs.readdir(target, function(err, list) {
            if (err) return cb(err);

            var count = list.length;
            if (!count) return cb(null, []);
            var results = [];

            list.forEach(function(entry) {
                var entryPath = path.join(target, entry);

                statFn(entryPath, function(err, stat) {
                    if (err) return cb(err);

                    if (!stat.isDirectory()) {
                        var res = fn(entryPath, stat);
                        if (res) results.push(res);
                        if (!--count) cb(null, results);
                        return;
                    }

                    walkd(entryPath, function(err, res) {
                        if (err) return cb(err);

                        results = results.concat(res);
                        if (results.length >= wAnnounce) {
                            log('Walking found ' + wAnnounce + ' files');
                            wAnnounce *= 10;
                        }

                        if (!--count) cb(null, results);
                    });
                });
            });
        });
    };

    walkd(dir, callback);
};


/*
 * Symlink
 */

var lns = exports.lns = function(from, to, callback) {
    var jobs = [
        function(callback) {
            fs.exists(from, function(ex) {
                if (ex) return callback(null);
                callback('Cannot create symlink, source "' + from + '" does not exist');
            });
        },
        function(callback) {
            fs.exists(to, function(ex) {
                if (!ex) return callback(null);
                callback('Cannot create symlink, destination "' + to + '" already exists');
            });
        }
    ];

    jobs.push(async.apply(fs.symlink, from, to));
    async.series(jobs, callback);
};
