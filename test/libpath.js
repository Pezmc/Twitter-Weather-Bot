
exports.getPath = function() {
	return libpath = process.env['TWITTER_WEATHER_COV'] ? '../lib-cov' : '../lib';
}
