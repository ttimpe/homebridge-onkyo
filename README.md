# homebridge-onkyo
[![NPM Version](https://img.shields.io/npm/v/homebridge-onkyo.svg)](https://www.npmjs.com/package/homebridge-onkyo)
Homebridge module for Onkyo receivers (tested on TX-NR609 and TX-8050)

# Description

This is an enhanced fork from the original/unmaintained homebridge-onkyo-avr plugin written by gw-wiscon.

Ensure that the Onkyo is controllable using the OnkyoRemote3 iOS app.

For Troubleshooting look in the homebridge-onkyo/node_modules/eiscp/examples directory and see if you can run 3.js. "node 3.js". It should output all available commands.

New version 0.4.x includes support for volume, mute, and has options for setting default_input.
Existing users be sure to update the "accessory" config to "Onkyo".

For Siri Control of Volume and Mute - Use an app like EVE which has the volume control slider and create scenes for "Volume Mute" or "Volume Unmute", and/or various volume level scenes like "Volume Low" or "Volume Loud". It may be easiest to set the volume first using the OnkyoRemote3 app and then creating the scene so the volume is pre-set.

For Alexa Control of Volume and Mute - (if using the Alexa plugin) - create DummySwitches (homebridge-dummy) and setup an automation to run the scene created from above. "Alexa, turn on Volume Loud."

# Installation

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
**model**					| (required) Must remain "TX-NR609" (Something to explore in the future for other models.)
**poll_status_interval**  	| (Optional) Poll Status Interval. Defaults to 0 or no polling.
**default_input**  			| (Optional) A valid source input. Default will use last known input. See output of 3.js in eiscp/examples for options.
**default_volume**  		| (optional) Initial receiver volume upon powerup. This is the true volume number, not a percentage. Ignored if powerup from device knob or external app (like OnkyoRemote3).
**max_volume**  			| (optional) Receiver volume max setting. This is a true volume number, not a percentage, and intended so there is not accidental setting of volume to 80. Ignored by external apps (like OnkyoRemote3). Defaults to 30. 
**map_volume_100**  		| (optional) Will remap the volume percentages that appear in the Home app so that the configured max_volume will appear as 100% in the Home app. For example, if the max_volume is 30, then setting the volume slider to 50% would set the receiver's actual volume to 15. Adjusting the stereo volume knob to 35 will appear as 100% in the Home app. This option could confuse some users to it defaults to off false, but it does give the user finer volume control especially when sliding volume up and down in the Home app. Defaults to False.