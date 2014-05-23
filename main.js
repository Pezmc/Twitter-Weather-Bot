// --- Config ---
var WAIT_SECONDS = 60;
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
var twitterbot = require('./TwitterBot.js');
    twitterbot.config(TWITTER_COFIG, DUMMY_TWITTER, WAIT_SECONDS);
    twitterbot.start('weather OR sunny OR rain OR umbrella OR snow OR hail OR warm OR cold manchester OR mcr weekend OR today OR tomorrow -rt', processNewTweet);
    
var https = require("https");

var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.cached.Database('tweets.sqlite');

var querystring = require('querystring');
var merge = require('merge');

var cachedweather = require('./CachedOpenWeatherAPI.js');
    cachedweather.config(WEATHER_CONFIG, MANCHESTER_CITY_ID, db);
    cachedweather.start(15);

// --- Function ---
function processNewTweet(tweet) {
    sendWitQuery(tweet.text, function(reply){
        processWitReply(tweet, reply);
    });
}

function sendWitQuery(text, callback) {
    var options = {
      hostname: 'api.wit.ai',
      port: 443,
      path: '/message?'+querystring.stringify({'v': '20140523', 'q': text}),
      headers: {
          'Authorization': 'Bearer VPMJTZZA2OCCD4VY7PYOVE7WHCU62UCN',
          accept: '*/*'
      }
    };
   
    https.get(options, function(res) {
      console.log("Recieved reply from Wit with status: " + res.statusCode);
      
      res.on('data', function(data) {
        var result = JSON.parse(data);
        callback(result);
      });
    }).on('error', function(e) {
      console.log("Got error: " + e.message);
      callback();
    });
}

// = entities
// location
// datetime
// weather_type: snow, rain, hail, thunder, sunny, cloudy
// weather_temperature: very cold, cold, neutral, warm, very warm
// weather_sentiment: negative, positive, neutral
function processWitReply(tweet, reply) {
    if(reply.outcome.confidence < MIN_WIT_CONFIDENCE) {
        updateTweetWithActionTaken(tweet, "Ignored as confidence ("+reply.outcome.confidence+") was below "+MIN_WIT_CONFIDENCE+".");
    } else {
        switch(reply.outcome.intent) {
            case 'weather_other':
                updateTweetWithActionTaken(tweet,"Ignored as wit was unsure of type");
                break;
            case 'weather_query':
                processWeatherQuery(reply.outcome.entities, tweet);
                break;
            case 'weather_statement':
                updateTweetWithActionTaken(tweet,"Would have attempted to parse statement");
                break;
            default:
                console.warn("Unknown Wit intent type: '"+reply.outcome.intent+"'")
                updateTweetWithActionTaken(tweet, "Ignored as '"+reply.outcome.intent+"' is not a known type");
        }
    }
}

function processWeatherQuery(entities, tweet) {
    console.log('Processing weather query "'+tweet.text+'"');
    
    // required: location, datetime default = today, 
    
    var isManchester = false;
    if(entities.location) {
        if(Array.isArray(entities.location)) {
            entities.location.forEach(function(value) {
                if(value.body.toLowerCase().indexOf('manchester') > -1)
                    isManchester = true;
            });
        } else {
            if(entities.location.body.toLowerCase().indexOf('manchester') > -1)
                isManchester = true;
        }
    }
    
    var timePeriod = { from: new Date(), to: new Date() }
    if(entities.datetime) {
        if(Array.isArray(entities.datetime)) {
            //entities.datetime.forEach(function(value) {
            timePeriod.from = entities.datetime[0].from;
            timePeriod.to = entities.datetime[0].to;
            //}
        }
    }
    
    // http://api.openweathermap.org/data/2.5/forecast?id=2643123&mode=json&appid=
    // f3794e46bd7505e6a7746cb0379550ed
    
    // http://bugs.openweathermap.org/projects/api/wiki/Weather_Condition_Codes
    
    updateTweetWithActionTaken(tweet,"Would have attempted to parse query");
}

function updateTweetWithActionTaken(tweet, actionTaken) {
    var update = db.prepare('UPDATE seen_tweets SET action_taken = $action WHERE id = $id');
    update.bind({$id: tweet.id});
    update.run();
}

// Main
//updateTweets();
//processNewTweet({text: 'what is the weather in Manchester in Liverpool today?', id: '123123123'});

cachedweather.getWeatherAt(Math.round(new Date().getTime()/1000), function(data) {
    console.log(data);
});