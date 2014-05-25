
// = entities
// location
// datetime
// weather_type: snow, rain, hail, thunder, sunny, cloudy
// weather_temperature: very cold, cold, neutral, warm, very warm
// weather_sentiment: negative, positive, neutral

var WEATHER_API;
var MIN_CONFIDENCE;

var util = require('util');

var INTENT = { 
  OTHER: "weather_other",
  QUERY: "weather_query",
  STATEMENT: "weather_statement",
  TIME_QUERY: "weather_time_query"
}

exports.config = function(min_confidence, weather_api) {
    WEATHER_API = weather_api;
    MIN_CONFIDENCE = min_confidence;
}

exports.processReply = function(reply, callback) {
    if(!reply) {
        callback(false, "Ignored as wit failed to parse");
        return;
    }
      
    if(reply.outcome.confidence < MIN_CONFIDENCE) {
        callback(false, "Ignored as confidence ("+reply.outcome.confidence+") was below "+MIN_CONFIDENCE+".");
        
    } else {
        var weatherIntent = new WeatherIntent(reply);
        
        switch(weatherIntent.getIntentType()) {
            case INTENT.OTHER:
                callback(false, "Ignored as wit was unsure of type");
                console.info("Treated as other and ignored");
                break;
            case INTENT.QUERY:
            case INTENT.TIME_QUERY:
                processWeatherQuery(weatherIntent, callback);
                break;
            case INTENT.STATEMENT:
                callback(false, "Would have attempted to parse statement");
                console.info("Would have attempted ot treat as a statement.");
                break;
            default:
                console.warn("Unknown Wit intent type: '"+reply.outcome.intent+"'");
                callback(false, "Ignored as '"+reply.outcome.intent+"' is not a known type");
        }
    }
}

function WeatherIntent(witReply) {
    var witReply = witReply;
    var entities = witReply.outcome.entities;
    
    this.getIntentType = function() {
        return witReply.outcome.intent
    }
    
    this.getIsManchester = function() {
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
        
        return isManchester;
    }
    
    this.getTimePeriod = function() {
        var timePeriod = { from: new Date(), to: new Date(), name: 'today' }
        timePeriod.to.setHours(timePeriod.to.getHours()+3); // dates in the past have unknown weather
        
        if(entities.datetime) {
            if(Array.isArray(entities.datetime)) {
                // @todo Prefer today, avoid in the past, select one after today if exists
                //entities.datetime.forEach(function(value) {
                timePeriod.from = entities.datetime[0].value.from;
                timePeriod.to = entities.datetime[0].value.to;
                timePeriod.name = entities.datetime[0].body;
                //}
            } else {
                timePeriod.from = entities.datetime.value.from;
                timePeriod.to = entities.datetime.value.to;
                timePeriod.name = entities.datetime.body;
            }
            timePeriod.from = new Date(timePeriod.from);
            timePeriod.to = new Date(timePeriod.to);
        }
        
        return timePeriod;
    }
        
    this.getFromUnixTime = function() {
        return this.getTimePeriod().from.getTime() / 1000;    
    }
    
    this.getToUnixTime = function() {
        return this.getTimePeriod().to.getTime() / 1000; 
    }
    
    this.getAverageUnixTime = function() {
        return Math.round((this.getFromUnixTime() +
                           this.getToUnixTime()) / 2);
    }
    
    this.getWeatherType = function() {
        var weatherType = false;
        
        if(entities.weather_type) {
           weatherType = entities.weather_type.value;
        }     
         
        return weatherType;
    }
    
    this.getWeatherTemperature = function() {
        var weatherTemperature = false;
        
        if(entities.weather_temperature) {
           weatherTemperature = entities.weather_temperature.value;
        }   
        
        return weatherTemperature;  
    }
}

function processIntent(intent, callback) {  
    console.info(util.format('Processing weather query from @%s "%s"', reply.user.screen_name, reply.msg_body))
    
    // weather_type: snow, rain, hail, thunder, sunny, cloudy
    // weather_temperature: very cold, cold, neutral, warm, very warm
    
    switch(intent.getIntentType()) {
        case INTENT.QUERY: processWeatherQuery(intent, callback); break;
        case INTENT.STATEMENT: processWeatherStatement(intent, callback); break;
        case INTENT.TIME_QUERY: processWeatherTimeQuery(intent, callback); break;
        default:
            callback(false, "Ignored as '"+reply.outcome.intent+"' is not a known type");
    }
}

function processWeatherTimeQuery(intent, callback) {
    console.error("Not implemented yet!");
}

function processWeatherStatement(intent, callback) {
    console.error("Not implemented yet!");
};

function processWeatherQuery(intent, callback) {  
    
    var averageDate = intent.getAverageUnixTime();
    var weatherType = intent.getWeatherType();
    var weatherTemperature = intent.getWeatherTemperature();
    var timePeriod = intent.getTimePeriod();
    
    WEATHER_API.getWeatherAt(averageDate, function(weather, queriedTimestamp) {
     
        if(typeof weather === 'undefined') {
          console.error('Unable to get weather at ' + queriedTimestamp, weather);
          return;  
        }
          
        var weatherTypeString = getWeatherTypeString(weatherType, weather, timePeriod.name);
        var weatherTemperatureString = getWeatherTemperatureString(weatherTemperature, weather, timePeriod.name);      
        
        var weatherString = capitaliseFirstLetter(weather.description);
        
        if(weather.temp_min != weather.temp_max) 
          weatherString += " with highs of "+Math.round(weather.temp_max)+"\u2103 and lows of "+Math.round(weather.temp_min)+"\u2103.";
        else
          weatherString += " with an average of "+weather.temp+"\u2103."
        
        var tweet = "";
        
        if(weatherTypeString)
          tweet += weatherTypeString + " ";
        else if(weatherTemperatureString)
          tweet += weatherTemperatureString + " ";
          
        // Avoid short tweets, add extra detail!  
        if(!weatherTypeString && !weatherTemperatureString)
          tweet = "The forecast for "+timePeriod.name+" is: " + weatherString;
        else
          tweet += weatherString; 
        
        callback(tweet);          
    });
}

function getWeatherTypeString(type, weather, periodName) {

    // weather_type: snow, rain, hail, thunder, sunny, cloudy
    // weather API: 'clear x', 'few clouds x', 'scattered clouds x', 'broken clouds x', 'drizzle x', 'rain x', 'thunder x', 'snow x', 'mist'
    
    if(type && weather.mapping) {      
        if(type == 'snow')
           if(weather.mapping == 'snow')
               return ("Yes! It looks like it is going to snow " + periodName + "!");
           else
               return ("No, it's not going to snow " + periodName + ".");
               
        else if(type == 'rain')
           if(weather.mapping == 'rain')
               return ("Unfortunately it looks like it is going to rain " + periodName + ".");
           else if(weather.mapping == 'drizzle')
               return ("It looks like there's going to be a little rain " + periodName + ".");
           else
               return ("Good news, there's no rain forecast " + periodName + "!");
               
        /*else if(type == 'hail' && weather.mapping == 'hail')
           if(weather.mapping == 'hail')
               return ("Hail is forecast "+timePeriod.name."!");
           else
               return ("There's no hail forecast "+timePeriod.name);*/
               
        else if(type == 'thunder')
           if(weather.mapping == 'thunder')
               return ("Yes, a thunderstorm is forecast " + periodName + "!");
           else
               return ("Luckily there's no thunder forecast " + periodName + ".");
               
        else if(type == 'sunny')
           if(weather.mapping == 'clear')
               return ("Sun is forecast " + periodName + ", it's going to be around "+Math.round(weather.temp)+" degrees!");
           else if(weather.mapping == 'few clouds')
               return ("It should be sunny " + periodName + ", but there will be a few clouds.");
           else
               return ("It doesn't like it's going to be sunny " + periodName + ".");
        
        else if(type == 'cloudy')
           if(weather.mapping == 'scattered clouds')
               return ("There is a little cloud forecast " + periodName + ".");
           else if(weather.mapping == 'broken clouds')
               return ("There will be heavy cloud " + periodName + ".");
           else
               return ("There's no cloud forecast " + periodName + ".");
    }
    
    return;
}

function getWeatherTemperatureString(temperature, weather, periodName) {

    // weather_temperature: very cold, cold, neutral, warm, very warm
    if(temperature !== false) {
        if(weather.temp < 5)
            if(temperature == 'very cold')
                return ("Yes, it's going to be very cold " + periodName + ".");
            else
                return ("Luckily it's going to be "+Math.round(weather.temp)+" " + periodName + ", so not too cold!");
                
        else if(weather.temp < 10)
            if(temperature == 'cold')
                return ("It looks like it's going to be cold " + periodName + ".");
            else
                return ("It's going to be "+Math.round(weather.temp)+" degrees " + periodName + ".");
            
        else if(weather.temp < 15)
            if(temperature == 'neutral')
                return ("It's going to be an average temperature " + periodName + ".");
            else
                return ("No, it's going to be average " + periodName + ".");
            
        else if(weather.temp < 20)
            if(temperature == 'warm')
                return ("It should be warmer than usual " + periodName + ".");
            else
                return ("It's going to be warmer than usual " + periodName + ".");
            
        else if(weather.temp >= 20)
            if(temperature == 'very warm')
                return ("Yes, it should be very warm " + periodName + ".");
            else
                return ("No, it's going to be very warm " + periodName + ".");
    }
    
    return;
}

function capitaliseFirstLetter(string)
{
    return string.charAt(0).toUpperCase() + string.slice(1);
}