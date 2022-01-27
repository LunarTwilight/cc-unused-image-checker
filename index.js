const { username, botname, password, apiUrl, webhookUrl } = require('./config.json');
const cron = require('node-cron');
const { mwn } = require('mwn');

require('merida').init();

(async () => {
    const bot = await mwn.init({
        apiUrl,
        username: username + '@' + botname,
        password,
        defaultParams: {
            assert: 'user'
        },
        userAgent: 'cc-unused-image-checker'
    });
    //cron.schedule('0 0 */2 * *', () => {
        const timestamps = {
            start: new Date(Date.now() - (4 * 24 * 60 * 60 * 1000)).toISOString(),
            end: new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)).toISOString()
        };
        let files = {};
        for await (let json of bot.continuedQueryGen({
            action: 'query',
            list: 'allimages',
            aisort: 'timestamp',
            aistart: timestamps.start,
            aiend: timestamps.end,
            ailimit: 'max',
            prop: 'linkshere|transcludedin|fileusage|imageinfo|categories',
            cllimit: 1,
            fulimit: 1,
            lhlimit: 1,
            tilimit: 1
        })) {
            if (json.continue === '||linkshere|transcludedin|imageinfo|categories') {
                for (const page of Object.values(json.query.pages)) {
                    files[page.pageid] = Object.assign({}, files[page], page);
                }
            } else {
                files = Object.assign({}, files, json.query.pages);
            }
        }
        if (!Object.keys(files).length) {
            mwn.log('[I] No results, aborting run.');
            return;
        }
        for (const file of files) {
            if (file.title.includes('SKATER')) {
                console.log(JSON.stringify(file));
            }
        }
        const unusedFiles = files.filter(item => !item.linkswhere && !item.transcludedin && !item.fileusage && !item.categories);
        bot.batchOperation(unusedFiles, page => {
            return new Promise((resolve, reject) => {
                bot.request({
                    action: 'query',
                    list: 'users',
                    ususers: page.imageinfo[0].user,
                    usprop: 'groups|editcount'
                }).then(async data => {
                    if (/sysop|soap|staff|helper|global-discussions-moderator|wiki-representative|wiki-specialist/.test(data.query.users[0].groups.join())) {
                        return resolve(true);
                    }
                    if (data.query.users[0].editcount >= 50) {
                        return resolve(true);
                    }
                    console.log(JSON.stringify(page));
                    /*await bot.delete(page.title, 'Deleting image that hasn\'t been used in 48 hours, if this is a mistake please contact [[Message wall:Sophiedp|Sophiedp]].');
                    await bot.rawRequest({
                        method: 'post',
                        url: webhookUrl,
                        data: {
                            content: `Deleting ${page.title} uploaded by ${page.imageinfo[0].user} uploaded ${page.imageinfo[0].timestamp}`
                        },
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });*/
                    resolve(true);
                }).catch(reject);
            });
        });
    //});
})();