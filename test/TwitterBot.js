
var should = require("should");
var libpath = require("./libpath.js");

describe('TwitterBot', function() {
  var wit = require(libpath.getPath() + '/TwitterBot.js');
})

/*
  testMessages = [];
  //testMessages.push('what will the weather be Manchester next weekend?');
  /*testMessages.push('I hope it\'s sunny in manchester this weekend!');
  testMessages.push('will it be warm this weekend?');
  testMessages.push('is it going to be warm tomorrow?');
  testMessages.push('is it going to be cold this weekend?');
  testMessages.push('is there snow forecast?');
  
  for(i=0; i < testMessages.length; i++) {
    processNewTweet({text: testMessages[i], id: i, user: {screen_name: 'Pezmc', id: 1}});
  }
*/
