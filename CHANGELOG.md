## 0.3.0.0
* [bugfix] Terminal dimensions in browser match upon initial connection, instead of after resizing

## 0.2.0.0
* Add ability to copy+paste using keystrokes (copy with ctrl+shift+c or ctrl+shift+x, and paste with ctrl+shift+v)
* Add a status bar to the bottom of the page
* Show terminal dimensions in bottom status bar
* Add toasts to notify user of various events
* Fix bug where connected browsers do not have their websocket connection closed when terminal closes, which makes it look like the terminal is still connected when it is not.
* Improve error messages, in particular if there is no server running
* Fixed bug where websocket connection is briefly accepted regardless of whether a valid terminal id is provided to `/terminal/{terminal_id}`. Instead of returning a JSON object with the TermPair version, a 404 error is now returned.
* [dev] migrate codebase to typescript
* [dev] use React functional component instead of class component for main application

## 0.1.1.1
* Fix server bug when using SSL certs (#44)

## 0.1.1.0
* Ensure error message is printed to browser's terminal if site is not served in a secure context (#39)
* Make default TermPair terminal client port 8000 to match default server port (#38)
* Always display port to connect to in browser's connection instructions

## 0.1.0.2
* Change default sharing port to None due to difficulties sharing to port 80/reverse proxies
* Print port in web UI's sharing command

## 0.1.0.1
* Remove debug message from server

## 0.1.0.0

* Pin dependencies
* Change default sharing port to 8000 to match default server port

## 0.0.1.3

* Upgrade xtermjs

## 0.0.1.2

* Update landing page when terminal id is not provided

## 0.0.1.1

* Fix pipx install link in frontend

## 0.0.1.0

* Add end-to-end encryption
* Change `termpair serve` to allow browser control by default, and update CLI API by replacing `-a` flag with `-n` flag.

## 0.0.3.0

* Use FastAPI on backend and update UI
