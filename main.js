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
var util = require('util'),
    twitter = require('twitter');    
var twit = new twitter(TWITTER_COFIG);
var https = require("https");
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.cached.Database('tweets.sqlite');
var querystring = require('querystring');
var merge = require('merge');
var cachedweather = require('./CachedOpenWeatherAPI.js');
    cachedweather.config(WEATHER_CONFIG, MANCHESTER_CITY_ID, db);
    cachedweather.start(15);

// Ensure the database is ready for use
db.serialize(function() {
  db.run("CREATE TABLE IF NOT EXISTS seen_tweets (id INTEGER PRIMARY KEY, text TEXT, user_id INTEGER, action_taken TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS sent_tweets (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, related_tweet_id INTEGER)");
});

function selectWeatherTweets(params, callback) {
    defaultParams = {
        'q': 'weather OR sunny OR rain OR umbrella OR snow OR hail OR warm OR cold manchester OR mcr weekend OR today OR tomorrow -rt',
        'lang': 'en',
        'result_type': 'recent', //mixed, recent, popular
        'include_entities': 'false'
    };
    
    params = merge(defaultParams, params);
    
    if(DUMMY_TWITTER) callback();
    else twit.get('/search/tweets.json', params, callback);
}

function updateTweets() { 
    console.log("Querying twitter for updates");
    db.get("SELECT id FROM seen_tweets ORDER BY id DESC LIMIT 1", function(err, result) {
        if(result) params = { 'since_id': result.id }
        else params = {}
            
        selectWeatherTweets(params, function(data) {
            if(!data || !data.statuses) {
                console.warn("No data received from Twitter");
            }
            else
            {
                var count = data.statuses.length;
                if(count < 1) 
                    console.warn("No tweets received from Twitter");
                    
                for(i=0;i<count;i++) {
                    var tweet = data.statuses[i];
                    seenTweet(tweet);
                }
            }
            
            updateComplete();
        });
    });
}

function updateComplete() {
    console.log("\n"+'Update complete, waiting '+WAIT_SECONDS+' seconds before the next update');
    countdown(WAIT_SECONDS, updateTweets, "seconds until next search...");
}


function countdown(seconds, callback, message) {
    var countdownInterval;
    var countdownSecondsLeft;
    var countdownCallback;

    countdownInterval = setInterval(function(){
        process.stdout.clearLine();  // clear current text
        process.stdout.cursorTo(0);  // move cursor to beginning of line
        process.stdout.write(countdownSecondsLeft-- + " " + message);
        
        if(countdownSecondsLeft <= 0) {
            clearInterval(countdownInterval);
            process.stdout.write("\n");
            if(countdownCallback) {
                temp = countdownCallback;
                countdownCallback = null;
                temp();
            }
        }
    }, 1000);
        
    countdownSecondsLeft = seconds;
    if(typeof callback !== 'undefined') {
        countdownCallback = callback;
    }
}

function seenTweet(tweet) {
    //var statement = db.prepare("INSERT OR IGNORE INTO seen_tweets (id, text, user_id) VALUES ($id, $text, $user_id)");
    var select = db.prepare("SELECT 1 as 'exist' FROM seen_tweets WHERE id = $tweet_id LIMIT 1");
    select.get({$tweet_id: tweet.id}, function(err, row) {
        if(!row) { // If the result set is empty, the second parameter is undefined
            var insert = db.prepare("INSERT INTO seen_tweets (id, text, user_id) VALUES ($id, $text, $user_id)");
            insert.run({$id: tweet.id, $text: tweet.text, $user_id: tweet.user.id}); 
            processNewTweet(tweet);
            console.info("Logged", tweet.text, tweet.created_at);
        } else {
            console.info("Ignored duplicate", tweet.text, tweet.created_at);
        }
    });                
}

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