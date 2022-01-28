const { username, password, apiUrl, webhookUrl } = require('./config.json');
const cron = require('node-cron');
const got = require('grb');
const batch = require('batch-iterator');
const lodash = require('lodash');
const tough = require('tough-cookie');
const jar = new tough.CookieJar();
const pkg = require('./package.json');
require('merida').init();

//With help from https://github.com/siddharthvp/mwn/blob/3082515/src/bot.ts#L1477 and Doru's code
const continuedQuery = async params => {
    let response = { continue: {} };
    let parts = [];
    while (true) {
        if (response.continue) {
            response = await got(apiUrl, {
                searchParams: (!parts.length ? params : Object.assign({}, params, response.continue)),
                headers: {
                    'user-agent': pkg.name
                }
            }).json();
            if (response.error) {
                throw new Error(response.error);
            }
            parts = parts.concat(response.query.pages);
        } else {
            return parts;
        }
    }
}

//https://stackoverflow.com/a/40486595
const mergeByName = arr => {
    return lodash(arr)
        .groupBy(item => item.pageid)
        .map(function (group) {
            return lodash.mergeWith.apply(lodash, [{}].concat(group, function (obj, src) {
                if (Array.isArray(obj)) {
                    return obj.concat(src);
                }
            }))
        })
        .values()
        .value();
}

//cron.schedule('0 0 */2 * *',
(async () => {
    const results = await continuedQuery({
        action: 'query',
        generator: 'allimages',
        gaisort: 'timestamp',
        gaistart: (new Date(Date.now() - (4 * 24 * 60 * 60 * 1000)).toISOString()),
        gaiend: (new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)).toISOString()),
        gailimit: 'max',
        prop: 'linkshere|transcludedin|fileusage|imageinfo|categories',
        /*cllimit: 1,
        fulimit: 1,
        lhlimit: 1,
        tilimit: 1,*/
        formatversion: 2,
        format: 'json'
    });
    if (!results.length) {
        return console.log('No results, aborting');
    }
    const files = mergeByName(results);
    const unusedFiles = files.filter(item => !item.linkswhere && !item.transcludedin && !item.fileusage && !item.categories);
    if (!unusedFiles.length) {
        return console.log('No unused files, aborting');
    }
    //with help from https://www.mediawiki.org/wiki/API:Delete#JavaScript
    const logonToken = await got(apiUrl, {
        searchParams: {
            action: 'query',
            meta: 'tokens',
            type: 'login',
            format: 'json'
        },
        headers: {
            'user-agent': pkg.name
        },
        cookieJar: jar
    }).json();
    await got.post(apiUrl, {
        searchParams: {
            action: 'login',
            lgname: username,
            lgpassword: password,
            lgtoken: logonToken.query.tokens.logintoken,
            format: 'json'
        },
        headers: {
            'user-agent': pkg.name
        },
        cookieJar: jar
    }).json();
    const csrfToken = await got(apiUrl, {
        searchParams: {
            action: 'query',
            meta: 'tokens',
            format: 'json'
        },
        headers: {
            'user-agent': pkg.name
        },
        cookieJar: jar
    }).json();
    batch(unusedFiles, async file => {
        const data = await got(apiUrl, {
            searchParams: {
                action: 'query',
                list: 'users',
                ususers: file.imageinfo[0].user,
                usprop: 'groups|editcount'
            },
            headers: {
                'user-agent': pkg.name
            }
        }).json();
        if (/sysop|soap|staff|helper|global-discussions-moderator|wiki-representative|wiki-specialist/.test(data.query.users[0].groups.join()) || data.query.users[0].editcount >= 50) {
            return;
        }
        await got.post(webhookUrl, {
            body: {
                content: `Deleting ${file.title} uploaded by ${file.imageinfo[0].user} uploaded ${file.imageinfo[0].timestamp}`
            },
            headers: {
                'user-agent': pkg.name
            }
        }).json();
        //https://www.mediawiki.org/wiki/API:Delete#JavaScript helped here too
        const deleteReq = await got.post(apiUrl, {
            body: {
                action: 'delete',
                title: file.title,
                token: csrfToken,
                format: 'json'
            },
            headers: {
                'user-agent': pkg.name
            },
            cookieJar: jar
        }).json();
        if (deleteReq.error) {
            console.error(deleteReq.error)
        }
    }).catch(console.error);
})();