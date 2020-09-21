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
  Categories,
} from "homebridge"


import OnkyoAudioReceiverAccessory from './OnkyoAudioReceiverAccessory'

const PLUGIN_NAME = "homebridge-onkyo-receivers"
const PLATFORM_NAME = "OnkyoAudioReceiverPlatform"

let hap: HAP
let Accessory: typeof PlatformAccessory



export default class OnkyoAudioReceiverPlatform implements IndependentPlatformPlugin {



	private receivers: any
	private receiverAccessories: PlatformAccessory[] = []
	private numberReceivers: number = 0
	private receiverConfigs :any

	public api: API
	public log: Logging

	constructor(log: Logging, public readonly config: PlatformConfig, api: API) {
		this.log = log
		this.api = api
		this.config = config
		
		this.receiverConfigs = this.config['receivers']
		this.log.info("receivers are", this.receiverConfigs)
		this.createAccessories()
	}

	createAccessories() {
		this.numberReceivers = this.receiverConfigs.length
		this.log.debug("Creating %s receivers...", this.numberReceivers)
	
		this.receiverConfigs.forEach((receiver: any) => {
			const uuid = this.api.hap.uuid.generate("homebridge-onkyo-reiver-" + receiver.name)
			this.log.info("Creating accessory " + receiver.name + "With uuid " + uuid)
			var accessory = new this.api.platformAccessory(receiver.name, uuid, Categories.AUDIO_RECEIVER)
			var receiverAccessory = new OnkyoAudioReceiverAccessory(this, accessory, receiver, this.log)

			this.receivers.push(receiverAccessory)
			this.receiverAccessories.push(accessory)
		})
		this.api.publishExternalAccessories(PLUGIN_NAME, this.receiverAccessories)
	}

}