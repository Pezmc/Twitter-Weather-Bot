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

var TWITTER_ACCOUNT_NAME = "weathermcr";

// --- SQL ---
var sql = [];
sql['createSeenTweets'] = 'CREATE TABLE IF NOT EXISTS seen_tweets ' +
                          '(id INTEGER PRIMARY KEY, time DATETIME DEFAULT current_timestamp, text TEXT, user_id INTEGER,' + 
                          ' username TEXT, action_taken TEXT, streamed BOOLEAN)';
sql['createSentTweets'] = 'CREATE TABLE IF NOT EXISTS sent_tweets ' +
                          '(id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, related_tweet_id INTEGER)';
sql['createAPILogin'] =   'CREATE TABLE IF NOT EXISTS api_login ' +
                          '(id INTEGER PRIMARY KEY AUTOINCREMENT, access_token_key TEXT, access_token_secret TEXT)';

sql['selectNewestAPI'] =     'SELECT * FROM api_login ORDER BY id DESC LIMIT 1';                        
sql['selectNewestTweet'] =   'SELECT id FROM seen_tweets WHERE streamed = 0 ORDER BY id DESC LIMIT 1';
sql['selectExistingTweet'] = "SELECT 1 as 'exist' FROM seen_tweets WHERE id = $tweet_id LIMIT 1";

sql['updateActionTaken'] = 'UPDATE seen_tweets SET action_taken = $action WHERE id = $id';

sql['insertSeenTweet'] = 'INSERT INTO seen_tweets (id, text, user_id, username, streamed) ' + 
                         'VALUES ($id, $text, $user_id, $username, $streamed)';
sql['logSentTweet'] =    'INSERT INTO sent_tweets (text, related_tweet_id) VALUES ($text, $related_id)';
sql['insertAPILogin'] =  'INSERT INTO api_login (access_token_key, access_token_secret) VALUES ($key, $secret)';

// --- public
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
      DB.run(sql['createSeenTweets']);
      DB.run(sql['createSentTweets']);
      DB.run(sql['createAPILogin']);
    });
        
    DB.get(sql['selectNewestAPI'], function(err, result) {
    
      if(result) { 
          console.info("Using stored authentication");
          params = { 'since_id': (result.id - 1500) } // for some reason this needs to be done...
          
          twit.options.access_token_key = result.access_token_key;
          twit.options.access_token_secret = result.access_token_secret;
          
          start(callback);
      } else {
          console.info("Authentication is needed before bot can start.");
          requireAuthentication(function() {
              //reusable API access
              var insert = DB.prepare(sql['insertAPILogin']);
              insert.run({ $key: twit.options.access_token_key, $secret: twit.options.access_token_secret });
          
              start(callback);
          });
          
          
      }
      
    });
}

exports.updateActionTaken = function(tweet, actionTaken) {
    var update = DB.prepare(sql['updateActionTaken']);
    update.bind({$id: tweet.id, $action: actionTaken });
    update.run();
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

// --- private
function start(callback) {    
    updateTweets();
    streamWeatherTweets();
    streamUserReplies();
    callback();  
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

function logSentTweet(tweet, params) {
    if(typeof params === 'undefined')
      params = {};
      
    var insert = DB.prepare(sql['logSentTweet']);
    insert.run({ $text: tweet.text, $related_id: params.in_reply_to_status_id });
    console.log("Tweet sent successfully" + (DUMMY_TWEET ? " (Mock)" : ""));  
}

function selectTweets(params, callback) {
    defaultParams = {
        'q': QUERY,
        'lang': 'en',
        'result_type': 'recent', //mixed, recent, popular
        'f': 'realtime',
        'include_entities': 'false',
        'count': 100
    };
    
    params = merge(defaultParams, params);
    
    if(DUMMY_SEARCH) callback();
    else twit.get('/search/tweets.json', params, callback);
}

function updateTweets() { 
    console.log("Querying twitter for updates");
    DB.get(sql['selectNewestTweet'], function(err, result) {
        if(result) params = { 'since_id': (result.id + 1)  }
        else params = {}
            
        selectTweets(params, function(data) {
            if(!data || !data.statuses) {
                console.warn("No data received from Twitter");
            }
            else
            {
                var count = data.statuses.length;
                if(count < 1) {
                    console.warn("No tweets received from Twitter");
                }
                    
                for(i=0;i<count;i++) {
                    var tweet = data.statuses[i];
                    seenTweet(tweet);
                }
            }
            
            updateComplete();
        });
    });
}

var weather_keywords = ['weather', 'forecast', 'sunny', 'weather', 'rain',
                        'umbrella', 'snow', 'hail', 'warm', 'cold', 'brolly', 'boiling'];
var ignored_users = ['galgateweather', 'mennews', 'metoffice', 'chadWeather', 'myweather_man', TWITTER_ACCOUNT_NAME];

function streamWeatherTweets() {
    //stream_base = this.options.filter_stream_base;
    // function(method, params, callback)
    // Bounding boxes do not act as filters for other filter parameters. For example track=twitter&locations=-122.75,36.8,-121.75,37.8 would match any tweets containing the term Twitter (even non-geo tweets) OR coming from the San Francisco area.

    track = []
    
    for(i=0;i<weather_keywords.length;i++) {
      track.push(weather_keywords[i] + ' manchester');
      track.push(weather_keywords[i] + ' #mcr');
    }
    
    twit.stream('filter', { 
      track: ["weather manchester", "rain manchester", "sunny manchester", "snow manchester"],
      locations: '-2.275,53.45,-2.2,53.5' // bottom right, top left - lon/lat
    }, function(stream) {
        console.info("Connected to twitter filter stream for Manchester");
        
        var resetStream = setTimeout(function() {
            console.info("Restarting manchester stream as it has been open for 30 minutes");
            stream.destroy();
        }, 30 * 60 * 1000);
        
        stream.on('data', function(data) {
            // @todo should probably validate data, twitter might return a none tweet
            
            // the steam may contain "non weather" tweets we must filter first
            if(arrayInString(data.text, weather_keywords) && !arrayInString(data.user.screen_name, ignored_users)) {
              console.info("Matched streamed weather tweet @", data.user.screen_name, " ", data.text);
              seenTweet(data, true);  
            } else {
              //console.log("Ignored: @", data.user.screen_name, " ", data.text);
            }
              
        });
        
        stream.on('error', function(error) {
            if(error.errorSource) console.error("Twitter Stream Error:", error);
            else console.error("Other Twitter stream error");
        });
        
        stream.on('end', function(end) {
            console.info("Stream ended, will attempt to reconnect in 15 seconds");
            clearTimeout(resetStream);
            setTimeout(streamWeatherTweets, 15000);
        });
        
    }); 
}

function streamUserReplies() {
  
  twit.stream('user', { 
      replies: 'all', // By default @replies are only sent if the current user follows both the sender and receiver
      with: 'users' // When set to "users", only messages targeted directly at a user will be delivered
    }, function(stream) {
        console.info("Connected to twitter user stream for McrWeather");
        
        var resetStream = setTimeout(function() {
            console.info("Restarting user stream as it has been open for 30 minutes");
            stream.destroy();
        }, 30 * 60 * 1000);
        
        stream.on('data', function(data) {      
            // Upon establishing a User Stream connection Twitter will send
            // a preamble before starting regular message delivery            
            if(data.friends)
              return;  
            else if(data.text) {
              if(data.text.toLowerCase().indexOf(TWITTER_ACCOUNT_NAME) != -1) {
                  console.log("Recieved mention in user stream @", data.user.screen_name, data.text);
                  seenTweet(data, true, true);
              }
            }                
        });
        
        stream.on('error', function(error) {
            if(error.errorSource) console.error("Twitter User Stream Error:", error);
            else console.error("Other Twitter User stream error");
        });
        
        stream.on('end', function(end) {
            console.info("User stream ended, will attempt to reconnect in 15 seconds");
            clearTimeout(resetStream);
            setTimeout(streamUserReplies, 15000);
        });
        
    });
}

function arrayInString(string, array) {
    if(typeof string !== 'string')
        throw new Error('The term to search must be a string');

    for(i=0;i<array.length;i++) {
        if(string.toLowerCase().indexOf(array[i].toLowerCase()) != -1) return true;
    }
    
    return false;
  
}

function seenTweet(tweet, streamed, mention) {
    if(typeof streamed === 'undefined')
        streamed = false;

    if(typeof mention === 'undefined')
        mention = tweet.text.toLowerCase().indexOf(TWITTER_ACCOUNT_NAME) != -1;
        
    var select = DB.prepare(sql['selectExistingTweet']);
    select.get({$tweet_id: tweet.id}, function(err, row) {
        if(!row) { // If the result set is empty, the second parameter is undefined
            var insert = DB.prepare(sql['insertSeenTweet']);
            insert.run({
              $id: tweet.id,
              $text: tweet.text,
              $user_id: tweet.user.id,
              $username: tweet.user.screen_name,
              $streamed: streamed ? 1 : 0  // 0/1 as SQLlite has no boolean support
            }); 
            TWEET_CALLBACK(tweet, mention);
            console.info("Logged", tweet.text, tweet.created_at);
        } else {
            console.info("Ignored duplicate", tweet.text, tweet.created_at);
            // @todo if streamed == false, I might need to mark this as non-streamed
            // to prevent the non-stream falling behind if the stream is capturing everything
        }
    });                
}

function updateComplete() {
    console.info("\n"+'Update complete, waiting '+WAIT_SECONDS+' seconds before the next update');
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