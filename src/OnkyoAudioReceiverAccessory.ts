import {
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  Characteristic,
  HAP,
  IndependentPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Categories
} from "homebridge";

import OnkyoZone from './OnkyoZone'
import OnkyoAudioReceiverPlatform from './OnkyoAudioReceiverPlatform'
var pollingtoevent = require('polling-to-event');
var RxInputs: any

export default class OnkyoAudioReceiverAccessory {




		private manufacturer: string = "Onkyo"
		private buttons: any
		private state: any
		private m_state: boolean = false
		private v_state: any
		private i_state: any
		private maxVolume = 60
		private cmdMap :any = {
			main: new OnkyoZone("system-power", "master-volume", "audio-muting", "input-selector"),
			zone2: new OnkyoZone("power", "volume", "muting", "selector")
		}

		private name: string
		private enabledServices: Service[]
		private ipAddress: string
		private model: string
		private zone: string
		private inputs: any

		private interval: number

		private serial: string

		private tvService: Service
		private tvSpeakerService: Service

		private setAttempt: number = 0

		private filter_inputs: any


		private defaultInput: string
		private defaultVolume: number
		private mapVolume100: boolean = true

		private switchHandling: string = "check"

		private eiscp = require('eiscp')

	constructor (
		private readonly platform: OnkyoAudioReceiverPlatform,
		private readonly accessory: PlatformAccessory,
		private readonly config: any,
		private readonly log: Logging
		) {
		this.platform = platform;
		this.log = platform.log;




		this.buttons = {
			[this.platform.api.hap.Characteristic.RemoteKey.REWIND]: 'rew',
			[this.platform.api.hap.Characteristic.RemoteKey.FAST_FORWARD]: 'ff',
			[this.platform.api.hap.Characteristic.RemoteKey.NEXT_TRACK]: 'skip-f',
			[this.platform.api.hap.Characteristic.RemoteKey.PREVIOUS_TRACK]: 'skip-r',
			[this.platform.api.hap.Characteristic.RemoteKey.ARROW_UP]: 'up', // 4
			[this.platform.api.hap.Characteristic.RemoteKey.ARROW_DOWN]: 'down', // 5
			[this.platform.api.hap.Characteristic.RemoteKey.ARROW_LEFT]: 'left', // 6
			[this.platform.api.hap.Characteristic.RemoteKey.ARROW_RIGHT]: 'right', // 7
			[this.platform.api.hap.Characteristic.RemoteKey.SELECT]: 'enter', // 8
			[this.platform.api.hap.Characteristic.RemoteKey.BACK]: 'exit', // 9
			[this.platform.api.hap.Characteristic.RemoteKey.EXIT]: 'exit', // 10
			[this.platform.api.hap.Characteristic.RemoteKey.PLAY_PAUSE]: 'play', // 11
			[this.platform.api.hap.Characteristic.RemoteKey.INFORMATION]: 'home', // 15
		};


		this.config = config;
		this.name = this.config["name"];
		this.ipAddress	= this.config["ip_address"];
		this.model = this.config["model"];
		this.zone = this.config["zone"] || "main";
		this.inputs = this.config["inputs"];

		this.filter_inputs = this.config["filter_inputs"] || false;


		this.interval = parseInt(this.config["poll_status_interval"])
		this.defaultInput = this.config["default_input"];
		this.defaultVolume = this.config['default_volume'];
		this.maxVolume = this.config['max_volume'] || 60;
		this.mapVolume100 = this.config['map_volume_100'] || true;



		this.interval = config["interval"];
		this.manufacturer = "Onkyo";

		if (this.interval > 10 && this.interval < 100000) {
			this.switchHandling = "poll";
		}

		this.eiscp.on('debug', this.eventDebug.bind(this))
		this.eiscp.on('error', this.eventError.bind(this))
		this.eiscp.on('connect', this.eventConnect.bind(this))
		this.eiscp.on('close', this.eventClose.bind(this))
		this.eiscp.on(this.cmdMap[this.zone].power, this.eventSystemPower.bind(this))
		this.eiscp.on(this.cmdMap[this.zone].volume, this.eventVolume.bind(this))
		this.eiscp.on(this.cmdMap[this.zone].muting, this.eventAudioMuting.bind(this))
		this.eiscp.on(this.cmdMap[this.zone].input, this.eventInput.bind(this))

		this.eiscp.connect(
			{host: this.ipAddress, reconnect: true, model: this.model}
		)

		this.setUp()
	}

	setUp() {
		this.createRxInput()
		this.polling(this)

		const infoService = this.createAccessoryInformationService()
		this.enabledServices.push(infoService)
		this.tvService = this.createTvService()
		this.enabledServices.push(this.tvService)
		this.createTvSpeakerService(this.tvService)
		this.enabledServices.push(...this.addSources(this.tvService))

	}

	getServices() {
		return this.enabledServices;
	}
	
	createRxInput() {
	// Create the RxInput object for later use.
		var eiscpData = require('../node_modules/eiscp/eiscp-commands.json')
		var inSets :any[] = []
		for (set in eiscpData.modelsets) {
			eiscpData.modelsets[set].forEach((model: any) => {
				if (model.includes(this.model)) {
					inSets.push(set)
				}
			})
		}
		
		
		var eiscpData = eiscpData.commands.main.SLI.values;
		var newobj = '{ "Inputs" : [';
		for (var exkey in eiscpData) {
			var hold = eiscpData[exkey].name.toString()
			if (hold.includes(',')) {
				hold = hold.substring(0,hold.indexOf(','))
			}
			if (exkey.includes('“') || exkey.includes('“')) {
				exkey = exkey.replace(/\“/g, "")
				exkey = exkey.replace(/\”/g, "")
			}
			if (exkey.includes("UP") || exkey.includes("DOWN") || exkey.includes("QSTN")) {
				continue
			}
			var set = eiscpData[exkey]['models']
			if (inSets.includes(set)) {
				newobj = newobj + '{ "code":"'+exkey+'" , "label":"'+hold+'" },'
			} else {
				continue
			}
		}
		// Drop last comma first
		newobj = newobj.slice(0,-1) + ']}';
		RxInputs = JSON.parse(newobj)
		if (this.filter_inputs) {
			var length = RxInputs['Inputs'].length;
			while(length--) {
				if (this.inputs[RxInputs['Inputs'][length].label]) {
					continue
				} else {
					RxInputs['Inputs'].splice(length, 1)
				}
			}
		}
	}

	polling(accessory: OnkyoAudioReceiverAccessory) {
	// Status Polling
		if (this.switchHandling == "poll") {
			this.log.debug("start long poller..")
	// PWR Polling
			var statusemitter = pollingtoevent((done: any) => {
				this.log.debug("start PWR polling..")
				this.getPowerState( (error: any, response: any) => {
					//pass also the setAttempt, to force a homekit update if needed
					done(error, response, this.setAttempt)
				}, "statuspoll")
			}, {longpolling:true,interval:this.interval * 1000,longpollEventName:"statuspoll"})

			statusemitter.on("statuspoll", (data: any) => {
				this.state = data;
				this.log.debug("event - PWR status poller - new state: ", this.state)
			})
	// Audio-Input Polling
			var i_statusemitter = pollingtoevent((done: any) => {
				this.log.debug("start INPUT polling..")
				this.getInputSource(( error, response) => {
					//pass also the setAttempt, to force a homekit update if needed
					done(error, response, this.setAttempt)
				}, "i_statuspoll")
			}, {longpolling:true,interval:this.interval * 1000,longpollEventName:"i_statuspoll"})

			i_statusemitter.on("i_statuspoll", (data: any) => {
				this.i_state = data;
				this.log.debug("event - INPUT status poller - new i_state: ", this.i_state)

			})
	// Audio-Muting Polling
			var m_statusemitter = pollingtoevent((done: any) => {
				this.log.debug("start MUTE polling..")
				this.getMuteState((error :any, response: any) => {
					//pass also the setAttempt, to force a homekit update if needed
					done(error, response, this.setAttempt)
				}, "m_statuspoll")
			}, {longpolling:true,interval: this.interval * 1000,longpollEventName:"m_statuspoll"})

			m_statusemitter.on("m_statuspoll", (data: any) => {
				this.m_state = data;
				this.log.debug("event - MUTE status poller - new m_state: ", this.m_state)

			})
	// Volume Polling
			var v_statusemitter = pollingtoevent((done: any) => {
				this.log.debug("start VOLUME polling..")
				this.getVolumeState((error: any, response: any) => {
					//pass also the setAttempt, to force a homekit update if needed
					done(error, response, this.setAttempt)
				}, "v_statuspoll")
			}, {longpolling:true,interval:this.interval * 1000,longpollEventName:"v_statuspoll"})

			v_statusemitter.on("v_statuspoll", (data: any) => {
				this.v_state = data
				this.log.debug("event - VOLUME status poller - new v_state: ", this.v_state)
			})
		}
	}

	///////////////////
	// EVENT FUNCTIONS
	///////////////////
	eventDebug(response: any) {
		this.log.debug( "eventDebug: %s", response)
	}

	eventError(response: any) {
		this.log.error( "eventError: %s", response)
	}

	eventConnect(response: any) {
		this.log.debug( "eventConnect: %s", response)
	//	this.reachable = true;
	}

	eventSystemPower(response: any) {
		if (this.state != (response == "on")) {
			this.log.info("Event - System Power changed: %s", response)
		}
		this.state = (response == "on")
		this.log.debug("eventSystemPower - message: %s, new state %s", response, this.state)

	}

	eventAudioMuting(response: any) {
		this.m_state = (response == "on")
		this.log.debug("eventAudioMuting - message: %s, new m_state %s", response, this.m_state)
		//Communicate status
		if (this.tvService ) {
			this.tvService.getCharacteristic(this.platform.api.hap.Characteristic.Mute).updateValue(this.m_state, null, "m_statuspoll")
		}
	}

	eventInput(response: any) {
		if (response) {
			var input = JSON.stringify(response)
			input = input.replace(/[\[\]"]+/g,'')
			if (input.includes(',')) {
				input = input.substring(0,input.indexOf(','))
			}
			// Convert to i_state input code
			const index = 
				input !== null
				? RxInputs.Inputs.findIndex((i: any) => i.label == input)
				: -1;
			if (this.i_state != (index + 1)) {
				this.log.info("Event - Input changed: %s", input)
			}
			this.i_state = index + 1

			this.log.debug("eventInput - message: %s - new i_state: %s - input: %s", response, this.i_state, input)
		} else {
			// Then invalid Input chosen
			this.log.error("eventInput - ERROR - INVALID INPUT - Model does not support selected input.")
		}
		this.getInputSource.bind(this)
	}

	eventVolume(response: any) {
		if (this.mapVolume100) {
			var volumeMultiplier = this.maxVolume/100;
			var newVolume = response / volumeMultiplier;
			this.v_state = Math.round(newVolume)
			this.log.debug("eventVolume - message: %s, new v_state %s PERCENT", response, this.v_state)
		} else {
			this.v_state = response;
			this.log.debug("eventVolume - message: %s, new v_state %s ACTUAL", response, this.v_state)
		}
		//Communicate status
		if (this.tvService ) {
			this.tvService.getCharacteristic(this.platform.api.hap.Characteristic.Volume).updateValue(this.v_state, null, "v_statuspoll")
		}
	}

	eventClose (response: any) {
		this.log.debug( "eventClose: %s", response)
	}

	////////////////////////
	// GET AND SET FUNCTIONS
	////////////////////////
	setPowerState(powerOn: CharacteristicValue, callback: CharacteristicSetCallback, context: string) {
	//if context is statuspoll, then we need to ensure this we do not set the actual value
		if (context && context == "statuspoll") {
			this.log.debug( "setPowerState - polling mode, ignore, state: %s", this.state)
			callback(null, this.state)
			return;
		}
		if (!this.ipAddress) {
			this.log.error("Ignoring request; No ip_address defined.")
			callback(new Error("No ip_address defined."))
			return;
		}
	
		this.setAttempt = this.setAttempt+1;
	
		//do the callback immediately, to free homekit
		//have the event later on execute changes
		this.state = powerOn;
		callback( null, this.state)
		if (powerOn) {
			this.log.debug("setPowerState - actual mode, power state: %s, switching to ON", this.state)
			this.eiscp.command(this.zone + "." + this.cmdMap[this.zone]["power"] + "=on", (error: any, response: any) => {
				//this.log.debug( "PWR ON: %s - %s -- current state: %s", error, response, this.state)
				if (error) {
					this.state = false;
					this.log.error( "setPowerState - PWR ON: ERROR - current state: %s", this.state)
				
				} else {
					// If the AVR has just been turned on, apply the default volume
						this.log.debug("Attempting to set the default volume to " +this.defaultVolume)
						if (powerOn && this.defaultVolume) {
							this.log.info("Setting default volume to " +this.defaultVolume)
							this.eiscp.command(this.zone + "." + this.cmdMap[this.zone]["volume"] + ":" +this.defaultVolume, (error: any, response: any) => {
								if (error) {
									this.log.error( "Error while setting default volume: %s", error)
								}
							})
						}
					// If the AVR has just been turned on, apply the Input default
						this.log.debug("Attempting to set the default input selector to " + this.defaultInput)

						// Handle defaultInput being either a custom label or manufacturer label
						var label = this.defaultInput;
						if (this.inputs) {
							for (var id in this.inputs) {
								if (this.inputs[id] == this.defaultInput) {
									label = id
								}
							}
						}
						const index = 
							label !== null
							? RxInputs.Inputs.findIndex((i: any) => i.label == label)
							: -1;
						this.i_state = index + 1;
						
						if (powerOn && label) {
							this.log.info("Setting default input selector to " + label)
							this.eiscp.command(this.zone + "." + this.cmdMap[this.zone]["input"] + "=" + label, (error: any, response: any) => {
								if (error) {
									this.log.error( "Error while setting default input: %s", error)
								}
							})
						}
				}
			}).bind(this)
		} else {
			this.log.debug("setPowerState - actual mode, power state: %s, switching to OFF", this.state)
			this.eiscp.command(this.zone + "." + this.cmdMap[this.zone]["power"] + "=standby", (error: any, response: any) => {
				//this.log.debug( "PWR OFF: %s - %s -- current state: %s", error, response, this.state)
				if (error) {
					this.state = false;
					this.log.error( "setPowerState - PWR OFF: ERROR - current state: %s", this.state)
				}
			}).bind(this)
		}
	}
	
	getPowerState(callback: CharacteristicGetCallback, context: string) {
		//if context is statuspoll, then we need to request the actual value
		if (context != "statuspoll") {
			if (this.switchHandling == "poll") {
				this.log.debug("getPowerState - polling mode, return state: ", this.state)
				callback(null, this.state)
				return;
			}
		}
	
		if (!this.ipAddress) {
			this.log.error("Ignoring request; No ip_address defined.")
			callback(new Error("No ip_address defined."))
			return;
		}
	
		//do the callback immediately, to free homekit
		//have the event later on execute changes
		callback(null, this.state)
		this.log.debug("getPowerState - actual mode, return state: ", this.state)
		this.eiscp.command(this.zone + "." + this.cmdMap[this.zone]["power"] + "=query", (error: any, data: any) => {
			if (error) {
				this.state = false;
				this.log.debug( "getPowerState - PWR QRY: ERROR - current state: %s", this.state)
			}
		}).bind(this)
	}
	
	getVolumeState(callback: CharacteristicGetCallback, context: string) {
		//if context is v_statuspoll, then we need to request the actual value
		if (context != "v_statuspoll") {
			if (this.switchHandling == "poll") {
				this.log.debug("getVolumeState - polling mode, return v_state: ", this.v_state)
				callback(null, this.v_state)
				return;
			}
		}
	
		if (!this.ipAddress) {
			this.log.error("Ignoring request; No ip_address defined.")
			callback(new Error("No ip_address defined."))
			return;
		}
	
		//do the callback immediately, to free homekit
		//have the event later on execute changes
		callback(null, this.v_state)
		this.log.debug("getVolumeState - actual mode, return v_state: ", this.v_state)
		this.eiscp.command(this.zone + "." + this.cmdMap[this.zone]["volume"] + "=query", (error: any, data: any) => {
			if (error) {
				this.v_state = 0;
				this.log.debug( "getVolumeState - VOLUME QRY: ERROR - current v_state: %s", this.v_state)
			}
		}).bind(this)
	}
	
	setVolumeState(volumeLvl: any, callback: CharacteristicSetCallback, context: string) {
	//if context is v_statuspoll, then we need to ensure this we do not set the actual value
		if (context == "v_statuspoll") {
			this.log.debug( "setVolumeState - polling mode, ignore, v_state: %s", this.v_state)
			callback(null, this.v_state)
			return;
		}
		if (!this.ipAddress) {
			this.log.error("Ignoring request; No ip_address defined.")
			callback(new Error("No ip_address defined."))
			return;
		}
	
		this.setAttempt = this.setAttempt+1;
	
		//Are we mapping volume to 100%?
		if (this.mapVolume100) {
			var volumeMultiplier: number = this.maxVolume/100;
			var newVolume = volumeMultiplier * volumeLvl
			this.v_state = Math.round(newVolume)
			this.log.debug("setVolumeState - actual mode, PERCENT, volume v_state: %s", this.v_state)
		} else if (volumeLvl > this.maxVolume) {
		//Determin if maxVolume threshold breached, if so set to max.
			this.v_state = this.maxVolume
			this.log.debug("setVolumeState - VOLUME LEVEL of: %s exceeds maxVolume: %s. Resetting to max.", volumeLvl, this.maxVolume)
		} else {
		// Must be using actual volume number
			this.v_state = volumeLvl;
			this.log.debug("setVolumeState - actual mode, ACTUAL volume v_state: %s", this.v_state)
		}
	
		//do the callback immediately, to free homekit
		//have the event later on execute changes
		callback( null, this.v_state)
	
		this.eiscp.command(this.zone + "." + this.cmdMap[this.zone]["volume"] + ":" + this.v_state, (error: any, response: any) => {
			if (error) {
				this.v_state = 0;
				this.log.debug( "setVolumeState - VOLUME : ERROR - current v_state: %s", this.v_state)
			}
		}).bind(this)
	}
	
	setVolumeRelative(volumeDirection: CharacteristicValue, callback: CharacteristicSetCallback, context: string) {
	//if context is v_statuspoll, then we need to ensure this we do not set the actual value
		if (context == "v_statuspoll") {
			this.log.debug( "setVolumeRelative - polling mode, ignore, v_state: %s", this.v_state)
			callback(null, this.v_state)
			return;
		}
		if (!this.ipAddress) {
			this.log.error("Ignoring request; No ip_address defined.")
			callback(new Error("No ip_address defined."))
			return;
		}
	
		this.setAttempt = this.setAttempt+1;
	
		//do the callback immediately, to free homekit
		//have the event later on execute changes
		callback( null, this.v_state)
		if (volumeDirection == this.platform.api.hap.Characteristic.VolumeSelector.INCREMENT) {
			this.log.debug("setVolumeRelative - VOLUME : level-up")
			this.eiscp.command(this.zone + "." + this.cmdMap[this.zone]["volume"] + ":" + "level-up", (error: any, response: any) => {
				if (error) {
					this.v_state = 0;
					this.log.error( "setVolumeRelative - VOLUME : ERROR - current v_state: %s", this.v_state)
				}
			}).bind(this)
		} else if (volumeDirection == this.platform.api.hap.Characteristic.VolumeSelector.DECREMENT) {
			this.log.debug("setVolumeRelative - VOLUME : level-down")
			this.eiscp.command(this.zone + "." + this.cmdMap[this.zone]["volume"] + ":" + "level-down", (error: any, response: any) => {
				if (error) {
					this.v_state = 0;
					this.log.error( "setVolumeRelative - VOLUME : ERROR - current v_state: %s", this.v_state)
				}
			}).bind(this)
		} else {
			this.log.error( "setVolumeRelative - VOLUME : ERROR - unknown direction sent")
		}
	}
	
	getMuteState(callback: CharacteristicGetCallback, context: string) {
		//if context is m_statuspoll, then we need to request the actual value
		if (!context || context != "m_statuspoll") {
			if (this.switchHandling == "poll") {
				this.log.debug("getMuteState - polling mode, return m_state: ", this.m_state)
				callback(null, this.m_state)
				return;
			}
		}
	
		if (!this.ipAddress) {
			this.log.error("Ignoring request; No ip_address defined.")
			callback(new Error("No ip_address defined."))
			return;
		}
	
		//do the callback immediately, to free homekit
		//have the event later on execute changes
		callback(null, this.m_state)
		this.log.debug("getMuteState - actual mode, return m_state: ", this.m_state)
		this.eiscp.command(this.zone + "." + this.cmdMap[this.zone]["muting"] + "=query", (error: any, data: any) => {
			if (error) {
				this.m_state = false;
				this.log.debug( "getMuteState - MUTE QRY: ERROR - current m_state: %s", this.m_state)
			}
		}).bind(this)
	}
	
	setMuteState(muteOn: any, callback: CharacteristicSetCallback, context: string) {
	//if context is m_statuspoll, then we need to ensure this we do not set the actual value
		if (context == "m_statuspoll") {
			this.log.debug( "setMuteState - polling mode, ignore, m_state: %s", this.m_state)
			callback(null, this.m_state)
			return;
		}
		if (!this.ipAddress) {
			this.log.error("Ignoring request; No ip_address defined.")
			callback(new Error("No ip_address defined."))
			return;
		}
	
		this.setAttempt = this.setAttempt+1;
	
		//do the callback immediately, to free homekit
		//have the event later on execute changes
		this.m_state = muteOn;
		callback( null, this.m_state)
		if (this.m_state) {
			this.log.debug("setMuteState - actual mode, mute m_state: %s, switching to ON", this.m_state)
			this.eiscp.command(this.zone + "." + this.cmdMap[this.zone]["muting"] + "=on", (error: any, response: any) => {
				if (error) {
					this.m_state = false;
					this.log.error( "setMuteState - MUTE ON: ERROR - current m_state: %s", this.m_state)
				}
			}).bind(this)
		} else {
			this.log.debug("setMuteState - actual mode, mute m_state: %s, switching to OFF", this.m_state)
			this.eiscp.command(this.zone + "." + this.cmdMap[this.zone]["muting"] + "=off", (error: any, response: any) => {
				if (error) {
					this.m_state = false;
					this.log.error( "setMuteState - MUTE OFF: ERROR - current m_state: %s", this.m_state)
				}
			}).bind(this)
		}
	}
	
	getInputSource(callback: CharacteristicGetCallback, context: string) {

	
		if (!this.ipAddress) {
			this.log.error("Ignoring request; No ip_address defined.")
			callback(new Error("No ip_address defined."))
			return;
		}
	
		//do the callback immediately, to free homekit
		//have the event later on execute changes
		
		
		this.log.debug("getInputState - actual mode, return i_state: ", this.i_state)
		this.eiscp.command(this.zone + "." + this.cmdMap[this.zone]["input"] + "=query", (error: any, data: any) => {
			if (error) {
				this.i_state = 1;
				this.log.error( "getInputState - INPUT QRY: ERROR - current i_state: %s", this.i_state)
			}
		}).bind(this)
		callback(null, this.i_state)
	}
	
	setInputSource(source: CharacteristicValue, callback: CharacteristicSetCallback, context: string) {

		if (!this.ipAddress) {
			this.log.error("Ignoring request; No ip_address defined.")
			callback(new Error("No ip_address defined."))
			return;
		}
	
		this.setAttempt = this.setAttempt+1;

		this.i_state = source;
		const label = RxInputs.Inputs[this.i_state - 1].label;

		this.log.debug("setInputState - actual mode, ACTUAL input i_state: %s - label: %s", this.i_state, label)
	
		//do the callback immediately, to free homekit
		//have the event later on execute changes
		callback(null, this.i_state)
		this.eiscp.command(this.zone + "." + this.cmdMap[this.zone]["input"] + ":" + label, (error: any, response: any) => {
			if (error) {
				this.log.error( "setInputState - INPUT : ERROR - current i_state:%s - Source:%s", this.i_state, source.toString())
			}
		}).bind(this)
	}
	
	remoteKeyPress(button: any, callback: CharacteristicGetCallback) {
		//do the callback immediately, to free homekit
		//have the event later on execute changes
		callback(null, button)
		if (this.buttons[button]) {
			var press = this.buttons[button]
			this.log.debug("remoteKeyPress - INPUT: pressing key %s", press)
			this.eiscp.command(this.zone + "." + "setup=" + press, (error: any, data :any) => {
				if (error) {
					// this.i_state = 1;
					this.log.error( "remoteKeyPress - INPUT: ERROR pressing button %s", press)
				}
			}).bind(this)
		} else {
			this.log.error('Remote button %d not supported.', button)
		}
	}
	
	identify(callback: CharacteristicGetCallback) {
		this.log.info("Identify requested! %s", this.ipAddress)
		callback() // success
	}

	////////////////////////
	// TV SERVICE FUNCTIONS
	////////////////////////
	addSources(service: Service) {
		// If input name mappings are provided, use them.
		// Option to only configure specified inputs with filter_inputs
		if (this.filter_inputs) {
			var length = RxInputs['Inputs'].length;
			while(length--) {
				if (this.inputs[RxInputs['Inputs'][length].label]) {
					continue
				} else {
					RxInputs['Inputs'].splice(length, 1)
				}
			}
		}
		this.log.debug(RxInputs['Inputs'])
		const inputs = RxInputs['Inputs'].map((i: any, index: number) => {
			const hapId = index + 1;
			var inputName = i['label'];
			if (this.inputs) {
				if (this.inputs[i['label']]) {
					inputName = this.inputs[i['label']];		
				}
			}
			// var dupe = false;
			// inputs.forEach((y, z) => {
			// 	if (y['subtype'] == i['code']) {
			// 		dupe = true;
			// 	}
			// })

			// if (dupe) return
			const input = this.setupInput(i.code, inputName, hapId, service)
			return input;
		})
		return inputs;
	}

	setupInput(inputCode: any, name: string, hapId: any, television: Service) {	
		const input = new this.platform.api.hap.Service.InputSource(`${this.name} ${name}`, inputCode)
		const inputSourceType = this.platform.api.hap.Characteristic.InputSourceType.HDMI

		input
			.setCharacteristic(this.platform.api.hap.Characteristic.Identifier, hapId)
			.setCharacteristic(this.platform.api.hap.Characteristic.ConfiguredName, name)
			.setCharacteristic(
			this.platform.api.hap.Characteristic.IsConfigured,
			this.platform.api.hap.Characteristic.IsConfigured.CONFIGURED
			)
			.setCharacteristic(this.platform.api.hap.Characteristic.InputSourceType, inputSourceType)

		input.getCharacteristic(this.platform.api.hap.Characteristic.ConfiguredName).setProps({
			perms: [this.platform.api.hap.Characteristic.Perms.READ]
		})

		television.addLinkedService(input)
		return input;
	}

	createAccessoryInformationService() {
		const informationService = new this.platform.api.hap.Service.AccessoryInformation()
		informationService
			.setCharacteristic(this.platform.api.hap.Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(this.platform.api.hap.Characteristic.Model, this.model)
			.setCharacteristic(this.platform.api.hap.Characteristic.SerialNumber, this.serial)
			.setCharacteristic(this.platform.api.hap.Characteristic.FirmwareRevision, "VERSION")
			.setCharacteristic(this.platform.api.hap.Characteristic.Name, this.name)
		
		return informationService;
	}
	
	

	createTvService() {
		this.log.debug("Creating TV service for receiver %s", this.name)
		const tvService = new this.platform.api.hap.Service.Television(this.name, "AUDIO_RECEIVER")
	
		tvService
			.getCharacteristic(this.platform.api.hap.Characteristic.ConfiguredName)
			.setValue(this.name)
			.setProps({
				perms: [this.platform.api.hap.Characteristic.Perms.READ]
			})
		
		tvService
			.setCharacteristic(this.platform.api.hap.Characteristic.SleepDiscoveryMode, this.platform.api.hap.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE)
		
		tvService
			.getCharacteristic(this.platform.api.hap.Characteristic.Active)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this))
	
		tvService
			.getCharacteristic(this.platform.api.hap.Characteristic.ActiveIdentifier)
			.on('set', this.setInputSource.bind(this))
			.on('get', this.getInputSource.bind(this))
		
		tvService
			.getCharacteristic(this.platform.api.hap.Characteristic.RemoteKey)
			.on('set', this.remoteKeyPress.bind(this))

		return tvService;
	}

	createTvSpeakerService(tvService: Service) {

		this.tvSpeakerService = new this.platform.api.hap.Service.TelevisionSpeaker(this.name + ' Volume', 'tvSpeakerService')
		this.tvSpeakerService
			.setCharacteristic(this.platform.api.hap.Characteristic.Active, this.platform.api.hap.Characteristic.Active.ACTIVE)
			.setCharacteristic(this.platform.api.hap.Characteristic.VolumeControlType, this.platform.api.hap.Characteristic.VolumeControlType.ABSOLUTE)
		this.tvSpeakerService
			.getCharacteristic(this.platform.api.hap.Characteristic.VolumeSelector)
			.on('set', this.setVolumeRelative.bind(this))
		this.tvSpeakerService
			.getCharacteristic(this.platform.api.hap.Characteristic.Mute)
			.on('get', this.getMuteState.bind(this))
			.on('set', this.setMuteState.bind(this))
		this.tvSpeakerService
			.addCharacteristic(this.platform.api.hap.Characteristic.Volume)
			.on('get', this.getVolumeState.bind(this))
			.on('set', this.setVolumeState.bind(this))
	
		tvService.addLinkedService(this.tvSpeakerService)
		this.enabledServices.push(this.tvSpeakerService)
	}

}