# A buyer whose country is unknown pays full price; we never look it up over the network

Purchasing-power prices depend on the buyer's country. `resolveCountry` takes it only from the request itself: the `CF-IPCountry` header behind Cloudflare (or the DevUI override in development). When neither is there, the country is unknown and the buyer pays full price. This overcharges some learners purchasing-power pricing is meant for, but a page never waits on a network call to learn the country.

## Considered Options

- **Look the IP up on ip-api.com.** Rejected: the course list, purchase page and every lesson page for a discounted purchase would wait on a network call, and the free endpoint is plain HTTP and limited to 45 requests a minute.
- **Bundle a MaxMind GeoLite2 database.** Rejected: it needs a licence key, a download of tens of megabytes, and an update every month.
