const config = require('./config');
const { MongoClient } = require('mongodb');
const client = new MongoClient(config.MONGO.MONGO_DB_URL);

client
    .connect()
    .then(() => console.log('Connected successfully to mongo server'))
    .catch((err) => console.error('Failed to connect to mongo server', err));

const SUBSCRIPTION_MODEL = {
    chatId: Number,
    restaurant: String,
    isActive: Boolean,
    createdAt: Number,
}

const USER_MODEL = {
    telegramUserId: Number,
    chatId: Number,
    firstName: String,
    lastName: String,
    usernam: String,
}

const ANALYTIC_LOG_MODEL = {
    eventName: String,
    restaurant: String,
    isActive: Boolean,
    createdAt: Number,
}

const subscriptionCollection = client.db(config.MONGO.WOLT_DB).collection(config.MONGO.COLLECTIONS.SUBSCRIPTIONS);
const userCollection = client.db(config.MONGO.WOLT_DB).collection(config.MONGO.COLLECTIONS.USER);
const analyticLogCollection = client.db(config.MONGO.WOLT_DB).collection(config.MONGO.COLLECTIONS.ANALYTIC_LOGS);

async function getActiveSubscriptions(chatId = null) { // messages: [ messageText: string, channelId: number, fromChannelName: string ]
    try {
        const filter = { isActive: true };
        if (chatId) filter.chatId = chatId;
        const cursor = subscriptionCollection.find(filter);
        return getMultipleResults(cursor);
    } catch (err) {
        console.log('getActiveSubscriptions::err', err);
        return [];
    }
}

async function getSubscription(chatId, restaurant) { // messages: [ messageText: string, channelId: number, fromChannelName: string ]
    const filter = { chatId, restaurant, isActive: true };
    return subscriptionCollection.findOne(filter);
}

async function addSubscription(chatId, restaurant) { // messages: [ messageText: string, channelId: number, fromChannelName: string ]
    const subscription = {
        chatId,
        restaurant,
        isActive: true,
        createdAt: new Date().getTime(),
    };
    return subscriptionCollection.insertOne(subscription);
}

function archiveSubscription(chatId, restaurant) { // messages: [ messageText: string, channelId: number, fromChannelName: string ]
    const filter = { chatId, restaurant, isActive: true };
    const updateObj = { $set: { isActive: false } };
    return subscriptionCollection.updateOne(filter, updateObj);
}

async function getExpiredSubscriptions() { // messages: [ messageText: string, channelId: number, fromChannelName: string ]
    const validLimitTimestamp = new Date().getTime() - (config.SUBSCRIPTION_EXPIRATION_HOURS * 60 * 60 * 1000);
    const filter = { isActive: true, createdAt: { $lt: validLimitTimestamp } };
    const cursor = subscriptionCollection.find(filter);
    return getMultipleResults(cursor);
}

async function getMultipleResults(cursor) {
    const results = [];
    for await (const doc of cursor) {
        results.push(doc);
    }
    return results;
}

async function saveUserDetails({ telegramUserId, chatId, firstName, lastName, username }) {
    try {
        const existingUser = await userCollection.findOne({ telegramUserId });
        if (existingUser) {
            return;
        }
        const user = { telegramUserId, chatId, firstName, lastName, username };
        return userCollection.insertOne(user);
    } catch (err) {
        console.log('saveUserDetails::err', err);
    }
}

function sendAnalyticLog(eventName, { chatId, restaurant }) {
    const log = {
        chatId,
        restaurant,
        eventName,
        // message,
        // error,
        createdAt: new Date().getTime(),
    };
    return analyticLogCollection.insertOne(log);
}
module.exports = {
    getActiveSubscriptions,
    getSubscription,
    addSubscription,
    archiveSubscription,
    getExpiredSubscriptions,
    saveUserDetails,
    sendAnalyticLog,
}
