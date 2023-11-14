
const config = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,

    WOLT_RESTAURANTS_BASE_URL: 'https://consumer-api.wolt.com/v1/pages/restaurants',
    WOLT_RESTAURANT_BASE_URL: 'https://consumer-api.wolt.com/order-xp/web/v1/venue/slug/{slug}/dynamic/',
    WOLT_RESTAURANT_LINK_BASE_URL: 'https://wolt.com/en/isr/{area}/restaurant/{slug}',
    WOLT_CITIES_BASE_URL: 'https://restaurant-api.wolt.com/v1/cities',

    MAX_NUM_OF_RESTAURANTS_TO_SHOW: 7,
    SUBSCRIPTION_EXPIRATION_HOURS: 4,

    WOLT_CITIES_SLUGS_SUPPORTED: ['hasharon', 'herzliya', 'tel-aviv'],

    TELEGRAM_BOT_COMMANDS: { // this is not used in the code, but it's a nice reference
        'start': 'Start the bot',
        'show': 'Show current notification registrations',
    },

    SECONDS_BETWEEN_RESTAURANTS_REFRESH_OPTIONS: {
        FAST: 60 / 2,
        MEDIUM: 60,
        SLOW: 60 * 2,
        IDLE: 60 * 15,
    },

    MONGO: {
        MONGO_DB_URL: 'mongodb+srv://wolt_reader:JJzd7SFJ2K4eXj3@playgrounds.rrd09yy.mongodb.net/',
        WOLT_DB: 'Wolt',
        COLLECTIONS: {
            SUBSCRIPTIONS: 'Subscription',
            USER: 'User',
            ANALYTIC_LOGS: 'AnalyticLogs',
        }
    }
};

module.exports = config;
