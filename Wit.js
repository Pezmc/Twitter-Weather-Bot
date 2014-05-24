var https = require("https");
var querystring = require('querystring');

exports.query = function(text, callback) {
    var options = {
      hostname: 'api.wit.ai',
      port: 443,
      path: '/message?'+querystring.stringify({'v': '20140524', 'q': text}),
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