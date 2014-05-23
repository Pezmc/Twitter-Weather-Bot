
// = entities
// location
// datetime
// weather_type: snow, rain, hail, thunder, sunny, cloudy
// weather_temperature: very cold, cold, neutral, warm, very warm
// weather_sentiment: negative, positive, neutral

var WEATHER_API;
var MIN_CONFIDENCE;

exports.config = function(min_confidence, weather_api) {
    WEATHER_API = weather_api;
    MIN_CONFIDENCE = min_confidence;
}

exports.processReply = function(reply, callback) {
    if(reply.outcome.confidence < MIN_CONFIDENCE) {
        updateTweetWithActionTaken(tweet, "Ignored as confidence ("+reply.outcome.confidence+") was below "+MIN_CONFIDENCE+".");
    } else {
        switch(reply.outcome.intent) {
            case 'weather_other':
                callback("Ignored as wit was unsure of type");
                break;
            case 'weather_query':
                processWeatherQuery(reply, callback);
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

function processWeatherQuery(reply, callback) {
    var entities = reply.outcome.entities;
    
    console.info('Processing weather query "'+reply.msg_body+'"');
  
    console.log(entities);
  
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
            timePeriod.from = entities.datetime[0].value.from;
            timePeriod.to = entities.datetime[0].value.to;
            //}
        } else {
            timePeriod.from = entities.datetime.value.from;
            timePeriod.to = entities.datetime.value.to;
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
   var from = new Date(timePeriod.from).getTime()/1000;
   var to = new Date(timePeriod.to).getTime()/1000;
   var averageData = Math.round(from + to)/2;
   
   console.log(timePeriod);
   console.log(new Date(timePeriod.from).getTime()/1000);
   console.log(new Date(timePeriod.to).getTime()/1000);
   console.log(averageData);
   WEATHER_API.getWeatherAt(averageData, function(weather) {
       console.log(weather);
   });
   
   callback("Would have attempted to parse query");
}