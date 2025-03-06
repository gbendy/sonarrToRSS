# Change Log

## 1.0.3 - 2025-03-06

### Bug fixes

Fixed issue where if Sonarr was not connectable at startup then no Sonarr API requests would
succeed even if Sonarr became connectable at a later time.

## 1.0.2 - 2024-06-22

### New Features

Added renderer for 'ManualInteractionRequired' events. All Sonarr event types now have specialised
renders.

Added configuration option to disable authentication for local network access.

Added configuration file option to disable authentication entirely for when authentication is
provided by a reverse proxy.

## 1.0.1 - 2024-04-11

### New Features

Added configurable limits to image caching memory usage to prevent unbounded memory consumption.

Added configurable limits to feed size to limit feed download size.

Added support for configurable log levels.

Added renderer for 'Rename' events.

Example SWAG configurations updated to exempt API and feed endpoints from SWAG authentication.

### Bug fixes

Fixed issue where series banners may not appear in feed messages.

## 1.0.0 - 2024-03-31

Initial release