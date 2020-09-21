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

var info = require('../package.json')


export default class OnkyoAudioReceiverAccessory {
	private eiscp = require('eiscp')
	private name: string = ''
	private enabledServices: Service[] = []
	private tvService: Service
	private tvSpeakerService: Service
	private setAttempt: number = 0
	private ip_address: string = ''
	private model: string = ''
	private zone: string = 'main'
	private filter_inputs: any
	private inputs: any
	private mapVolume100: boolean = true
	private maxVolume: number
	private state: boolean = false;
	private m_state: boolean = false;
	private v_state: number = 0;
	private i_state: any
	private defaultInput: any

	private defaultVolume: number
	private reachable: boolean = true
	private buttons: any

	private interval: number
	private poll_status_interval: string

	private switchHandling: string = 'check'

	private default: string = ''

	private cmdMap :any = {
		main: new OnkyoZone("system-power", "master-volume", "audio-muting", "input-selector"),
		zone2: new OnkyoZone("power", "volume", "muting", "selector")
	}

	constructor (
		private readonly platform: OnkyoAudioReceiverPlatform,
		private readonly accessory: PlatformAccessory,
		private readonly config: any,
		private readonly log: Logging
		) {

		this.platform = platform;
		this.log = platform.log;

		this.log.info('**************************************************************');
		this.log.info('  homebridge-onkyo version ' + info.version);
		this.log.info('  GitHub: https://github.com/ToddGreenfield/homebridge-onkyo ');
		this.log.info('**************************************************************');
		this.log.info('start success...');
		this.log.debug('Debug mode enabled');

		this.name = this.config.name;


		this.log.debug('name %s', this.name);

		this.ip_address	= this.config.ip_address;
		this.log.debug('IP %s', this.ip_address);
		this.model = this.config.model;

		this.log.debug('Model %s', this.model);
		this.zone = this.config.zone || 'main';

		this.log.debug('Zone %s', this.zone);

		
		if (this.config.filter_inputs === undefined) {
			this.log.error('ERROR: Your configuration is missing the parameter "filter_inputs". Assuming "false".');
			this.filter_inputs = false;
		} else {
			this.filter_inputs = this.config.filter_inputs;
			this.log.debug('filter_inputs: %s', this.filter_inputs);
		}

		this.inputs = this.config.inputs;

		

		this.poll_status_interval = this.config.poll_status_interval || '0';
		this.log.debug('poll_status_interval: %s', this.poll_status_interval);
		this.defaultInput = this.config.default_input;

		this.log.debug('defaultInput: %s', this.defaultInput);
		this.defaultVolume = this.config.default_volume;

		this.log.debug('defaultVolume: %s', this.defaultVolume);
		this.maxVolume = this.config.max_volume || 60;
		this.log.debug('maxVolume: %s', this.maxVolume);

		this.mapVolume100 = this.config.map_volume_100 || true;

		this.log.debug('mapVolume100: %s', this.mapVolume100);


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

		this.interval = parseInt(this.poll_status_interval, 10);


		if (this.interval > 10 && this.interval < 100000)
			this.switchHandling = 'poll';

		this.eiscp.on('debug', this.eventDebug.bind(this));
		this.eiscp.on('error', this.eventError.bind(this));
		this.eiscp.on('connect', this.eventConnect.bind(this));
		this.eiscp.on('close', this.eventClose.bind(this));
		this.eiscp.on(this.cmdMap[this.zone].power, this.eventSystemPower.bind(this));
		this.eiscp.on(this.cmdMap[this.zone].volume, this.eventVolume.bind(this));
		this.eiscp.on(this.cmdMap[this.zone].muting, this.eventAudioMuting.bind(this));
		this.eiscp.on(this.cmdMap[this.zone].input, this.eventInput.bind(this));

		this.eiscp.connect(
			{host: this.ip_address, reconnect: true, model: this.model}
		);

		this.setUp();
	}

	setUp() {
		this.createRxInput();
		this.polling(this);

		const infoService = this.createAccessoryInformationService();
		this.enabledServices.push(infoService);
		this.tvService = this.createTvService();
		this.enabledServices.push(this.tvService);
		this.createTvSpeakerService(this.tvService);
		this.enabledServices.push(...this.addSources(this.tvService));
	}

	getServices() {
		return this.enabledServices;
	}

	createRxInput() {
	// Create the RxInput object for later use.
		const eiscpDataAll = require('../node_modules/eiscp/eiscp-commands.json');
		const inSets :any[] = []
		let set: any
/* eslint guard-for-in: "off" */
		for (set in eiscpDataAll.modelsets) {
			eiscpDataAll.modelsets[set].forEach((model: any) => {
				if (model.includes(this.model))
					inSets.push(set);
			});
		}

		// Get list of commands from eiscpData
		const eiscpData = eiscpDataAll.commands.main.SLI.values;
		// Create a JSON object for inputs from the eiscpData
		let newobj = '{ "Inputs" : [';
		let exkey;
		for (exkey in eiscpData) {
			let hold = eiscpData[exkey].name.toString();
			if (hold.includes(','))
				hold = hold.substring(0, hold.indexOf(','));
			if (exkey.includes('“') || exkey.includes('“')) {
				exkey = exkey.replace(/\“/g, ''); // eslint-disable-line no-useless-escape
				exkey = exkey.replace(/\”/g, ''); // eslint-disable-line no-useless-escape
			}

			if (exkey.includes('UP') || exkey.includes('DOWN') || exkey.includes('QSTN'))
				continue;

			// Work around specific bug for “26”
			if (exkey === '“26”')
				exkey = '26';

			if (exkey in eiscpData) {
				if ('models' in eiscpData[exkey])
					set = eiscpData[exkey].models;
				else
					continue;
			} else {
				continue;
			}

			if (inSets.includes(set))
				newobj = newobj + '{ "code":"' + exkey + '" , "label":"' + hold + '" },';
			else
				continue;
		}

		// Drop last comma first
		this.log.debug(newobj)
		newobj = newobj.slice(0, -1) + ']}';
		RxInputs = JSON.parse(newobj);
	}

	polling(platform: OnkyoAudioReceiverAccessory) {
		const that = platform;
	// Status Polling
		if (that.switchHandling === 'poll') {
			// somebody instroduced powerurl but we are never using it.
			// const powerurl = that.status_url;
			that.log.debug('start long poller..');
	// PWR Polling
			const statusemitter = pollingtoevent((done: any) => {
				that.log.debug('start PWR polling..');
				that.getPowerState((error: any, response: any) => {
					// pass also the setAttempt, to force a homekit update if needed
					done(error, response, that.setAttempt);
				}, 'statuspoll');
			}, {longpolling: true, interval: that.interval * 1000, longpollEventName: 'statuspoll'});

			statusemitter.on('statuspoll', (data: any) => {
				that.state = data;
				that.log.debug('event - PWR status poller - new state: ', that.state);
				// if (that.tvService ) {
				// 	that.tvService.getCharacteristic(this.platform.api.hap.Characteristic.Active).updateValue(that.state, null, 'statuspoll');
				// }
			});
	// Audio-Input Polling
			const i_statusemitter = pollingtoevent((done: any) => {
				that.log.debug('start INPUT polling..');
				that.getInputSource((error: any, response: any) => {
					// pass also the setAttempt, to force a homekit update if needed
					done(error, response, that.setAttempt);
				}, 'i_statuspoll');
			}, {longpolling: true, interval: that.interval * 1000, longpollEventName: 'i_statuspoll'});

			i_statusemitter.on('i_statuspoll', (data: any) => {
				that.i_state = data;
				that.log.debug('event - INPUT status poller - new i_state: ', that.i_state);
				// if (that.tvService ) {
				// 	that.tvService.getCharacteristic(this.platform.api.hap.Characteristic.ActiveIdentifier).updateValue(that.i_state, null, 'i_statuspoll');
				// }
			});
	// Audio-Muting Polling
			const m_statusemitter = pollingtoevent((done: any) => {
				that.log.debug('start MUTE polling..');
				that.getMuteState((error: any, response: any) => {
					// pass also the setAttempt, to force a homekit update if needed
					done(error, response, that.setAttempt);
				}, 'm_statuspoll');
			}, {longpolling: true, interval: that.interval * 1000, longpollEventName: 'm_statuspoll'});

			m_statusemitter.on('m_statuspoll', (data: any) => {
				that.m_state = data;
				that.log.debug('event - MUTE status poller - new m_state: ', that.m_state);
				// if (that.tvService ) {
				// 	that.tvService.getCharacteristic(this.platform.api.hap.Characteristic.Mute).updateValue(that.m_state, null, 'm_statuspoll');
				// }
			});
	// Volume Polling
			const v_statusemitter = pollingtoevent((done: any) => {
				that.log.debug('start VOLUME polling..');
				that.getVolumeState((error: any, response: any) => {
					// pass also the setAttempt, to force a homekit update if needed
					done(error, response, that.setAttempt);
				}, 'v_statuspoll');
			}, {longpolling: true, interval: that.interval * 1000, longpollEventName: 'v_statuspoll'});

			v_statusemitter.on('v_statuspoll', (data: any) => {
				that.v_state = data;
				that.log.debug('event - VOLUME status poller - new v_state: ', that.v_state);
				// if (that.tvService ) {
				// 	that.tvService.getCharacteristic(this.platform.api.hap.Characteristic.Volume).updateValue(that.v_state, null, 'v_statuspoll');
				// }
			});
		}
	}

	/// ////////////////
	// EVENT FUNCTIONS
	/// ////////////////
	eventDebug(response: any) {
		this.log.debug('eventDebug: %s', response);
	}

	eventError(response: any) {
		this.log.error('eventError: %s', response);
	}

	eventConnect(response: any) {
		this.log.debug('eventConnect: %s', response);
		this.reachable = true;
	}

	eventSystemPower(response: any) {
		if (this.state !== (response === 'on'))
			this.log.info('Event - System Power changed: %s', response);

		this.state = (response === 'on');
		this.log.debug('eventSystemPower - message: %s, new state %s', response, this.state);
		// Communicate status
		if (this.tvService)
			this.tvService.getCharacteristic(this.platform.api.hap.Characteristic.Active).updateValue(this.state);
		// if (this.volume_dimmer) {
		// 	this.m_state = !(response == 'on');
		// 	this.dimmer.getCharacteristic(this.platform.api.hap.Characteristic.On).updateValue((response == 'on'), null, 'power event m_status');
		// }
	}

	eventAudioMuting(response: any) {
		this.m_state = (response === 'on');
		this.log.debug('eventAudioMuting - message: %s, new m_state %s', response, this.m_state);
		// Communicate status
		if (this.tvService)
			this.tvService.getCharacteristic(this.platform.api.hap.Characteristic.Mute).updateValue(this.m_state, null, 'm_statuspoll');
	}

	eventInput(response: any) {
		if (response) {
			let input = JSON.stringify(response);
			input = input.replace(/[\[\]"]+/g, ''); // eslint-disable-line no-useless-escape
			if (input.includes(','))
				input = input.substring(0, input.indexOf(','));

			// Convert to i_state input code
			const index =
				input !== null ? // eslint-disable-line no-negated-condition
				RxInputs.Inputs.findIndex((i: any) => i.label === input) :
				-1;
			if (this.i_state !== (index + 1))
				this.log.info('Event - Input changed: %s', input);

			this.i_state = index + 1;

			this.log.debug('eventInput - message: %s - new i_state: %s - input: %s', response, this.i_state, input);
			// this.tvService.getCharacteristic(this.platform.api.hap.Characteristic.ActiveIdentifier).updateValue(this.i_state);
		} else {
			// Then invalid Input chosen
			this.log.error('eventInput - ERROR - INVALID INPUT - Model does not support selected input.');
		}

		// Communicate status
		if (this.tvService)
			this.tvService.getCharacteristic(this.platform.api.hap.Characteristic.ActiveIdentifier).updateValue(this.i_state);
	}

	eventVolume(response: any) {
		if (this.mapVolume100) {
			const volumeMultiplier = this.maxVolume / 100;
			const newVolume = response / volumeMultiplier;
			this.v_state = Math.round(newVolume);
			this.log.debug('eventVolume - message: %s, new v_state %s PERCENT', response, this.v_state);
		} else {
			this.v_state = response;
			this.log.debug('eventVolume - message: %s, new v_state %s ACTUAL', response, this.v_state);
		}

		// Communicate status
		if (this.tvSpeakerService)
			this.tvSpeakerService.getCharacteristic(this.platform.api.hap.Characteristic.Volume).updateValue(this.v_state, null, 'v_statuspoll');
	}

	eventClose(response: any) {
		this.log.debug('eventClose: %s', response);
		this.reachable = false;
	}

	/// /////////////////////
	// GET AND SET FUNCTIONS
	/// /////////////////////
	setPowerState(powerOn: any, callback: CharacteristicSetCallback, context: string) {
	// if context is statuspoll, then we need to ensure that we do not set the actual value
		if (context && context === 'statuspoll') {
			this.log.debug('setPowerState - polling mode, ignore, state: %s', this.state);
			callback(null, this.state);
			return;
		}

		if (!this.ip_address) {
			this.log.error('Ignoring request; No ip_address defined.');
			callback(new Error('No ip_address defined.'));
			return;
		}

		this.setAttempt = this.setAttempt + 1;

		// do the callback immediately, to free homekit
		// have the event later on execute changes
		this.state = powerOn;
		callback(null, this.state);
		if (powerOn) {
			this.log.debug('setPowerState - actual mode, power state: %s, switching to ON', this.state);
			this.eiscp.command(this.zone + '.' + this.cmdMap[this.zone].power + '=on', (error: any, _: any) => {
				// this.log.debug( 'PWR ON: %s - %s -- current state: %s', error, response, this.state);
				if (error) {
					this.state = false;
					this.log.error('setPowerState - PWR ON: ERROR - current state: %s', this.state);
					// if (this.tvService ) {
					// 	this.tvService.getCharacteristic(this.platform.api.hap.Characteristic.Active).updateValue(powerOn, null, 'statuspoll');
					// }
				} else {
					// If the AVR has just been turned on, apply the default volume
						this.log.debug('Attempting to set the default volume to ' + this.defaultVolume);
						if (powerOn && this.defaultVolume) {
							this.log.info('Setting default volume to ' + this.defaultVolume);
							this.eiscp.command(this.zone + '.' + this.cmdMap[this.zone].volume + ':' + this.defaultVolume, (error: any, _: any) => {
								if (error)
									this.log.error('Error while setting default volume: %s', error);
							});
						}

					// If the AVR has just been turned on, apply the Input default
						this.log.debug('Attempting to set the default input selector to ' + this.defaultInput);

						// Handle defaultInput being either a custom label or manufacturer label
						let label = this.defaultInput;
						if (this.inputs) {
							this.inputs.forEach((input: any, _: any) => {
								if (input.input_name === this.default)
									label = input.input_name;
								else if (input.display_name === this.defaultInput)
									label = input.display_name;
							});
						}

						const index =
							label !== null ? // eslint-disable-line no-negated-condition
							RxInputs.Inputs.findIndex((i: any) => i.label === label) :
							-1;
						this.i_state = index + 1;

						if (powerOn && label) {
							this.log.info('Setting default input selector to ' + label);
							this.eiscp.command(this.zone + '.' + this.cmdMap[this.zone].input + '=' + label, (error: any, _: any) => {
								if (error)
									this.log.error('Error while setting default input: %s', error);
							});
						}
				}
			});
		} else {
			this.log.debug('setPowerState - actual mode, power state: %s, switching to OFF', this.state);
			this.eiscp.command(this.zone + '.' + this.cmdMap[this.zone].power + '=standby', (error: any, _: any) => {
				// this.log.debug( 'PWR OFF: %s - %s -- current state: %s', error, response, this.state);
				if (error) {
					this.state = false;
					this.log.error('setPowerState - PWR OFF: ERROR - current state: %s', this.state);
					// if (this.tvService ) {
					// 	this.tvService.getCharacteristic(this.platform.api.hap.Characteristic.Active).updateValue(this.state, null, 'statuspoll');
					// }
				}
			});
		}

		// if (this.volume_dimmer) {
		// 	this.m_state = !(powerOn == 'on');
		// 	this.dimmer.getCharacteristic(this.platform.api.hap.Characteristic.On).updateValue((powerOn == 'on'), null, 'power event m_status');
		// }
		this.tvService.getCharacteristic(this.platform.api.hap.Characteristic.Active).updateValue(this.state);
	}

	getPowerState(callback: CharacteristicGetCallback, context: string) {
		// if context is statuspoll, then we need to request the actual value
		if (!context || context !== 'statuspoll') {
			if (this.switchHandling === 'poll') {
				this.log.debug('getPowerState - polling mode, return state: ', this.state);
				callback(null, this.state);
				return;
			}
		}

		if (!this.ip_address) {
			this.log.error('Ignoring request; No ip_address defined.');
			callback(new Error('No ip_address defined.'));
			return;
		}

		// do the callback immediately, to free homekit
		// have the event later on execute changes
		callback(null, this.state);
		this.log.debug('getPowerState - actual mode, return state: ', this.state);
		this.eiscp.command(this.zone + '.' + this.cmdMap[this.zone].power + '=query', (error: any, _: any) => {
			if (error) {
				this.state = false;
				this.log.debug('getPowerState - PWR QRY: ERROR - current state: %s', this.state);
			}
		});
		this.tvService.getCharacteristic(this.platform.api.hap.Characteristic.Active).updateValue(this.state);
	}

	getVolumeState(callback: CharacteristicGetCallback, context: string) {
		// if context is v_statuspoll, then we need to request the actual value
		if (!context || context !== 'v_statuspoll') {
			if (this.switchHandling === 'poll') {
				this.log.debug('getVolumeState - polling mode, return v_state: ', this.v_state);
				callback(null, this.v_state);
				return;
			}
		}

		if (!this.ip_address) {
			this.log.error('Ignoring request; No ip_address defined.');
			callback(new Error('No ip_address defined.'));
			return;
		}

		// do the callback immediately, to free homekit
		// have the event later on execute changes
		callback(null, this.v_state);
		this.log.debug('getVolumeState - actual mode, return v_state: ', this.v_state);
		this.eiscp.command(this.zone + '.' + this.cmdMap[this.zone].volume + '=query', (error: any, _: any) => {
			if (error) {
				this.v_state = 0;
				this.log.debug('getVolumeState - VOLUME QRY: ERROR - current v_state: %s', this.v_state);
			}
		});

		// Communicate status
		if (this.tvService)
			this.tvSpeakerService.getCharacteristic(this.platform.api.hap.Characteristic.Volume).updateValue(this.v_state);
	}

	setVolumeState(volumeLvl: any, callback: CharacteristicSetCallback, context: string) {
	// if context is v_statuspoll, then we need to ensure this we do not set the actual value
		if (context && context === 'v_statuspoll') {
			this.log.debug('setVolumeState - polling mode, ignore, v_state: %s', this.v_state);
			callback(null, this.v_state);
			return;
		}

		if (!this.ip_address) {
			this.log.error('Ignoring request; No ip_address defined.');
			callback(new Error('No ip_address defined.'));
			return;
		}

		this.setAttempt = this.setAttempt + 1;

		// Are we mapping volume to 100%?
		if (this.mapVolume100) {
			const volumeMultiplier = this.maxVolume / 100;
			const newVolume = volumeMultiplier * volumeLvl;
			this.v_state = Math.round(newVolume);
			this.log.debug('setVolumeState - actual mode, PERCENT, volume v_state: %s', this.v_state);
		} else if (volumeLvl > this.maxVolume) {
		// Determin if maxVolume threshold breached, if so set to max.
			this.v_state = this.maxVolume;
			this.log.debug('setVolumeState - VOLUME LEVEL of: %s exceeds maxVolume: %s. Resetting to max.', volumeLvl, this.maxVolume);
		} else {
		// Must be using actual volume number
			this.v_state = volumeLvl;
			this.log.debug('setVolumeState - actual mode, ACTUAL volume v_state: %s', this.v_state);
		}

		// do the callback immediately, to free homekit
		// have the event later on execute changes
		callback(null, this.v_state);

		this.eiscp.command(this.zone + '.' + this.cmdMap[this.zone].volume + ':' + this.v_state, (error: any, _: any) => {
			if (error) {
				this.v_state = 0;
				this.log.debug('setVolumeState - VOLUME : ERROR - current v_state: %s', this.v_state);
			}
		});

		// Communicate status
		if (this.tvService)
			this.tvSpeakerService.getCharacteristic(this.platform.api.hap.Characteristic.Volume).updateValue(this.v_state);
	}

	setVolumeRelative(volumeDirection: any, callback: CharacteristicSetCallback, context: string) {
	// if context is v_statuspoll, then we need to ensure this we do not set the actual value
		if (context && context === 'v_statuspoll') {
			this.log.debug('setVolumeRelative - polling mode, ignore, v_state: %s', this.v_state);
			callback(null, this.v_state);
			return;
		}

		if (!this.ip_address) {
			this.log.error('Ignoring request; No ip_address defined.');
			callback(new Error('No ip_address defined.'));
			return;
		}

		this.setAttempt = this.setAttempt + 1;

		// do the callback immediately, to free homekit
		// have the event later on execute changes
		callback(null, this.v_state);
		if (volumeDirection === this.platform.api.hap.Characteristic.VolumeSelector.INCREMENT) {
			this.log.debug('setVolumeRelative - VOLUME : level-up');
			this.eiscp.command(this.zone + '.' + this.cmdMap[this.zone].volume + ':level-up', (error: any, _: any) => {
				if (error) {
					this.v_state = 0;
					this.log.error('setVolumeRelative - VOLUME : ERROR - current v_state: %s', this.v_state);
				}
			});
		} else if (volumeDirection === this.platform.api.hap.Characteristic.VolumeSelector.DECREMENT) {
			this.log.debug('setVolumeRelative - VOLUME : level-down');
			this.eiscp.command(this.zone + '.' + this.cmdMap[this.zone].volume + ':level-down', (error: any, _: any) => {
				if (error) {
					this.v_state = 0;
					this.log.error('setVolumeRelative - VOLUME : ERROR - current v_state: %s', this.v_state);
				}
			});
		} else {
			this.log.error('setVolumeRelative - VOLUME : ERROR - unknown direction sent');
		}

		// Communicate status
		if (this.tvService)
			this.tvSpeakerService.getCharacteristic(this.platform.api.hap.Characteristic.Volume).updateValue(this.v_state);
	}

	getMuteState(callback: CharacteristicGetCallback, context: string) {
		// if context is m_statuspoll, then we need to request the actual value
		if (!context || context !== 'm_statuspoll') {
			if (this.switchHandling === 'poll') {
				this.log.debug('getMuteState - polling mode, return m_state: ', this.m_state);
				callback(null, this.m_state);
				return;
			}
		}

		if (!this.ip_address) {
			this.log.error('Ignoring request; No ip_address defined.');
			callback(new Error('No ip_address defined.'));
			return;
		}

		// do the callback immediately, to free homekit
		// have the event later on execute changes
		callback(null, this.m_state);
		this.log.debug('getMuteState - actual mode, return m_state: ', this.m_state);
		this.eiscp.command(this.zone + '.' + this.cmdMap[this.zone].muting + '=query', (error: any, _: any) => {
			if (error) {
				this.m_state = false;
				this.log.debug('getMuteState - MUTE QRY: ERROR - current m_state: %s', this.m_state);
			}
		});

		// Communicate status
		if (this.tvService)
			this.tvSpeakerService.getCharacteristic(this.platform.api.hap.Characteristic.Mute).updateValue(this.m_state);
	}

	setMuteState(muteOn: any, callback: CharacteristicSetCallback, context: string) {
	// if context is m_statuspoll, then we need to ensure this we do not set the actual value
		if (context && context === 'm_statuspoll') {
			this.log.debug('setMuteState - polling mode, ignore, m_state: %s', this.m_state);
			callback(null, this.m_state);
			return;
		}

		if (!this.ip_address) {
			this.log.error('Ignoring request; No ip_address defined.');
			callback(new Error('No ip_address defined.'));
			return;
		}

		this.setAttempt = this.setAttempt + 1;

		// do the callback immediately, to free homekit
		// have the event later on execute changes
		this.m_state = muteOn;
		callback(null, this.m_state);
		if (this.m_state) {
			this.log.debug('setMuteState - actual mode, mute m_state: %s, switching to ON', this.m_state);
			this.eiscp.command(this.zone + '.' + this.cmdMap[this.zone].muting + '=on', (error: any, _: any) => {
				if (error) {
					this.m_state = false;
					this.log.error('setMuteState - MUTE ON: ERROR - current m_state: %s', this.m_state);
				}
			});
		} else {
			this.log.debug('setMuteState - actual mode, mute m_state: %s, switching to OFF', this.m_state);
			this.eiscp.command(this.zone + '.' + this.cmdMap[this.zone].muting + '=off', (error: any, _: any) => {
				if (error) {
					this.m_state = false;
					this.log.error('setMuteState - MUTE OFF: ERROR - current m_state: %s', this.m_state);
				}
			});
		}

		// Communicate status
		if (this.tvService)
			this.tvSpeakerService.getCharacteristic(this.platform.api.hap.Characteristic.Mute).updateValue(this.m_state);
	}

	getInputSource(callback: CharacteristicGetCallback, context: string) {
		// if context is i_statuspoll, then we need to request the actual value
		if (!context || context !== 'i_statuspoll') {
			if (this.switchHandling === 'poll') {
				this.log.debug('getInputState - polling mode, return i_state: ', this.i_state);
				callback(null, this.i_state);
				return;
			}
		}

		if (!this.ip_address) {
			this.log.error('Ignoring request; No ip_address defined.');
			callback(new Error('No ip_address defined.'));
			return;
		}

		// do the callback immediately, to free homekit
		// have the event later on execute changes

		this.log.debug('getInputState - actual mode, return i_state: ', this.i_state);
		this.eiscp.command(this.zone + '.' + this.cmdMap[this.zone].input + '=query', (error: any, _: any) => {
			if (error) {
				this.i_state = 1;
				this.log.error('getInputState - INPUT QRY: ERROR - current i_state: %s', this.i_state);
			}
		});
		callback(null, this.i_state);
		// Communicate status
		if (this.tvService)
			this.tvService.getCharacteristic(this.platform.api.hap.Characteristic.ActiveIdentifier).updateValue(this.i_state);
	}

	setInputSource(source: any, callback: CharacteristicSetCallback, context: string) {
	// if context is i_statuspoll, then we need to ensure this we do not set the actual value
		if (context && context === 'i_statuspoll') {
			this.log.info('setInputState - polling mode, ignore, i_state: %s', this.i_state);
			callback(null, this.i_state);
			return;
		}

		if (!this.ip_address) {
			this.log.error('Ignoring request; No ip_address defined.');
			callback(new Error('No ip_address defined.'));
			return;
		}

		this.setAttempt = this.setAttempt + 1;

		this.i_state = source;
		const label = RxInputs.Inputs[this.i_state - 1].label;

		this.log.debug('setInputState - actual mode, ACTUAL input i_state: %s - label: %s', this.i_state, label);

		// do the callback immediately, to free homekit
		// have the event later on execute changes
		callback(null, this.i_state);
		this.eiscp.command(this.zone + '.' + this.cmdMap[this.zone].input + ':' + label, (error: any, _: any) => {
			if (error)
				this.log.error('setInputState - INPUT : ERROR - current i_state:%s - Source:%s', this.i_state, source.toString());
		});

		// Communicate status
		if (this.tvService)
			this.tvService.getCharacteristic(this.platform.api.hap.Characteristic.ActiveIdentifier).updateValue(this.i_state);
	}

	remoteKeyPress(button: any, callback: any) {
		// do the callback immediately, to free homekit
		// have the event later on execute changes
		callback(null, button);
		if (this.buttons[button]) {
			const press = this.buttons[button];
			this.log.debug('remoteKeyPress - INPUT: pressing key %s', press);
			this.eiscp.command(this.zone + '.setup=' + press, (error: any, _: any) => {
				if (error) {
					// this.i_state = 1;
					this.log.error('remoteKeyPress - INPUT: ERROR pressing button %s', press);
				}
			});
		} else {
			this.log.error('Remote button %d not supported.', button);
		}
	}

	identify(callback: any) {
		this.log.info('Identify requested! %s', this.ip_address);
		callback(); // success
	}

	/// /////////////////////
	// TVService FUNCTIONS
	/// /////////////////////
	addSources(service: Service) {
		// If input name mappings are provided, use them.
		// Option to only configure specified inputs with filter_inputs
		if (this.filter_inputs) {
			// Check the RxInputs.Inputs items to see if each exists in this.inputs. Return new array of those that do.
			RxInputs.Inputs = RxInputs.Inputs.filter((rxinput: any) => {
				return this.inputs.some((input: any) => {
					return input.input_name === rxinput.label;
				});
			});
		}

		this.log.debug(RxInputs.Inputs);
		// Create final array of inputs, using any labels defined in the config's inputs to override the default labels
		const inputs = RxInputs.Inputs.map((i: any, index: number) => {
			const hapId = index + 1;
			let inputName = i.label;
			if (this.inputs) {
				this.inputs.forEach((input: any, _: any) => {
					if (input.input_name === i.label)
						inputName = input.display_name;
				});
			}

			const input = this.setupInput(i.code, inputName, hapId, service);
			return input;
		});
		return inputs;
	}

	setupInput(inputCode: any, name: string, hapId: any, television: Service) {
		const input = new this.platform.api.hap.Service.InputSource(`${this.name} ${name}`, inputCode);
		const inputSourceType = this.platform.api.hap.Characteristic.InputSourceType.HDMI;

		input
			.setCharacteristic(this.platform.api.hap.Characteristic.Identifier, hapId)
			.setCharacteristic(this.platform.api.hap.Characteristic.ConfiguredName, name)
			.setCharacteristic(
			this.platform.api.hap.Characteristic.IsConfigured,
			this.platform.api.hap.Characteristic.IsConfigured.CONFIGURED
			)
			.setCharacteristic(this.platform.api.hap.Characteristic.InputSourceType, inputSourceType);

		input.getCharacteristic(this.platform.api.hap.Characteristic.ConfiguredName).setProps({
			perms: [this.platform.api.hap.Characteristic.Perms.READ]
		});

		television.addLinkedService(input);
		return input;
	}

	createAccessoryInformationService() {
		const informationService = new this.platform.api.hap.Service.AccessoryInformation();
		informationService
			.setCharacteristic(this.platform.api.hap.Characteristic.Manufacturer, "Onkyo")
			.setCharacteristic(this.platform.api.hap.Characteristic.Model, this.model)
			.setCharacteristic(this.platform.api.hap.Characteristic.SerialNumber, "SERIAL")
			.setCharacteristic(this.platform.api.hap.Characteristic.FirmwareRevision, info.version)
			.setCharacteristic(this.platform.api.hap.Characteristic.Name, this.name);

		return informationService;
	}

	
	createTvService() {
		this.log.debug('Creating TV this.platform.api.hap.Service for receiver %s', this.name);
		const tvService = new this.platform.api.hap.Service.Television(this.name, 'AUDIO_RECEIVER');

		tvService
			.getCharacteristic(this.platform.api.hap.Characteristic.ConfiguredName)
			.setValue(this.name)
			.setProps({
				perms: [this.platform.api.hap.Characteristic.Perms.READ]
			});

		tvService
			.setCharacteristic(this.platform.api.hap.Characteristic.SleepDiscoveryMode, this.platform.api.hap.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		tvService
			.getCharacteristic(this.platform.api.hap.Characteristic.Active)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this));

		tvService
			.getCharacteristic(this.platform.api.hap.Characteristic.ActiveIdentifier)
			.on('set', this.setInputSource.bind(this))
			.on('get', this.getInputSource.bind(this));

		tvService
			.getCharacteristic(this.platform.api.hap.Characteristic.RemoteKey)
			.on('set', this.remoteKeyPress.bind(this));

		return tvService;
	}

	createTvSpeakerService(tvService: Service) {
		this.tvSpeakerService = this.accessory.addService(this.platform.api.hap.Service.TelevisionSpeaker);
		this.tvSpeakerService
			.setCharacteristic(this.platform.api.hap.Characteristic.Active, this.platform.api.hap.Characteristic.Active.ACTIVE)
			.setCharacteristic(this.platform.api.hap.Characteristic.VolumeControlType, this.platform.api.hap.Characteristic.VolumeControlType.ABSOLUTE);
		this.tvSpeakerService
			.getCharacteristic(this.platform.api.hap.Characteristic.VolumeSelector)
			.on('set', this.setVolumeRelative.bind(this));
		this.tvSpeakerService
			.getCharacteristic(this.platform.api.hap.Characteristic.Mute)
			.on('get', this.getMuteState.bind(this))
			.on('set', this.setMuteState.bind(this));
		this.tvSpeakerService
			.addCharacteristic(this.platform.api.hap.Characteristic.Volume)
			.on('get', this.getVolumeState.bind(this))
			.on('set', this.setVolumeState.bind(this));

		this.enabledServices.push(this.tvSpeakerService);
	}
}