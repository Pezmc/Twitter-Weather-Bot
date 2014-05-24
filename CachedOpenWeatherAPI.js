var weather = require('openweathermap')
var db = null;
var city_id = 0;

// http://api.openweathermap.org/data/2.5/forecast?id=2643123&mode=json&appid=
// f3794e46bd7505e6a7746cb0379550ed
// http://bugs.openweathermap.org/projects/api/wiki/Weather_Condition_Codes

exports.config = function(weather_config, city, database) {
    weather.defaults(weather_config);
    db = database;
    city_id = city;
    
    // Ensure the database is ready for use
    db.serialize(function() {
      db.run("CREATE TABLE IF NOT EXISTS daily_weather (timestamp INTEGER PRIMARY KEY, main TEXT, description TEXT, mapping TEXT, temp_min INTEGER, temp_max INTEGER, temp INTEGER)");
      db.run("CREATE TABLE IF NOT EXISTS hourly_weather (timestamp INTEGER PRIMARY KEY, main TEXT, description TEXT, mapping TEXT, temp_min INTEGER, temp_max INTEGER, temp INTEGER)");
      db.run("CREATE TABLE IF NOT EXISTS update_times (timestamp INTEGER)");
    });
}

exports.start = function(update_minutes) {
    if(!db) { 
        console.error("No database has been defined, use config() first!");
        return;
    }
    
    db.get("SELECT * FROM update_times ORDER BY timestamp DESC LIMIT 1", function(err, res) {
        if(res && (getTimestamp() - res.timestamp < (update_minutes * 60 * 1000 * 0.5))) 
            console.info("Not updating weather as we have updated in the last "+update_minutes*0.5+" minutes.");
        else
            updateWeatherCache();
    });
    setInterval(updateWeatherCache, update_minutes * 60 * 1000);   
}

exports.getWeatherAt = function(timestamp, callback) {

    db.get("SELECT * FROM hourly_weather ORDER BY timestamp DESC LIMIT 1", function(err, res) {
        // We need to check daily if hourly is too old
        var oldestHourly = getTimestamp();
        if(res && res.timestamp)
            oldestHourly = res.timestamp;
       
        if(oldestHourly >= timestamp)
            getHourlyWeather(timestamp, callback); 
        else
            getDailyWeather(timestamp, callback); 
    });

}

exports.getDayWeatherAt = function(timestamp, callback) {
    getDailyWeather(timestamp, callback);
}

function getHourlyWeather(timestamp, callback) {
    var hourly = db.prepare("SELECT * FROM hourly_weather WHERE timestamp <= $timestamp ORDER BY timestamp DESC LIMIT 1");
    hourly.get({$timestamp: timestamp}, function(err, res) {
        if(err) 
            console.warn("While searching hourly weather: ", err)
        callback(res, timestamp);
    });
}

function getDailyWeather(timestamp, callback) {
    var daily = db.prepare("SELECT * FROM daily_weather WHERE timestamp <= $timestamp ORDER BY timestamp DESC LIMIT 1");
    daily.get({$timestamp: timestamp}, function(err, res) {
        if(err) 
            console.warn("While searching daily weather: ", err)
        callback(res, timestamp);
    });
}

function getTimestamp() {
    return Math.round(new Date().getTime()/1000);
}

function updateWeatherCache() {
    var insert = db.prepare("INSERT INTO update_times VALUES ($timestamp)");
    console.info("Updating the stored weather information");
    
    // The 3 hours forecast is available for 5 days. Daily forecast is available for 14 days
    /*weather.now({id: MANCHESTER_CITY_ID}, function(data) {      
        weatherCache.now = weatherDataToWeatherObject(data);
    });*/
    
    var insertHourly = db.prepare("INSERT OR IGNORE INTO hourly_weather (timestamp, main, description, mapping, temp_min, temp_max, temp)"
                                + "VALUES ($timestamp, $main, $description, $mapping, $temp_min, $temp_max, $temp)");
    weather.forecast({id: city_id, cnt: 5}, function(reply) {                   
        reply.list.forEach(function(data) {
            insertHourly.run(weatherDataToWeatherObject(data));
        })
        insert.run({$timestamp: getTimestamp()});
        console.info("Update of hourly weather complete");
    });

    var insertDaily = db.prepare("INSERT OR IGNORE INTO daily_weather (timestamp, main, description, mapping, temp_min, temp_max, temp)"
                               + "VALUES ($timestamp, $main, $description, $mapping, $temp_min, $temp_max, $temp)");
    weather.daily({id: city_id, cnt: 14}, function(reply) {
        reply.list.forEach(function(data) {
            insertDaily.run(weatherDataToWeatherObject(data));
        })
        insert.run({$timestamp: getTimestamp()});
        console.info("Update of daily weather complete");
    });
}

function weatherDataToWeatherObject(data) {
    // weather_type: snow, rain, hail, thunder, sunny, cloudy
    var weathermapping = {
        '01': 'clear',
        '02': 'few clouds',
        '03': 'scattered clouds',
        '04': 'broken clouds',
        '09': 'drizzle',
        '10': 'rain',
        '11': 'thunder',
        '13': 'snow',
        '50': 'mist'
    }
    
    var weather = {};
    
    if(data.dt)
        weather.$timestamp = data.dt;
    
    if(data.weather && data.weather[0]) {
        weather.$main = data.weather[0].main;
        weather.$description = data.weather[0].description;
        
        var iconID = data.weather[0].icon.substring(0,2);
        weather.$mapping = weathermapping[iconID];
    }
    
    if(data.temp) {
        weather.$temp = data.temp.day;
        weather.$temp_min = data.temp.min;
        weather.$temp_max = data.temp.max;
    } else if(data.main) {
        weather.$temp = data.main.temp;
        weather.$temp_min = data.main.temp_min;
        weather.$temp_max = data.main.temp_max;
    };

    return weather;
}