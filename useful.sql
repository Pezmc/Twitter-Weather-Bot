SELECT *,count(id) as count FROM seen_tweets GROUP BY username ORDER BY count DESC

SELECT seen.username,seen.text,sent.text,seen.streamed FROM sent_tweets as sent LEFT JOIN seen_tweets as seen ON related_tweet_id = seen.id
