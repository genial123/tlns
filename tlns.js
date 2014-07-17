var fs = require('fs-extra'),
    path = require('path'),
    util = require('util'),
    async = require('async'),
    rt = require('read-torrent'),
    argv = process.argv.slice(2);


/*
 * Helper functions
 */

function exit(m) {
    log(util.format('Error: %s', m));
    process.exit(1);
}

function pad(i, n) {
    i = i.toString();
    while (i.length < n)
        i = '0' + i;
    return i;
}

function log(m) {
    var date = new Date();
    var hrs = pad(date.getHours(), 2);
    var min = pad(date.getMinutes(), 2);
    var sec = pad(date.getSeconds(), 2);
    console.log(util.format('[%s:%s:%s] %s', hrs, min, sec, m));
}


/*
 * Arguments
 */

var src = argv[0],
    dest = argv[1],
    files = argv.slice(2),
    walkan = 10;

if (!src) exit('First argument needs to be the source of binary files');
if (!dest) exit('Second argument needs to be the symlink destination');
if (!files.length) exit('Third argument needs to be a torrent-file');

for (var i in files) files[i] = path.join(__dirname, files[i]);
src = (src.indexOf('/') === 0) ? src : path.join(__dirname, src);
dest = (dest.indexOf('/') === 0) ? dest : path.join(__dirname, dest);


log('Files: ' + files);
log('Source: ' + src);
log('Dest: ' + dest);
log('Hello there handsome :)');


/*
 * Run everything
 */

var jobs = [
    async.apply(checkPath, src),
    async.apply(checkPath, dest)
];

files.forEach(function(file) {
    jobs.push(async.apply(checkPath, file));
    jobs.push(async.apply(rt, file));
});

jobs.push(async.apply(walk, src));


async.series(jobs, function(err, data) {
    if (err) return exit(err);

    var files = data.pop();
    var jobs = [];

    data.forEach(function(d) {
        if (!d) return;
        jobs.push(async.apply(torrentHandler, d, files));
    });

    log('Opened and parsed ' + jobs.length + ' torrent(s) successfully');
    log('Walked source directory, found ' + files.length + ' file(s)');


    async.series(jobs, function(err) {
        if (err) return exit(err);
        log('Finished!');
    });
});


/*
 * Process torrent
 */

function torrentHandler(torrent, files, callback) {
    log('=========================================================================================');
    log('=========================================================================================');
    log('Processing torrent: ' + torrent.name + ' (' + torrent.infoHash + ')');
    log('=========================================================================================');
    log('=========================================================================================');

    async.series([
        async.apply(createSymlinkSkel, torrent.files),
        async.apply(findFileMatches, torrent.files, files)
    ],
    function(err, data) {
        if (err) {
            log('WARNING: ' + err);
            return callback(null);
        }

        var matches = data[1];
        var matchCount = 0;

        for (var i in matches) {
            if (matches[i].length) {
                matchCount++;
                continue;
            }
            log('WARNING: Could not find a match for file "' + i + '"');
        }

        log('Found matches for ' + matchCount + '/' + torrent.files.length + ' files');
        if (!matchCount) {
            log('WARNING: Nothing to be done, no matches found');
            return callback(null);
        }


        createSymlinks(matches, function(err) {
            if (err) exit(err);
            log('Done deal!');
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
 * Find files recursively by walking
 */

function walk(dir, callback) {
    var results = [];

    fs.readdir(dir, function(err, list) {
        if (err) return callback(err);

        var count = list.length;
        if (!count) return callback(null, results);

        list.forEach(function(file) {
            var fp = path.join(dir, file);

            fs.stat(fp, function(err, stat) {
                if (err) return callback(err);

                if (stat.isDirectory()) {
                    walk(fp, function(err, res) {
                        results = results.concat(res);
                        if (results.length >= walkan) {
                            log('Walking found ' + walkan + ' files');
                            walkan *= 10;
                        }

                        if (!--count)
                            callback(null, results);
                    });
                }
                else {
                    results.push({
                        path: fp,
                        size: stat.size
                    });
                    if (!--count)
                        callback(null, results);
                }
            });
        });
    });
}


/*
 * Create symlink directory skeleton
 */

function createSymlinkSkel(files, callback) {
    log('Creating symlink directory skeleton...');

    if (!files.length) return callback(null);
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


/*
 * Create symlinks for matches
 */

function createSymlinks(matches, callback) {
    var jobs = [];

    for (var i in matches) {
        if (!matches[i].length) continue;
        var sf = matches[i][0];
        var tf = path.join(dest, i);

        jobs.push(async.apply(function(sf, tf, callback) {
            fs.exists(tf, function(exists) {
                if (exists) {
                    log('WARNING: Can not create symlink "' + tf + '", file already exists');
                    return callback(null);
                }

                fs.symlink(sf, tf, function(err) {
                    if (err) return callback(err);

                    log('Symlink created: ' + sf + ' => ' + tf);
                    callback(null);
                });
            });
        }, sf, tf));
    }

    async.parallel(jobs, callback);
}
