var should = require("should");
var libpath = require("./libpath.js");

describe('Wit', function() {
  var wit = require(libpath.getPath() + '/Wit.js');
  describe('+query()', function() {
    it('should return a valid results object', function(done){
      wit.query('what will the weather be today?', function(results) {
        
        results.should.be.ok;
        
        results.msg_id.should.be.ok;
        results.msg_body.should.equal('what will the weather be today?');
        results.outcome.should.be.ok;
        
        done();
      })
    })
  })
  
  describe('#witWeatherQuery', function() {
    it('should return intent weather_query', function(done){
      wit.query('what will the weather be today?', function(results) {
        
        results.msg_body.should.equal('what will the weather be today?');
        results.outcome.intent.should.equal('weather_query');
        
        done();
      })
    })
  })
  
  describe('#witWeatherStatement', function() {
    it('should return intent weather_statement', function(done){
      wit.query('it has been raining today', function(results) {
        
        results.msg_body.should.equal('it has been raining today');
        results.outcome.intent.should.equal('weather_statement');
        
        done();
      })
    })
  })
  
  describe('#witWeatherTimeQuery', function() {
    it('should return intent weather_time_query', function(done){
      wit.query('when will it stop raining?', function(results) {
        
        results.msg_body.should.equal('when will it stop raining?');
        results.outcome.intent.should.equal('weather_time_query');
        
        done();
      })
    })
  })
})
