require('dotenv').config()
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

console.log('node version', process.version);

require('./telegram-bot.service');

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,user,session-token,application,x-zisession,x-ziid,if-modified-since,Cache-Control,x-datadog-trace-id,x-datadog-parent-id,x-datadog-origin,x-datadog-sampling-priority,x-datadog-sampled');
    res.setHeader('Access-Control-Allow-Credentials', true);

    if (req.method === 'OPTIONS') {
        res.status( 200 );
        res.end();
    } else {
        next();
    }
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.get('/', async (req, res, next) => {
    res.status(200).send({ success: true });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log(`wolt bot app:: listening on port ${port} :: http://localhost:${port}`);
});
