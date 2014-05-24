var util = require('util'),
    twitter = require('twitter');
var twit;
var merge = require('merge');

var DUMMY_SEARCH = false;
var DUMMY_TWEET = false;
var WAIT_SECONDS = 120;
var QUERY = "";
var TWEET_CALLBACK = null;
var DB = null;


exports.config = function(config, wait_seconds, database) {
    twit = new twitter(config);
    WAIT_SECONDS = wait_seconds;
    DB = database;
}

exports.dummy = function(search, tweets) {
    DUMMY_SEARCH = search;
    DUMMY_TWEET = tweets;
    if(DUMMY_SEARCH)
      console.log("Using dummy twitter search");
    if(DUMMY_TWEET)
      console.log("Using dummy twitter tweet");  
}

exports.start = function(query, tweet_callback, callback) {
    QUERY = query;
    TWEET_CALLBACK = tweet_callback;
    
    // Ensure the database is ready for use
    DB.serialize(function() {
      DB.run("CREATE TABLE IF NOT EXISTS seen_tweets (id INTEGER PRIMARY KEY, text TEXT, user_id INTEGER, action_taken TEXT)");
      DB.run("CREATE TABLE IF NOT EXISTS sent_tweets (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, related_tweet_id INTEGER)");
    });
    
    console.info("Authentication is needed before bot can start.");
    requireAuthentication(function() {
      updateTweets();
      callback();
    });

    //exports.sleepUntilAuthComplete(function() {
    //});
}

exports.updateActionTaken = function(tweet, actionTaken) {
    var update = DB.prepare('UPDATE seen_tweets SET action_taken = $action WHERE id = $id');
    update.bind({$id: tweet.id});
    update.run();
}

function requireAuthentication(callback) {
    var express = require('express');
    var app = express();
    var server;
    
    app.get('/', twit.gatekeeper('/login'), function(req, res){
      res.send('Authentification successfull');
      console.log("Auth complete, closing authentication server.");
      server.close();
      callback();
    });
    app.get('/twauth', twit.login());
    
    console.log('Listening on 1200 for auth requests to Twitter');
    server = app.listen(1200);
}

/*exports.sleepUntilAuthComplete = function(callback) {
    if(!twit.options.access_token_key || !twit.options.access_token_secret) {
      console.warn("Authentication not complete, waiting 10 seconds before trying again");
      setTimeout(function() {
        console.info("Checking to see if authentication is complete");
        exports.sleepUntilAuthComplete(callback);
      }, 10000)
    } else {
      callback();
    }
}*/

exports.sendReply = function(reply_to, message, callback) {

    // Must include @ for reply, else twitter rejects it
    if(reply_to.user.screen_name)
      message = "@" + reply_to.user.screen_name + " " + message;

    // Twitter rejects us if we provide an incorrect reply_to.id
    params = {}
    if(reply_to.id)
      params.in_reply_to_status_id = reply_to.id;
      
    if(message.length > 140)
        console.error("Message over 140 letters: " + message);

    console.log("Attempting to send", message);
   
    if(DUMMY_TWEET) {
      var dummy = { text: message };
      logSentTweet(dummy, params);
      callback(dummy);
    } else {
      twit.updateStatus(message, params, function(reply) {
          if(reply.id) {
            logSentTweet(reply);
            callback(reply);
          } else {
            console.error("Error sending tweet", reply);
          }
      });
    }
      
}

function logSentTweet(tweet, params) {
    if(typeof params === 'undefined')
      params = {};
      
    var insert = DB.prepare("INSERT INTO sent_tweets (text, related_tweet_id) VALUES ($text, $related_id)");
    insert.run({ $text: tweet.text, $related_id: params.in_reply_to_status_id });
    console.log("Tweet sent successfully" + (DUMMY_TWEET ? " (Mock)" : ""));  
}

function selectTweets(params, callback) {
    defaultParams = {
        'q': QUERY,
        'lang': 'en',
        'result_type': 'recent', //mixed, recent, popular
        'include_entities': 'false'
    };
    
    params = merge(defaultParams, params);
    
    if(DUMMY_SEARCH) callback();
    else twit.get('/search/tweets.json', params, callback);
}

function updateTweets() { 
    console.log("Querying twitter for updates");
    DB.get("SELECT id FROM seen_tweets ORDER BY id DESC LIMIT 1", function(err, result) {
        if(result) params = { 'since_id': (result.id + 1)  }
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

function seenTweet(tweet) {
    //var statement = db.prepare("INSERT OR IGNORE INTO seen_tweets (id, text, user_id) VALUES ($id, $text, $user_id)");
    var select = DB.prepare("SELECT 1 as 'exist' FROM seen_tweets WHERE id = $tweet_id LIMIT 1");
    select.get({$tweet_id: tweet.id}, function(err, row) {
        if(!row) { // If the result set is empty, the second parameter is undefined
            var insert = DB.prepare("INSERT INTO seen_tweets (id, text, user_id) VALUES ($id, $text, $user_id)");
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