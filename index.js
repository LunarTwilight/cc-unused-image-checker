const { username, botname, password, apiUrl } = require('./config.json');
const got = require('got');
const { mwn } = require('mwn');

require('mx-color-logger').init();

const run = async () => {
    const bot = await mwn.init({
        apiUrl,
        username: username + '@' + botname,
        password,
        defaultParams: {
            assert: 'user'
        }
    });
}