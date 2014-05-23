var util = require('util'),
    twitter = require('twitter');
twit = null;

var DUMMY_TWITTER = false;
var WAIT_SECONDS = 120;
var QUERY = "";
var TWEET_CALLBACK = null;
var DB = null;

exports.config = function(config, debug, wait_seconds, database) {
    var twit = new twitter(config);
    WAIT_SECONDS = wait_seconds;
    DUMMY_TWITTER = debug;
    DB = database;
}

exports.start = function(query, callback) {
    QUERY = query;
    TWEET_CALLBACK = callback;
    updateTweets();
}

// Ensure the database is ready for use
db.serialize(function() {
  db.run("CREATE TABLE IF NOT EXISTS seen_tweets (id INTEGER PRIMARY KEY, text TEXT, user_id INTEGER, action_taken TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS sent_tweets (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, related_tweet_id INTEGER)");
});

function selectTweets(params, callback) {
    defaultParams = {
        'q': QUERY,
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
    DB.get("SELECT id FROM seen_tweets ORDER BY id DESC LIMIT 1", function(err, result) {
        if(result) params = { 'since_id': result.id }
        else params = {}
            
        selectTweets(params, function(data) {
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

function seenTweet(tweet)
    //var statement = db.prepare("INSERT OR IGNORE INTO seen_tweets (id, text, user_id) VALUES ($id, $text, $user_id)");
    var select = db.prepare("SELECT 1 as 'exist' FROM seen_tweets WHERE id = $tweet_id LIMIT 1");
    select.get({$tweet_id: tweet.id}, function(err, row) {
        if(!row) { // If the result set is empty, the second parameter is undefined
            var insert = db.prepare("INSERT INTO seen_tweets (id, text, user_id) VALUES ($id, $text, $user_id)");
            insert.run({$id: tweet.id, $text: tweet.text, $user_id: tweet.user.id}); 
            TWEET_CALLBACK(tweet);
            console.info("Logged", tweet.text, tweet.created_at);
        } else {
            console.info("Ignored duplicate", tweet.text, tweet.created_at);
        }
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