var fs = require('fs-extra'),
    util = require('util'),
    path = require('path'),
    async = require('async'),
    stdio = require('stdio'),
    colors = require('colors'),
    u = require('./util');


/*
 * Options
 */

var opts = stdio.getopt({
    from: {
        key: 'f',
        args: 1,
        description: 'Path to directory containing seeded files',
        mandatory: true
    },
    to: {
        key: 't',
        args: 1,
        description: 'Path to symlink target directory',
        mandatory: true
    },
    test: {
        description: 'Will not actually make changes to the file system'
    }
});


if (opts.test)
    u.log('Test mode activated', 'green');

opts.from = u.rcwd(opts.from);
opts.to = u.rcwd(opts.to);


u.log('From: ' + opts.from);
u.log('To: ' + opts.to);
u.log('Clearing out non-symlinked files starting now', 'rainbow');


/*
 * Run everything
 */

var jobs = [
    async.apply(u.checkp, opts.from),
    async.apply(u.checkp, opts.to)
];

var regx = new RegExp(util.format('^%s/', opts.from));

jobs.push(async.apply(u.walk, opts.from, function(ep, stat) {
    if (!stat.isSymbolicLink()) return ep.replace(regex, '');
}, fs.lstat));


async.series(jobs, function(err, data) {
    if (err) return u.exit(err);

    var files = data.pop();
    if (!files.length) return u.log('Done, found no files to symlink', 'green');

    u.log('Found ' + files.length + ' file(s)', 'green');
    var jobs = [];

    files.forEach(function(file) {
        var base = path.dirname(file);
        var from = path.join(opts.from, file);
        var to = path.join(opts.to, file);

        if (!opts.test && (base != '.'))
            jobs.push(async.apply(fs.mkdirp, path.join(opts.to, base)));

        // Copy file
        jobs.push(async.apply(function(from, to, callback) {
            if (opts.test) {
                u.log('Would copy: ' + from + ' => ' + to, 'green');
                return callback(null);
            }

            fs.copy(from, to, function(err) {
                if (err) return callback(err);

                u.log('File copied: ' + from + ' => ' + to, 'green');
                callback(null);
            });
        }, from, to));

        // Remove old file
        jobs.push(async.apply(function(from, callback) {
            if (opts.test) {
                u.log('Would delete: ' + from, 'green');
                return callback(null);
            }

            fs.unlink(from, function(err) {
                if (err) return callback(err);

                u.log('File deleted: ' + from, 'green');
                callback(null);
            });
        }, from));

        // Create symlink
        jobs.push(async.apply(function(from, to, callback) {
            if (opts.test) {
                u.log('Would symlink: ' + to + ' => ' + from, 'green');
                return callback(null);
            }

            u.lns(from, to, function(err) {
                if (err) u.log('WARNING: ' + err, 'red');
                else u.log('Symlink created: ' + to + ' => ' + from, 'green');
                
                callback(null);
            });
        }, to, from));
    });


    async.series(jobs, function(err) {
        if (err) return u.exit(err);
        u.log('Done deal!');
    });
});
