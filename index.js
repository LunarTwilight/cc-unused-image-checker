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
        const timestamp = new Date(Date.now() - (2 * 24 * 60 * 60 * 1000)).toISOString();
        let files = [];
        for await (let json of bot.continuedQueryGen({
            action: 'query',
            generator: 'allimages',
            gaisort: 'timestamp',
            gaistart: timestamp,
            gailimit: 'max',
            prop: 'linkshere|transcludedin|fileusage|imageinfo',
            iiprop: 'timestamp|user'
        })) {
            files = files.concat(json.query.pages);
        }
        if (!files.length) {
            mwn.log('[I] No results, aborting run.');
            return;
        }
        const unusedFiles = files.filter(item => !item.linkswhere && !item.transcludedin && !item.fileusage);
        bot.batchOperation(unusedFiles, page => {
            return new Promise((resolve, reject) => {
                bot.request({
                    action: 'query',
                    list: 'users',
                    usprop: 'groups|editcount',
                    ususers: page.imageinfo.user,
                    prop: 'categories',
                    titles: page.title
                }).then(async data => {
                    if (/sysop|soap|staff|helper|global-discussions-moderator|wiki-representative|wiki-specialist/.test(data.query.users[0].groups.join())) {
                        resolve();
                    }
                    if (data.query.users[0].editcount >= 50) {
                        resolve();
                    }
                    if (data.query.pages[0].categories || data.query.pages[0].categories.length) {
                        resolve();
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
                }).catch(reject);
            });
        });
    //});
})();