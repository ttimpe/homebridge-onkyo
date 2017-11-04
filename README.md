# homebridge-onkyo
[![NPM Version](https://img.shields.io/npm/v/homebridge-onkyo.svg)](https://www.npmjs.com/package/homebridge-onkyo)

Homebridge plugin for Onkyo Receivers
Should work for all supported models as listed in the yaml file under node_modules/eiscp/eiscp-commands.yaml.

# Description

This is an enhanced fork from the original/unmaintained homebridge-onkyo-avr plugin written by gw-wiscon.
Existing users of my original fork or gw-wiscon's be sure to update the "accessory" config to "Onkyo".

# Changelog

Version 0.5.x includes support for input-selector. Available inputs are dynamically pulled from the eiscp-commands.json file. Note: Not all inputs may work with your receiver.
Version 0.4.x includes support for volume, mute, and has options for setting default_input.

For Siri Control of Volume, Mute, and Input - Use an app like EVE which has control sliders and create scenes for "Volume Mute" or "Volume Unmute", and/or various volume level scenes like "Volume Low" or "Volume Loud", or for inputs like "input network" or "input fm". It may be easiest to set the volume or Input first using the OnkyoRemote3 app and then creating the scenes so the volume or input is pre-set (without using the slider).

For Alexa Control of Volume, Mute, Input - (if using the Alexa plugin) - create DummySwitches (homebridge-dummy) and setup an automation to run the scene created from above. "Alexa, turn on Volume Loud."

# To Do

Complete re-write to convert to a Platform. This will allow for auto discovery of all receivers (if more than one exist), and other flexibility.
Adding Speaker A/B on/off control
Multi-Zone support
Others...

# Installation

Ensure that the Onkyo receiver is controllable using the OnkyoRemote3 iOS app.
For Troubleshooting look in the homebridge-onkyo/node_modules/eiscp/examples directory and see if you can run 3.js. "node 3.js". It should output all available commands.

1. Install homebridge using: npm install -g homebridge
2. Install this plugin using: npm install -g homebridge-onkyo
3. Update your configuration file. See the sample below.

# Configuration

Example accessory config (needs to be added to the homebridge config.json):
 ```
"accessories": [
	{
		"accessory": "Onkyo",
		"name": "Stereo",
		"ip_address": "10.0.1.23",
		"model" : "TX-NR609",
		"poll_status_interval": "900",
		"default_input": "net",
		"default_volume": "10",
		"max_volume": "35",
		"map_volume_100": true
	}
]
 ```
###Config Explanation:

Field           			| Description
----------------------------|------------
**accessory**   			| (required) Must always be "Onkyo".
**name**        			| (required) The name you want to use for control of the Onkyo accessories.
**ip_address**  			| (required) The internal ip address of your Onkyo.
**model**					| (required) Must be a valid model listed in node_modules/eiscp/eiscp-commands.yaml file. If your model is not listed, you can use the TX-NR609 if your model supports the Integra Serial Communication Protocol (ISCP).
**poll_status_interval**  	| (Optional) Poll Status Interval. Defaults to 0 or no polling.
**default_input**  			| (Optional) A valid source input. Default will use last known input. See output of 3.js in eiscp/examples for options.
**default_volume**  		| (optional) Initial receiver volume upon powerup. This is the true volume number, not a percentage. Ignored if powerup from device knob or external app (like OnkyoRemote3).
**max_volume**  			| (optional) Receiver volume max setting. This is a true volume number, not a percentage, and intended so there is not accidental setting of volume to 80. Ignored by external apps (like OnkyoRemote3). Defaults to 30.
**map_volume_100**  		| (optional) Will remap the volume percentages that appear in the Home app so that the configured max_volume will appear as 100% in the Home app. For example, if the max_volume is 30, then setting the volume slider to 50% would set the receiver's actual volume to 15. Adjusting the stereo volume knob to 35 will appear as 100% in the Home app. This option could confuse some users to it defaults to off false, but it does give the user finer volume control especially when sliding volume up and down in the Home app. Defaults to False.
