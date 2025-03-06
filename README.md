# <img width="24px" src="./img/sonarrToRSS.png" alt="Sonarr to RSS"></img> Sonarr to RSS

Sonarr to RSS is a [Sonarr](https://sonarr.tv/ "Sonarr") Webhook connection endpoint that streams
events to RSS/Atom/JSON feeds and provides a paginated website to browse historical events.

#### Light mode
[![Light
mode](img/lightMode.png)](https://raw.githubusercontent.com/gbendy/sonarrToRSS/main/img/lightMode.png)

#### Dark mode
[![Dark
mode](img/darkMode.png)](https://raw.githubusercontent.com/gbendy/sonarrToRSS/main/img/darkMode.png)

#### RSS feed
[![RSS feed](img/feed.png)](https://raw.githubusercontent.com/gbendy/sonarrToRSS/main/img/feed.png)

## Getting Started

### Docker

Sonarr to RSS can be conveniently installed via [Docker](https://hub.docker.com/r/gbendy/sonarrtorss
"Docker").

### Unraid

Sonarr to RSS is available as an [Unraid](https://unraid.net "Unraid") Community Application. Just
search for 'Sonarr to RSS' in the `Apps` tab to install.

### From Source

Sonarr to RSS requires Node.js 20 or later and can be run directly from a repository clone.

```
git clone https://github.com/gbendy/sonarrToRSS.git
cd sonarrToRSS
npm install
npm run build
npm run start
```

Once started connect to `http://localhost:18989`, set initial configuration then configure a Sonarr
Webhook Connection to send events to `http://localhost:18989/sonarr`. RSS feed is available at
`http://localhost:18989/rss`.

## Features

### Current Features

- Simple and convenient file based persistence, no external services required.
- Minimal configuration. Set a username and password on initial load and you're good to go. All
  configuration changes can be applied in situ. No restarts!
- Content aware event rendering provides rich event specific data. Add connection information for
  your Sonarr installation to add series banner images in events.
- Light and dark themes.
- Supports domain and subfolder based reverse proxies.
  [SWAG](https://docs.linuxserver.io/general/swag "SWAG") version 2.11 and greater includes
  configuration files for Sonarr to RSS. Alternatively, configuration files are available
  [here](swag "Swag configuration files").
- Configurable cooldown for Health events to suppress transient issues from the feed, or purge them
  from history entirely.

### Authentication

Sonarr to RSS requires authentication for both the browser interface and the Sonarr webhook
endpoint. Feed endpoints are not authenticated and there is no way to enable this.

#### Local Access

If you do not expose the app externally and/or do not wish to have authentication required for local
(e.g. LAN) access then change Authentication => Required to `Disabled For Local Addresses`. As this
removes authentication from the browser interface it is the user's responsibility to understand the
risks. Sonarr to RSS uses [ipaddr.js](https://www.npmjs.com/package/ipaddr.js) to identify local IP
addresses. Any ips in the following ranges are considered local and exempt from authentication:

- `loopback`
- `private`
- `linkLocal`
- `uniqueLocal`

Note that the Sonarr webhook endpoint will still require authentication.

#### External Authentication

If you use an external authentication method such as Authelia, Authetik, NGINX Basic auth, etc. you
can prevent the need to double authenticate by shutting down the app, setting
`"authenticationMethod: "external"` in the `config.json` file, and restarting the app. This will
disable Sonarr to RSS based authentication for all endpoints. It is expected that authentication is
then handled by a higher level reverse proxy.

An additional supported setting is `"authenticationMethod: "externalExceptWebhook"`. This disables
authentication for all endpoints except for the Sonarr webhook.

Neither of these options are available via the configuration interface unless first set in
`config.json` directly.

#### Summary

The following table summarises which endpoints require authentication under different configuration
combinations.

| authenticationMethod | authenticationRequired | browser | webhook | feed | browser (local) | webhook (local) | feed (local) |
| --- | --- | :---: | :---: | :---: | :---: | :---: | :---: |
| `forms` | `enabled` | ✅ | ✅ | ❌ | ✅ | ✅ | ❌
| `forms` | `disabledForLocalAddresses` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| `externalExceptWebhook` | `enabled` | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| `externalExceptWebhook` | `disabledForLocalAddresses` | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ |
| `external` | `enabled` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `external` | `disabledForLocalAddresses` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

##### Endpoint categories

- webhook: `/sonarr`
- feed: `/rss` `/atom` `/json`
- brower: all other endpoints

The (local) suffix indicates access from the local network.

## I've forgotten my password!

Cleansing with fire is the preferred solution to this problem.

Alternatively, shutdown the server. Edit `config.json` and set `"configured": false` then restart
the server. It will start in initial configuration mode, with your original configuration intact and
force you to set a new password.

## Releases

### 1.0.2 (22/6/24) [Changelog](CHANGELOG.md)

1.0.1 (11/4/24)
[Changelog](https://github.com/gbendy/sonarrToRSS/blob/b89592ffed29850fa7e08fe7d6ec087d3c48ccfa/CHANGELOG.md)

1.0.0 (31/3/24)
[Changelog](https://github.com/gbendy/sonarrToRSS/blob/af5c46bddcfa012ac3ca8461905364f361d5b33a/CHANGELOG.md)

## Contributing

### Development

This project exists thanks to all the people who
[contribute](https://github.com/gbendy/sonarrToRSS/graphs/contributors "Contributers").

- [Brendan Hack](https://github.com/gbendy "Brendan Hack")

To help out fork the repository, make same changes and submit a PR.

### Licenses

- [GNU GPL v3](http://www.gnu.org/licenses/gpl.html)
- Copyright 2024
