// --- Config ---
var WAIT_SECONDS = 60;
var DUMMY_TWITTER_SEARCH = false; // disable search
var DUMMY_TWITTER_TWEET = true; // disable search
var TWITTER_COFIG = {
    consumer_key: 'dXtdhPDWxm8xVq8Z3otvb1Dv6',
    consumer_secret: 'fshKYIXBTCQz6HkVJ7DqG00LD1ZsoN4syyNXLbZqrF8nvj1mPU',
    //access_token_key: '14605923-kYSSvN0y75setOYvv7Dq1jaAOmHFfATHMbku9uYz5',
    //access_token_secret: '9WX6w2wf6ZFLaFY9O0OJRvgAjsDjOJSnaGrlommjEjo3l'
}
var MIN_WIT_CONFIDENCE = 0.75;
var WEATHER_CONFIG = {
    units: 'metric',
    lang: 'en',
    mode: 'json'
}
var MANCHESTER_CITY_ID = 2643123;
var TWITTER_QUERY = 'weather OR sunny OR rain OR umbrella OR snow OR hail OR warm OR cold manchester OR mcr weekend OR today OR tomorrow -rt';

// --- App ---
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.cached.Database('tweets.sqlite');

var twitterbot = require('./TwitterBot.js');
    twitterbot.config(TWITTER_COFIG, WAIT_SECONDS, db);
    twitterbot.dummy(DUMMY_TWITTER_SEARCH, DUMMY_TWITTER_TWEET);

var cachedweather = require('./CachedOpenWeatherAPI.js');
    cachedweather.config(WEATHER_CONFIG, MANCHESTER_CITY_ID, db);

var wit = require("./Wit.js");

var witparse = require("./WitWeatherParse.js");
    witparse.config(MIN_WIT_CONFIDENCE, cachedweather);
    
// --- Function ---
function processNewTweet(tweet) {
    wit.query(tweet.text, function(reply){
        witparse.processReply(reply, function(message, action) {
            if(message != false) {
              twitterbot.sendReply(tweet, message, function(tweet) {
                // callback on reply
              });
              action = "Sent tweet";
            }
            twitterbot.updateActionTaken(tweet, action);
        });
    });
}

// --- Main ---
cachedweather.start(30);

twitterbot.start(TWITTER_QUERY, processNewTweet, function() {
  testMessages = [];
  //testMessages.push('what will the weather be Manchester next weekend?');
  /*testMessages.push('I hope it\'s sunny in manchester this weekend!');
  testMessages.push('will it be warm this weekend?');
  testMessages.push('is it going to be warm tomorrow?');
  testMessages.push('is it going to be cold this weekend?');
  testMessages.push('is there snow forecast?');*/
  
  for(i=0; i < testMessages.length; i++) {
    processNewTweet({text: testMessages[i], id: i, user: {screen_name: 'Pezmc', id: 1}});
  }
});

// --- Send a weather tweet every three hours


  
