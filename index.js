// --- Config ---
var WAIT_SECONDS = 180;
var DUMMY_TWITTER_SEARCH = true;
var DUMMY_TWITTER_TWEET = true;
var DUMMY_TWITTER_MENTION_TWEET = false;

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
var TWITTER_QUERY = 'weather OR sunny OR rain OR umbrella OR snow OR hail OR warm OR cold OR thunder OR @weathermcr manchester OR #mcr OR @weathermcr weekend OR today OR tomorrow OR week OR forecast OR @weathermcr -rt -from:MENnews -from:metoffice -from:ChadWeather -from:MyWeather_MAN -from:weathermcr -"Manchester, NH" -"[Manchester Weather]"';
 
// --- Requirements ---
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.cached.Database('tweets.sqlite');

var twitterbot = require('./lib/TwitterBot.js');
    twitterbot.config(TWITTER_COFIG, WAIT_SECONDS, db);
    twitterbot.dummy(DUMMY_TWITTER_SEARCH, DUMMY_TWITTER_TWEET);

var cachedweather = require('./lib/CachedOpenWeatherAPI.js');
    cachedweather.config(WEATHER_CONFIG, MANCHESTER_CITY_ID, db);

var wit = require("./lib/Wit.js");

var witparse = require("./lib/WitWeatherParse.js");
    witparse.config(MIN_WIT_CONFIDENCE, cachedweather);
    
// --- Function ---
function processNewTweet(tweet, mention) {
    strippedTweet = stripTwitterURL(tweet.text); // need to remove URL's else wit gets confused
    wit.query(strippedTweet, function(reply){
        witparse.processReply(reply, function(message, action) {
            if(message != false) {
            
              // Behave a bit more "human" by waiting
              setTimeout(function() {             
                twitterbot.sendReply(tweet, message, function(tweet) {
                  twitterbot.updateActionTaken(tweet, "Sent tweet");
                }, mention);
              }, 3000 + Math.floor(Math.random() * 5000));
              
            } else {
              twitterbot.updateActionTaken(tweet, action);
            }
            
        }, mention && !DUMMY_TWITTER_MENTION_TWEET);
    });
}

function stripTwitterURL(tweet) {
  return tweet.replace(/((https?\:\/\/)|(www\.))t\.co(\S+)(\w{2,4})?/gi, '');  
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


  
