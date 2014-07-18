var fs = require('fs-extra'),
    path = require('path'),
    util = require('util'),
    async = require('async'),
    stdio = require('stdio'),
    colors = require('colors'),
    rt = require('read-torrent'),
    u = require('./util');


/*
 * Options
 */

var opts = stdio.getopt({
    from: {
        key: 'f',
        args: 1,
        description: 'Path to directory containing source files',
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
}, '[FILE1] [FILE2] ...');


if (!opts.args || !opts.args.length)
    u.exit('I want one or more torrents as last argument');

opts.from = u.rcwd(opts.from);
opts.to = u.rcwd(opts.to);
opts.args = u.rcwd(opts.args);


u.log('Files: ' + opts.args);
u.log('From: ' + opts.from);
u.log('To: ' + opts.to);
u.log('Symlink galore starting now', 'rainbow');


/*
 * Run everything
 */

var jobs = [
    async.apply(checkPath, opts.from),
    async.apply(checkPath, opts.to)
];

opts.args.forEach(function(file) {
    jobs.push(async.apply(checkPath, file));
    jobs.push(async.apply(rt, file));
});

jobs.push(async.apply(help.walk, opts.from, function(ep, stat, callback) {
    callback(null, {
        path: ep,
        size: stat.size
    });
}));


async.series(jobs, function(err, data) {
    if (err) return u.exit(err);

    var files = data.pop();
    var jobs = [];

    data.forEach(function(d) {
        if (!d) return;
        jobs.push(async.apply(torrentHandler, d, files));
    });

    u.log('Opened and parsed ' + jobs.length + ' torrent(s) successfully', 'green');
    u.log('Walked source directory, found ' + files.length + ' file(s)', 'green');


    async.series(jobs, function(err) {
        if (err) return u.exit(err);
        u.log('Finished!', 'green');
    });
});


/*
 * Process torrent
 */

function torrentHandler(torrent, files, callback) {
    u.log('=========================================================================================');
    u.log('=========================================================================================');
    u.log('Processing torrent: ' + torrent.name + ' (' + torrent.infoHash + ')');
    u.log('=========================================================================================');
    u.log('=========================================================================================');

    async.series([
        async.apply(createSymlinkSkel, torrent.files),
        async.apply(findFileMatches, torrent.files, files)
    ],
    function(err, data) {
        if (err) {
            u.log('WARNING: ' + err, 'red');
            return callback(null);
        }

        var matches = data[1];
        var matchCount = 0;

        for (var i in matches) {
            if (matches[i].length) {
                matchCount++;
                continue;
            }
            u.log('WARNING: Could not find a match for file "' + i + '"', 'red');
        }

        u.log('Found matches for ' + matchCount + '/' + torrent.files.length + ' files');
        if (!matchCount) {
            u.log('WARNING: Nothing to be done, no matches found', 'red');
            return callback(null);
        }


        var links = [];
        for (var i in matches) {
            if (!matches[i].length) continue;
            links.push({
                from: matches[i][0],
                to: path.join(args.to, i)
            });
        }

        u.lns(links, opts.test, function(err) {
            if (err) u.exit(err);

            u.log('Done deal!');
            callback(null);
        });
    });
}


/*
 * Check if path exists
 */

function checkPath(file, callback) {
    fs.exists(file, function(exists) {
        if (!exists) return callback('File does not exist');
        callback(null);
    });
}


/*
 * Create symlink directory skeleton
 */

function createSymlinkSkel(files, callback) {
    u.log('Creating symlink directory skeleton...');

    if (!files.length) return callback(null);
    if (opts.test) return callback(null);
    var jobs = [];

    files.forEach(function(file) {
        var fdn = path.join(dest, path.dirname(file.path));
        jobs.push(async.apply(fs.mkdirp, fdn, 0775));
    });

    async.parallel(jobs, callback);
}


/*
 * Match source files with torrent files
 */

function findFileMatches(tfs, sfs, callback) {
    var results = {};

    tfs.forEach(function(tf) {
        results[tf.path] = [];

        sfs.forEach(function(sf) {
            if (tf.length !== sf.size) return;
            results[tf.path].push(sf.path);
        });
    });

    var refs = [];
    for (var i in results) {
        var result = results[i];
        if (result.length > 1) return callback('More than one match for file "' + i + '", cannot safely continue');

        for (var x in result) {
            var file = result[x];
            if (refs.indexOf(file) !== -1) return callback('Source file "' + file + '" matched more than one time, cannot safely continue');

            refs.push(file);
        }
    }

    callback(null, results);
}
