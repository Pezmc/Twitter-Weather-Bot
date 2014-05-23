
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
    
    var timePeriod = { from: new Date(), to: new Date(), name: 'today' }
    if(entities.datetime) {
        if(Array.isArray(entities.datetime)) {
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
    }
    
    // weather_type: snow, rain, hail, thunder, sunny, cloudy
    var weatherType = false;
    if(entities.weather_type) {
       weatherType = entities.weather_type.value;
    }
    
    // weather_temperature: very cold, cold, neutral, warm, very warm
    var weatherTemperature = false;
    if(entities.weather_temperature) {
       weatherTemperature = entities.weather_temperature.value;
    }
    
    // get the weather for that date
    var from = new Date(timePeriod.from).getTime()/1000;
    var to = new Date(timePeriod.to).getTime()/1000;
    var averageDate = Math.round(from + to)/2;
    
    WEATHER_API.getWeatherAt(averageDate, function(weather) {
      
        var weatherTypeString = getWeatherTypeString(weatherType, weather, timePeriod.name);
        var weatherTemperatureString = getWeatherTemperatureString(weatherTemperature, weather, timePeriod.name);      
        
        var weatherString = "The forecast is "+weather.description+" at "+Math.round(weather.temp)+" degrees.";
        
        if(weatherTypeString)
          console.log(weatherTypeString);
        else if(weatherTemperatureString)
          console.log(weatherTemperatureString);
          
        console.log(weatherString);
          
    });
    
    callback("Would have attempted to parse query");
}

function getWeatherTypeString(type, weather, periodName) {

    // weather_type: snow, rain, hail, thunder, sunny, cloudy
    // weather API: 'clear x', 'few clouds x', 'scattered clouds x', 'broken clouds x', 'drizzle x', 'rain x', 'thunder x', 'snow x', 'mist'
    
    if(type) {      
        if(type == 'snow')
           if(weather.mapping == 'snow')
               return ("Yes! It looks like it is going to snow " + periodName + "!");
           else
               return ("No, it's not going snow " + periodName + ".");
               
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
    
    return "";
}

function getWeatherTemperatureString(temperature, weather, periodName) {
    // weather_temperature: very cold, cold, neutral, warm, very warm
    if(temperature !== false) {
        if(weather.temp < 5)
            if(temperature == 'very cold')
                console.log("Yes, it's going to be very cold " + periodName + ".");
            else
                console.log("Luckily it's going to be "+Math.round(weather.temp)+" " + periodName + ", so not too cold!");
                
        else if(weather.temp < 10)
            if(temperature == 'cold')
                console.log("It looks like it's going to be cold " + periodName + ".");
            else
                console.log("It's going to be "+Math.round(weather.temp)+" degrees " + periodName + ".");
            
        else if(weather.temp < 15)
            if(temperature == 'neutral')
                console.log("It's going to be an average temperature " + periodName + ".");
            else
                console.log("It's going to be warmer than usual " + periodName + ".");
            
        else if(weather.temp < 20)
            if(temperature == 'warm')
                console.log("It should be warmer than usual " + periodName + ".");
            else
                console.log("It's going to be warmer than usual " + periodName + ".");
            
        else if(weather.temp >= 25)
            if(temperature == 'very warm')
                console.log("Yes, it should be very warm " + periodName + ".");
            else
                console.log("No, it's going to be very warm " + periodName + ".");
    }
}