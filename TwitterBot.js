var util = require('util'),
    twitter = require('twitter');
var twit;
var merge = require('merge');
var fs = require('fs')
var colors = require('colors');

var DUMMY_SEARCH = false;
var DUMMY_TWEET = false;
var WAIT_SECONDS = 120;
var QUERY = "";
var TWEET_CALLBACK = null;
var DB = null;

var COUNTDOWN_OUTPUT = false;

var TWITTER_ACCOUNT_NAME = "weathermcr";

var DEFAULT_STREAM_SLEEP_SECONDS = 5;

var TWEET_TYPE = { 
  POLLED: "polled",
  STREAMED: "streamed"
}

// --- SQL ---
var sql = [];
sql['createSeenTweets'] = 'CREATE TABLE IF NOT EXISTS seen_tweets ' +
                          '(id INTEGER PRIMARY KEY, time DATETIME DEFAULT current_timestamp, text TEXT, ' + 
                            'user_id INTEGER, username TEXT, action_taken TEXT, streamed BOOLEAN DEFAULT 0, ' +
                            'polled BOOLEAN DEFAULT 0, mention BOOLEAN DEFAULT 0)';
sql['createSentTweets'] = 'CREATE TABLE IF NOT EXISTS sent_tweets ' +
                          '(id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, related_tweet_id INTEGER)';
sql['createAPILogin'] =   'CREATE TABLE IF NOT EXISTS api_login ' +
                          '(id INTEGER PRIMARY KEY AUTOINCREMENT, access_token_key TEXT, access_token_secret TEXT)';

sql['selectNewestAPI'] =     'SELECT * FROM api_login ORDER BY id DESC LIMIT 1';                        
sql['selectNewestTweet'] =   'SELECT id FROM seen_tweets WHERE streamed = 0 OR polled = 1 ORDER BY id DESC LIMIT 1';
sql['selectExistingTweet'] = "SELECT 1 as 'exist' FROM seen_tweets WHERE id = $tweet_id LIMIT 1";

sql['updateActionTaken'] = 'UPDATE seen_tweets SET action_taken = $action WHERE id = $id';
sql['updatePolled'] =      'UPDATE seen_tweets SET polled = $polled WHERE id = $id';


sql['insertSeenTweet'] = 'INSERT INTO seen_tweets (id, text, user_id, username, streamed, polled, mention) ' + 
                         'VALUES ($id, $text, $user_id, $username, $streamed, $polled, $mention)';
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
      console.warn("Using dummy twitter search");
    if(DUMMY_TWEET)
      console.warn("Using dummy twitter tweet");  
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

exports.sendReply = function(reply_to, message, callback, disable_dummy_tweet) {
    if(typeof disable_dummy_tweet === 'undefined')
        disable_dummy_tweet = false;

    // Must include @ for reply, else twitter rejects it
    if(reply_to.user.screen_name)
      message = "@" + reply_to.user.screen_name + " " + message;

    // Twitter rejects us if we provide an incorrect reply_to.id
    params = {}
    if(reply_to.id)
      params.in_reply_to_status_id = reply_to.id;
      
    if(message.length > 140)
        console.error("Message over 140 letters: " + message);

    console.info("Attempting to send", message);
   
    if(DUMMY_TWEET && !disable_dummy_tweet) {
      var dummy = { text: message };
      logSentTweet(dummy, params, false);
      callback(dummy);
    } else {
      twit.updateStatus(message, params, function(reply) {
          if(reply.id) {
            logSentTweet(reply, params);
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
      console.info("Auth complete, closing authentication server.");
      server.close();
      callback();
    });
    app.get('/twauth', twit.login());
    
    console.info('Listening on 1200 for auth requests to Twitter');
    server = app.listen(1200);
}

function logSentTweet(tweet, params, real) {
    if(typeof params === 'undefined')
      params = {};
      
    if(typeof real === 'undefined')
      real = true;
      
    var insert = DB.prepare(sql['logSentTweet']);
    insert.run({ $text: tweet.text, $related_id: params.in_reply_to_status_id });
    console.info("Tweet sent successfully" + (real ? "" : " (Mock)"));  
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
    console.info("Querying twitter for updates using polling");
    DB.get(sql['selectNewestTweet'], function(err, result) {
        if(result) params = { 'since_id': (result.id + 1)  }
        else params = {}
            
        selectTweets(params, function(data) {
            if(!data || !data.statuses) {
                console.warn("No data received from Twitter from search poll");
            }
            else
            {
                var count = data.statuses.length;
                if(count < 1) {
                    console.warn("No tweets received from Twitter from search poll");
                }
                    
                for(i=0;i<count;i++) {
                    var tweet = data.statuses[i];
                    
                    if(isWeatherTweet(data)) {
                        seenTweet(tweet, TWEET_TYPE.POLLED);
                    } else {
                        fs.appendFile('ignoredTweets.txt', data.user.screen_name
                                       + ":\t"
                                       + data.text.replace(/(\r\n|\n|\r)/gm," \\\ ")
                                       + "\n");
                    }
                    

                }
            }
            
            updateComplete();
        });
    });
}

// Connect to a twitter stream
function streamTweets(type, params, dataCallback, reconnectSleepSeconds) {
    if(typeof reconnectSleepSeconds === 'undefined')
        reconnectSleepSeconds = DEFAULT_STREAM_SLEEP_SECONDS;
  
    twit.stream(type, params, function(stream) {
        console.info("Connected to twitter "+type+" stream");
        
        var resetStream = setTimeout(function() {
            console.info("Restarting "+type+" stream as it has been open for 30 minutes");
            stream.destroy();
        }, 30 * 60 * 1000);
        
        stream.on('data', function(data) {
        
            // reset done here as 'connect' fires even on rejection
            reconnectSleepSeconds = DEFAULT_STREAM_SLEEP_SECONDS;
             
            dataCallback(data);
              
        });
        
        stream.on('error', function(error) {
            if(error.errorSource) console.error("Twitter "+type+" stream error:", error);
            else console.error("Other Twitter "+type+" stream error");
        });
        
        stream.on('end', function(end) {
            console.info("Stream "+type+" ended, will attempt to reconnect in "+reconnectSleepSeconds+" seconds");
            clearTimeout(resetStream);
            setTimeout(function() {
              streamTweets(type, params, dataCallback, reconnectSleepSeconds * 2);
            }, reconnectSleepSeconds * 1000);
        });
        
    });   

}

// Twitter side
var weather_keywords = ['weather', 'forecast', 'sunny', ' rain', 'sunshine', 'thunder', 'lightning',
                        'umbrella', ' snow', 'hail', ' warm', 'cold', 'brolly', 'boiling',
                        '#snow', '#rain', '#hail', '#sun', '#thunder'];

// Local
var ignored_users = ['galgateweather', 'mennewsdesk', 'metoffice', 'chadWeather', 'myweather_man',
                     'uk_storms', 'wx_manchester', 'widdop_weather', 'weather', TWITTER_ACCOUNT_NAME,
                     'LordChapman'];

var ignored_keywords = ['rt @', '[Manchester Weather] Your Weekend Forecast', 'weatherspoons',
                        'manchester, nh', 'train', '@MetOffice', '@coldplay', 'Cold cave'];
                        
function isWeatherTweet(tweet) {
    return arrayInString(tweet.text, weather_keywords, true)
           && !arrayInString(tweet.user.screen_name, ignored_users)
           && !arrayInString(tweet.text, ignored_keywords)    
}

function highlightMatches(string, array) {
    text = string;
    for(i=0;i<array.length;i++) {
      text = text.replace(new RegExp('(' + array[i] + ')','ig'), "$1".red);
    } 
    return text;
}

// Get tweets about the weather
function streamWeatherTweets() {
 
    // Bounding boxes do not act as filters for other filter parameters.
    // For example track=twitter&locations=-122.75,36.8,-121.75,37.8 would match
    // any tweets containing the term Twitter (even non-geo tweets) OR coming from the San Francisco area.
    track = []
    
    for(i=0;i<weather_keywords.length;i++) {
      track.push(weather_keywords[i] + ' manchester');
      track.push(weather_keywords[i] + ' #mcr');
    }
    
    streamTweets('filter',
        { 
            track: track,
            locations: '-2.275,53.45,-2.2,53.5' // bottom right, top left - lon/lat
        }, 
        function(data) {
             
            // @todo should probably validate data, twitter might return a none tweet
            // the steam may contain "non weather" tweets we must filter first
            if(isWeatherTweet(data)) {
               
                textWithMatches = highlightMatches(data.text, weather_keywords);                
                console.info("Matched streamed weather tweet @", data.user.screen_name, " ", textWithMatches);
                seenTweet(data, TWEET_TYPE.STREAMED); 
                 
            } else {
                fs.appendFile('ignoredTweets.txt', data.user.screen_name
                                                    + ":\t"
                                                    + data.text.replace(/(\r\n|\n|\r)/gm," \\ ")
                                                    + "\n");
            }
              
        }
    );    
}

function streamUserReplies() {
    streamTweets('user',
        { 
            replies: 'all', // By default @replies are only sent if the current user follows the sender and receiver
            with: 'users' // When set to "users", only messages targeted directly at a user will be delivered
        },
        function(data) {      
            // Upon establishing a User Stream connection Twitter will send
            // a preamble before starting regular message delivery            
            if(data.friends) {
                return;  
            }
              
            else if(data.text && data.text.toLowerCase().indexOf(TWITTER_ACCOUNT_NAME) != -1) {
                console.info("Recieved mention in user stream @", data.user.screen_name, data.text);
                
                // Avoid loops, if we sent the message and it was a reply to US
                if(data.in_reply_to_screen_name
                    && data.in_reply_to_screen_name.toLowerCase() == TWITTER_ACCOUNT_NAME
                    && data.user.screen_name.toLowerCase() == TWITTER_ACCOUNT_NAME) {
                    console.warn('Ignored self reply message'); 
                    return;  
                }
                
                seenTweet(data, TWEET_TYPE.STREAMED, true);
            }                
        }
    );
}

function arrayInString(string, array, ignore_mentions) {
    if(typeof string !== 'string')
        throw new Error('The term to search must be a string');

    if(typeof ignore_mentions === 'undefined')
        ignore_mentions = false;

    for(i=0;i<array.length;i++) {
        if(string.toLowerCase().indexOf(array[i].toLowerCase()) != -1) {
            if(!ignore_mentions) return true;
            else { 
              // note double escape and trim due to trailing spaces
              var re = new RegExp('@\\w*'+array[i].trim(),'i');
              if(!re.test(string))
                  return true;
            }
        }
    }
    
    return false;
    
}

function seenTweet(tweet, type, mention) {

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
              $streamed: type == TWEET_TYPE.STREAMED ? 1 : 0,  // 0/1 as SQLlite has no boolean support
              $polled: type == TWEET_TYPE.POLLED ? 1 : 0,
              $mention: mention ? 1 : 0,
            }); 
            TWEET_CALLBACK(tweet, mention);
            console.info("Logged: ", tweet.text, tweet.created_at);
        } else {
            console.info("Ignored duplicate: ", tweet.text, tweet.created_at);

            // to prevent the non-stream falling behind if the stream is capturing everything
            if(type == TWEET_TYPE.POLLED) {
                var update = DB.prepare(sql['updatePolled']);
                update.run({ $id: tweet.id, $polled: 1 });
            }
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
        if(COUNTDOWN_OUTPUT) {
            process.stdout.clearLine();  // clear current text
            process.stdout.cursorTo(0);  // move cursor to beginning of line
            process.stdout.write(countdownSecondsLeft-- + " " + message);
        }
        
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