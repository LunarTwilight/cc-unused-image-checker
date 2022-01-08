const { username, botname, password, apiUrl } = require('./config.json');
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
    //cron.schedule('0 0 * * *', () => {
        const timestamp = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
        let files = [];
        for await (let json of bot.continuedQueryGen({
            action: 'query',
            generator: 'allimages',
            gaisort: 'timestamp',
            gaistart: timestamp,
            gailimit: 'max',
            prop: 'linkshere|transcludedin|fileusage'
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
                console.log(JSON.stringify(page));
                resolve();
            });
        });
    //});
})();