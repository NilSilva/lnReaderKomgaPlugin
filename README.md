# Komga plugin for [LNReader](https://github.com/LNReader/lnreader)

Mostly for personal use since, as far as I know, there is no way to let user configure the server url. But if you're willing to mess around with things it will probably work.

I had issues with cors and fixed it with a proxy. [Here](https://4bit.dev/posts/caddy-cors-proxy/) is the tutorial i used. I already had a proxy so just used the Caddyfile configuration.

To add it to the app I created my personal repository by using caddy and serving the plugin through that.

Other than that just put your komga server url in the site variable. You can also add library filter by following the example commented out.