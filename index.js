const { username, botname, password, apiUrl } = require('./config.json');
const cron = require('node-cron');
const { mwn } = require('mwn');

require('mx-color-logger').init();

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
    //cron.schedule('0 0 * * *', () => {
        const timestamp = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
        let files = [];
        for await (let json of bot.continuedQueryGen({
            action: 'query',
            list: 'allimages',
            aisort: 'timestamp',
            aistart: timestamp,
            ailimit: 'max'
        })) {
            let res = json.query.allimages.map(item => item.name);
            files = files.concat(res);
        }
        if (!files.length) {
            mwn.log('[I] No results, aborting run.');
            return;
        }
    //});
})();