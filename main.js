// --- Config ---
var WAIT_SECONDS = 180;
var DUMMY_TWITTER = false;
var TWITTER_COFIG = {
    consumer_key: 'dXtdhPDWxm8xVq8Z3otvb1Dv6',
    consumer_secret: 'fshKYIXBTCQz6HkVJ7DqG00LD1ZsoN4syyNXLbZqrF8nvj1mPU',
    access_token_key: '14605923-kYSSvN0y75setOYvv7Dq1jaAOmHFfATHMbku9uYz5',
    access_token_secret: '9WX6w2wf6ZFLaFY9O0OJRvgAjsDjOJSnaGrlommjEjo3l'
}
var MIN_WIT_CONFIDENCE = 0.75;
var WEATHER_CONFIG = {
    units: 'metric',
    lang: 'en',
    mode: 'json'
}
var MANCHESTER_CITY_ID = 2643123;

// --- App ---
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.cached.Database('tweets.sqlite');

/*var twitterbot = require('./TwitterBot.js');
    twitterbot.config(TWITTER_COFIG, DUMMY_TWITTER, WAIT_SECONDS, db);
    twitterbot.start('weather OR sunny OR rain OR umbrella OR snow OR hail OR warm OR cold manchester OR mcr weekend OR today OR tomorrow -rt', processNewTweet);*/

var cachedweather = require('./CachedOpenWeatherAPI.js');
    cachedweather.config(WEATHER_CONFIG, MANCHESTER_CITY_ID, db);
    cachedweather.start(15);

var wit = require("./Wit.js");

var witparse = require("./WitWeatherParse.js");
    witparse.config(MIN_WIT_CONFIDENCE, cachedweather);
    
// --- Function ---
function processNewTweet(tweet) {
    wit.query(tweet.text, function(reply){
        witparse.processReply(reply, function(action) {
            updateTweetWithActionTaken(tweet, action);
        });
    });
}

function updateTweetWithActionTaken(tweet, actionTaken) {
    var update = db.prepare('UPDATE seen_tweets SET action_taken = $action WHERE id = $id');
    update.bind({$id: tweet.id});
    update.run();
}

// Main
//updateTweets();

processNewTweet({text: 'what will the weather be Manchester next weekend?', id: '123123123'});
