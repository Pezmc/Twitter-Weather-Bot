
// = entities
// location
// datetime
// weather_type: snow, rain, hail, thunder, sunny, cloudy
// weather_temperature: very cold, cold, neutral, warm, very warm
// weather_sentiment: negative, positive, neutral

exports.processReply = function(reply, callback) {
    if(reply.outcome.confidence < MIN_WIT_CONFIDENCE) {
        updateTweetWithActionTaken(tweet, "Ignored as confidence ("+reply.outcome.confidence+") was below "+MIN_WIT_CONFIDENCE+".");
    } else {
        switch(reply.outcome.intent) {
            case 'weather_other':
                callback("Ignored as wit was unsure of type");
                break;
            case 'weather_query':
                processWeatherQuery(reply.outcome.entities, tweet);
                break;
            case 'weather_statement':
                callback("Would have attempted to parse statement");
                break;
            default:
                console.warn("Unknown Wit intent type: '"+reply.outcome.intent+"'")
                callback("Ignored as '"+reply.outcome.intent+"' is not a known type");
        }
    }
}

function processWeatherQuery(entities, callback) {
    console.log('Processing weather query "'+tweet.text+'"');
    
    // required: location, datetime default = today, 
    console.log(entities)
    
    var isManchester = false;
    if(entities.location) {
        if(Array.isArray(entities.location)) {
            entities.location.forEach(function(value) {
                if(value.value.toLowerCase().indexOf('manchester') > -1)
                    isManchester = true;
            });
        } else {
            if(entities.location.value.toLowerCase().indexOf('manchester') > -1)
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
        } else {
            timePeriod.from = entities.datetime.from;
            timePeriod.to = entities.datetime.to;
        }
    }
    
   // weather_type: snow, rain, hail, thunder, sunny, cloudy
   var weatherType = false;
   if(entities.weather_type) {
       weatherType = entities.weather_type;
   }
   
   // weather_temperature: very cold, cold, neutral, warm, very warm
   var weatherTemperature = false;
   if(entities.weather_temperature) {
       weatherTemperature = entities.weather_temperature;
   }
   
   // get the weather for that date
   var timePeriod;
   var from = new Date(timePeriod.from).getTime()/1000;
   var to = new Date(timePeriod.to).getTime()/1000;
   var averageData = Math.round(from + to)/2;
   
   console.log(new Date(timePeriod.from).getTime()/1000);
   console.log(new Date(timePeriod.to).getTime()/1000);
   console.log(averageData);
   cachedweather.getWeatherAt(averageData, function(weather) {
       console.log(weather);
   });
   
   callback("Would have attempted to parse query");
}