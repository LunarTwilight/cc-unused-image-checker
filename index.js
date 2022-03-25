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
                searchParams: (parts.length ? ({ ...params, ...response.continue }) : params),
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
};

//https://stackoverflow.com/a/40486595
const mergeByName = arr => lodash(arr)
    .groupBy(item => item.pageid)
    .map(group => lodash.mergeWith(...[{}].concat(group, (obj, src) => {
        if (Array.isArray(obj)) {
            return obj.concat(src);
        }
    })))
    .values()
    .value();

cron.schedule('0 * * * *', async () => {
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
        form: new URLSearchParams({
            action: 'login',
            lgname: username,
            lgpassword: password,
            lgtoken: logonToken.query.tokens.logintoken,
            format: 'json'
        }),
        headers: {
            'user-agent': pkg.name
        },
        cookieJar: jar
    });
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
    batch(unusedFiles, 10, file => new Promise(async resolve => {
        const data = await got(apiUrl, {
            searchParams: {
                action: 'query',
                list: 'users',
                ususers: file.imageinfo[0].user,
                usprop: 'groups|editcount',
                format: 'json'
            },
            headers: {
                'user-agent': pkg.name
            }
        }).json();
        if (/sysop|soap|staff|helper|global-discussions-moderator|wiki-representative|wiki-specialist/.test(data.query.users[0].groups.join()) || data.query.users[0].editcount >= 50) {
            resolve();
        }
        resolve(file);
    })).catch(console.error).then(async checkedFiles => {
        checkedFiles = checkedFiles.filter(item => Boolean(item));
        const list = lodash.chunk(checkedFiles, 10);
        list.forEach(async chunk => {
            const group = chunk.map(item => `Deleting \`${item.title}\` by \`${item.imageinfo[0].user}\``);
            await got.post(webhookUrl, {
                json: {
                    content: group.join('\n')
                },
                headers: {
                    'user-agent': pkg.name
                }
            }).json();
        });
        for (const file of checkedFiles) {
            //https://www.mediawiki.org/wiki/API:Delete#JavaScript helped here too
            const deleteReq = await got.post(apiUrl, {
                form: new URLSearchParams({
                    action: 'delete',
                    title: file.title,
                    token: csrfToken.query.tokens.csrftoken,
                    reason: 'Deleting file that has been unused for 48 hours. If this is a mistake or you still need the file, please contact [[Message_wall:Sophiedp|Sophiedp]].',
                    format: 'json'
                }),
                headers: {
                    'user-agent': pkg.name
                },
                cookieJar: jar
            }).json();
            if (deleteReq.error) {
                console.error(deleteReq.error);
            }
        }
    });
});