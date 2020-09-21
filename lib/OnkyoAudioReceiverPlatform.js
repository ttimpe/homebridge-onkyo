"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const OnkyoAudioReceiverAccessory_1 = __importDefault(require("./OnkyoAudioReceiverAccessory"));
const PLUGIN_NAME = "homebridge-onkyo-receivers";
const PLATFORM_NAME = "OnkyoAudioReceiverPlatform";
let hap;
let Accessory;
class OnkyoAudioReceiverPlatform {
    constructor(log, config, api) {
        this.config = config;
        this.receiverAccessories = [];
        this.numberReceivers = 0;
        this.log = log;
        this.api = api;
        this.config = config;
        this.receiverConfigs = this.config['receivers'];
        this.log.info("receivers are", this.receiverConfigs);
        this.createAccessories();
    }
    createAccessories() {
        this.numberReceivers = this.receiverConfigs.length;
        this.log.debug("Creating %s receivers...", this.numberReceivers);
        this.receiverConfigs.forEach((receiver) => {
            const uuid = this.api.hap.uuid.generate("homebridge-onkyo-reiver-" + receiver.name);
            this.log.info("Creating accessory " + receiver.name + "With uuid " + uuid);
            var accessory = new this.api.platformAccessory(receiver.name, uuid, 34 /* AUDIO_RECEIVER */);
            var receiverAccessory = new OnkyoAudioReceiverAccessory_1.default(this, accessory, receiver, this.log);
            this.receivers.push(receiverAccessory);
            this.receiverAccessories.push(accessory);
        });
        this.api.publishExternalAccessories(PLUGIN_NAME, this.receiverAccessories);
    }
}
exports.default = OnkyoAudioReceiverPlatform;
