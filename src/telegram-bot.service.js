const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const mongoService = require('./monog.service');
const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });
const { get: _get } = require('lodash');
const woltService = require('./wolt.service');

const ANALYTIC_EVENT_NAMES = {
    START: 'START',
    SHOW: 'SHOW',
    SEARCH: 'SEARCH',
    SUBSCRIBE: 'SUBSCRIBE',
    UNSUBSCRIBE: 'UNSUBSCRIBE',
    SUBSCRIPTION_FULFILLED: 'SUBSCRIPTION_FULFILLED',
    SUBSCRIPTION_FAILED: 'SUBSCRIPTION_FAILED',
    ERROR: 'ERROR',
}

// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$ worker $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
let restaurantsList = [];

(async function startInterval() {
    await refreshRestaurants();
    const subscriptions = await mongoService.getActiveSubscriptions();
    // get the names of the restaurants that are online
    if (subscriptions.length) {
        await alertSubscribers(subscriptions);
    }

    await cleanExpiredSubscriptions();
    const secondsToNextRefresh = getSecondsToNextRefresh();
    setTimeout(async () => {
        await startInterval();
    }, secondsToNextRefresh * 1000);
})();

async function refreshRestaurants() {
    try {
        const restaurants = await woltService.getRestaurantsList();
        if (restaurants.length) {
            restaurantsList = [...restaurants];
            console.log('Restaurants list was refreshed successfully');
        }
    } catch (err) {
        console.log('refreshRestaurants::err', err);
    }
}

function alertSubscribers(subscriptions) {
    try {
        const restaurantsWithSubscriptionNames = subscriptions.map(subscription => subscription.restaurant);
        const filteredRestaurants = restaurantsList.filter(restaurant => restaurantsWithSubscriptionNames.includes(restaurant.name) && restaurant.isOnline);
        const promisesArr = [];
        filteredRestaurants.forEach(restaurant => {
            const relevantSubscriptions = subscriptions.filter(subscription => subscription.restaurant === restaurant.name);
            relevantSubscriptions.forEach(subscription => {
                const restaurantLinkUrl = woltService.getRestaurantLink(restaurant);
                const inlineKeyboardButtons = [
                    { text: restaurant.name, url: restaurantLinkUrl },
                ];
                const inlineKeyboardMarkup = getInlineKeyboardMarkup(inlineKeyboardButtons);
                const replyText = `${restaurant.name} is now open!, go ahead and order!`;
                promisesArr.push(sendMessage(subscription.chatId, replyText, { reply_markup: inlineKeyboardMarkup }));
                promisesArr.push(mongoService.archiveSubscription(subscription.chatId, subscription.restaurant));
                promisesArr.push(mongoService.sendAnalyticLog(ANALYTIC_EVENT_NAMES.SUBSCRIPTION_FULFILLED, { chatId: subscription.chatId, restaurant: restaurant.name }));
            });
        });
        return Promise.all(promisesArr);
    } catch (err) {
        console.log('alertSubscribers::err', err);
    }
}

async function cleanExpiredSubscriptions() {
    try {
        const expiredSubscriptions = await mongoService.getExpiredSubscriptions();
        const promisesArr = []
        expiredSubscriptions.forEach(subscription => {
            promisesArr.push(mongoService.archiveSubscription(subscription.chatId, subscription.restaurant));
            const currentHour = new Date().getHours();
            if (currentHour >= 8 && currentHour <= 23) { // let user know that subscription was removed only between 8am to 11pm
                promisesArr.push(sendMessage(subscription.chatId, `Subscription for ${subscription.restaurant} was removed since it didn't open for the last ${config.SUBSCRIPTION_EXPIRATION_HOURS} hours`));
            }
            promisesArr.push(mongoService.sendAnalyticLog(ANALYTIC_EVENT_NAMES.SUBSCRIPTION_FAILED, { chatId: subscription.chatId, restaurant: subscription.restaurant }));
        });
        return Promise.all(promisesArr);
    } catch (err) {
        console.log('cleanExpiredSubscriptions::err', err);
    }

}

function getSecondsToNextRefresh() {
    const currentHour = new Date().getHours();
    switch (currentHour) {
        case 0:
        case 1:
        case 2:
        case 3:
            return config.SECONDS_BETWEEN_RESTAURANTS_REFRESH_OPTIONS.SLOW;
        case 4:
        case 5:
        case 6:
        case 8:
        case 9:
        case 10:
        case 7:
            return config.SECONDS_BETWEEN_RESTAURANTS_REFRESH_OPTIONS.IDLE;
        case 11:
        case 12:
        case 13:
        case 14:
        case 15:
            return config.SECONDS_BETWEEN_RESTAURANTS_REFRESH_OPTIONS.FAST;
        case 16:
        case 17:
        case 18:
        case 19:
            return config.SECONDS_BETWEEN_RESTAURANTS_REFRESH_OPTIONS.MEDIUM;
        case 20:
        case 21:
        case 22:
        case 23:
            return config.SECONDS_BETWEEN_RESTAURANTS_REFRESH_OPTIONS.FAST;
    }
}

// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$ bot interceptors $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
bot.onText(/\/start/, async (message, match) => {
    const { chatId, firstName, lastName, telegramUserId, username } = getMessageData(message);
    const logBody = `/\start :: chatId: ${chatId}, firstname: ${firstName}, lastname: ${lastName}`;
    try {
        await setBotTyping(chatId);

        console.log(`${logBody} - start`);
        const replyText = '' +
            'Hello :)\n' +
            'Please Enter the restaurant name you want to check.\n' +
            'It can be in English.\n' +
            'To show current notification registrations please write: /show\n';
        await sendMessage(chatId, replyText);
        mongoService.saveUserDetails({ chatId, telegramUserId, firstName, lastName, username });
        mongoService.sendAnalyticLog(ANALYTIC_EVENT_NAMES.START, { restaurant: '', chatId })
        console.log(`${logBody} - success`);
    } catch (err) {
        console.error(`${logBody} - error - ${JSON.stringify(err)}`);
        await sendMessage(chatId, `Sorry, but something went wrong`);
    }
});

bot.onText(/\/show/, async (message, match) => {
    const { chatId, firstName, lastName } = getMessageData(message);
    const logBody = `/\show :: chatId: ${chatId}, firstname: ${firstName}, lastname: ${lastName}`;
    try {
        await setBotTyping(chatId);
        console.log(`${logBody} - start`);
        const subscriptions = await mongoService.getActiveSubscriptions(chatId);

        if (!subscriptions.length) {
            const replyText = 'You don\'t have any active subscriptions yet';
            return await sendMessage(chatId, replyText);
        }

        const promisesArr = subscriptions.map(subscription => {
            const inlineKeyboardButtons = [
                { text: 'Remove', callback_data: `remove - ${subscription.restaurant}` },
            ];
            const inlineKeyboardMarkup = getInlineKeyboardMarkup(inlineKeyboardButtons);
            return sendMessage(chatId, subscription.restaurant, { reply_markup: inlineKeyboardMarkup });
        });
        await Promise.all(promisesArr);
        mongoService.sendAnalyticLog(ANALYTIC_EVENT_NAMES.SHOW, { restaurant: '', chatId })
        console.log(`${logBody} - success`);
    } catch (err) {
        console.error(`${logBody} - error - ${JSON.stringify(err)}`);
        await sendMessage(chatId, `Sorry, but something went wrong`);
    }
});

bot.on('message', async (msg) => {
    const { chatId, firstName, lastName, text: restaurant } = getMessageData(msg);

    // prevent start and show to be processed also here
    if (restaurant.startsWith('/')) {
        return;
    }

    const logBody = `message :: chatId: ${chatId}, firstname: ${firstName}, lastname: ${lastName}, restaurant: ${restaurant}`;
    console.log(`${logBody} - start`);

    try {
        await setBotTyping(chatId);
        mongoService.sendAnalyticLog(ANALYTIC_EVENT_NAMES.SEARCH, { restaurant, chatId });

        const filteredRestaurants = getFilteredRestaurants(restaurant);
        if (!filteredRestaurants.length) {
            const replyText = `I am sorry, I didn\'t find any restaurants matching your search - "${restaurant}"`;
            return await sendMessage(chatId, replyText);
        }
        const restaurants = await woltService.enrichRestaurants(filteredRestaurants);
        const inlineKeyboardButtons = restaurants.map(restaurant => {
            const isAvailableComment = restaurant.isOnline ? 'Open' : restaurant.isOpen ? 'Busy' : 'Closed';
            return {
                text: `${restaurant.name} - ${isAvailableComment}`,
                callback_data: restaurant.name,
            };
        });
        const inlineKeyboardMarkup = getInlineKeyboardMarkup(inlineKeyboardButtons);
        const replyText = 'Choose one of the above restaurants so I can notify you when it\'s online';
        await sendMessage(chatId, replyText, { reply_markup: inlineKeyboardMarkup });
        console.log(`${logBody} - success`);
    } catch (err) {
        console.error(`${logBody} - error - ${JSON.stringify(err)}`);
        await sendMessage(chatId, `Sorry, but something went wrong`);
    }
});

bot.on('callback_query', async (callbackQuery) => {
    const { callbackQueryId, chatId, date, firstName, lastName, data: restaurant } = getCallbackQuery(callbackQuery);
    const logBody = `callback_query :: chatId: ${chatId}, firstname: ${firstName}, lastname: ${lastName}, restaurant: ${restaurant}`;
    console.log(`${logBody} - start`);

    try {
        await setBotTyping(chatId);

        const restaurantName = restaurant.replace('remove - ', '');
        const existingSubscription = await mongoService.getSubscription(chatId, restaurantName);

        if (restaurant.startsWith('remove - ')) {
            return await handleCallbackRemoveSubscription(chatId, restaurantName, existingSubscription);
        }

        await handleCallbackAddSubscription(chatId, restaurant, existingSubscription);
        console.log(`${logBody} - success`);
    } catch (err) {
        console.error(`${logBody} - error - ${JSON.stringify(err)}`);
        await sendMessage(chatId, `Sorry, but something went wrong`);
    }
});


// $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$ helper functions $$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$
async function handleCallbackAddSubscription(chatId, restaurant, existingSubscription) {
    let replyText = '';
    let form = {};
    if (existingSubscription) {
        replyText = '' +
            `It seems you already have a subscription for ${restaurant} is open.\n\n` +
            `Let\'s wait a few minutes - it might open soon.`;
    } else {
        const restaurantDetails = restaurantsList.find(r => r.name === restaurant) || null;;
        if (restaurantDetails && restaurantDetails.isOnline) {
            replyText = '' +
                `It looks like ${restaurant} is open now\n\n` +
                `Go ahead and order your food :)`;
            const restaurantLinkUrl = woltService.getRestaurantLink(restaurantDetails);
            const inlineKeyboardButtons = [
                { text: restaurantDetails.name, url: restaurantLinkUrl },
            ];
            const inlineKeyboardMarkup = getInlineKeyboardMarkup(inlineKeyboardButtons);
            form = { reply_markup: inlineKeyboardMarkup };
        } else {
            replyText = `No Problem, you will be notified once ${restaurant} is open.\n\n` +
                `FYI: If the venue won\'t open soon, registration will be removed after ${config.SUBSCRIPTION_EXPIRATION_HOURS} hours.\n\n` +
                `You can search and register for another restaurant if you like.`;
            await mongoService.addSubscription(chatId, restaurant);
        }
    }

    mongoService.sendAnalyticLog(ANALYTIC_EVENT_NAMES.SUBSCRIBE, { restaurant, chatId });
    await sendMessage(chatId, replyText, form);
}

async function handleCallbackRemoveSubscription(chatId, restaurant, existingSubscription) {
    let replyText = '';
    if (existingSubscription) {
        const restaurantToRemove = restaurant.replace('remove - ', '');
        await mongoService.archiveSubscription(chatId, restaurantToRemove);
        replyText = `Subscription for ${restaurantToRemove} was removed`;
    } else {
        replyText = `It seems you don\'t have a subscription for ${restaurant}.\n\n` +
            `You can search and register for another restaurant if you like`;
    }
    mongoService.sendAnalyticLog(ANALYTIC_EVENT_NAMES.UNSUBSCRIBE, { restaurant, chatId });
    return await sendMessage(chatId, replyText);
}

function getMessageData(message) {
    return {
        chatId: _get(message, 'chat.id', ''),
        telegramUserId: _get(message, 'from.id', ''),
        firstName: _get(message, 'from.first_name', ''),
        lastName: _get(message, 'from.last_name', ''),
        username: _get(message, 'from.username', ''),
        text: _get(message, 'text', '').toLowerCase(),
        date: _get(message, 'date', ''),
    };
}

function getCallbackQuery(callbackQuery) {
    return {
        callbackQueryId: _get(callbackQuery, 'id', ''),
        chatId: _get(callbackQuery, 'from.id', ''),
        date: _get(callbackQuery, 'message.date', ''),
        firstName: _get(callbackQuery, 'from.first_name', ''),
        lastName: _get(callbackQuery, 'from.last_name', ''),
        data: _get(callbackQuery, 'data', ''), // restaurant name
    };
}

function getInlineKeyboardMarkup(inlineKeyboardButtons) {
    const inlineKeyboard = { inline_keyboard: [] };
    inlineKeyboardButtons.forEach(button => inlineKeyboard.inline_keyboard.push([button]));
    return JSON.stringify(inlineKeyboard);
}

function getFilteredRestaurants(searchInput) {
    const restaurants = [...restaurantsList];
    return restaurants.filter(restaurant => {
        return restaurant.name.toLowerCase().includes(searchInput.toLowerCase());
    }).slice(0, config.MAX_NUM_OF_RESTAURANTS_TO_SHOW);
}

async function sendMessage(chatId, messageText, form = {}) {
    try {
        await bot.sendMessage(chatId, messageText, form);
    } catch (err) {
        console.log('sendMessage::err', err);
    }
}

async function setBotTyping(chatId, form = {}) {
    try {
        await bot.sendChatAction(chatId, 'typing', form);
        await sleep(1000);
    } catch (err) {
        console.log('sendMessage::err', err);
    }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
