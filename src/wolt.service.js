const axios = require('axios');
const config = require('./config');

async function getRestaurantsList() {
    try {
        const cities = await getCitiesList();
        const promises = cities.map(city => {
            const { LAT, LON } = city;
            const url = `${config.WOLT_RESTAURANTS_BASE_URL}?lat=${LAT}&lon=${LON}`;
            return axios.get(url);
        });

        const response = await Promise.all(promises);
        const restaurantsWithArea = addAreaToRestaurantsFromResponse(response, cities);

        return restaurantsWithArea.map(restaurant => {
            return {
                id: restaurant.venue.id,
                name: restaurant.title,
                isOnline: restaurant.venue.online,
                slug: restaurant.venue.slug,
                area: restaurant.area,
            };
        });
    } catch (err) {
        console.log('getRestaurants::err', err);
        return [];
    }
}

async function getCitiesList() {
    try {
        const result = await axios.get(config.WOLT_CITIES_BASE_URL);
        const rawCities = result.data.results;
        return rawCities
            .filter(city => config.WOLT_CITIES_SLUGS_SUPPORTED.includes(city.slug))
            .map(city => {
                return {
                    WOLT_NAME: city.slug,
                    LON: city.location.coordinates[0],
                    LAT: city.location.coordinates[1],
                };
            });
    } catch (err) {
        console.log('getCitiesList::err', err);
        return [];
    }

}

function addAreaToRestaurantsFromResponse(response, cities) {
    return response.map((res, index) => {
        const restaurants = res.data.sections[1].items;
        restaurants.map(restaurant => restaurant.area = cities[index].WOLT_NAME);
        return restaurants;
    }).flat();
}

async function enrichRestaurants(parsedRestaurants) {
    try {
        const promises = parsedRestaurants.map(restaurant => {
            const url = `${config.WOLT_RESTAURANT_BASE_URL}`.replace('{slug}', restaurant.slug);
            return axios.get(url);
        });
        const response = await Promise.all(promises);
        const restaurantsRawData = response.map(res => res.data);
        return restaurantsRawData.map((rawRestaurant) => {
            const relevantParsedRestaurant = parsedRestaurants.find(restaurant => restaurant.id === rawRestaurant.venue.id);
            const restaurantLinkUrl = getRestaurantLink(relevantParsedRestaurant);
            const isOpen = rawRestaurant.venue.open_status.is_open;
            return { ...relevantParsedRestaurant, restaurantLinkUrl, isOpen };
        });
    } catch (err) {
        console.log('enrichRestaurants::err', err);
        return parsedRestaurants;
    }
}

function getRestaurantLink(restaurant) {
    const { area, slug } = restaurant;
    return config.WOLT_RESTAURANT_LINK_BASE_URL.replace('{area}', area).replace('{slug}', slug);
}

module.exports = {
    getRestaurantsList,
    enrichRestaurants,
    getRestaurantLink,
};
