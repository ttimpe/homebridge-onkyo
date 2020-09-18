"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const OnkyoAudioReceiverPlatform_1 = __importDefault(require("./OnkyoAudioReceiverPlatform"));
module.exports = (api) => {
    api.registerPlatform("homebridge-onkyo-receivers", "OnkyoAudioReceiverPlatform", OnkyoAudioReceiverPlatform_1.default);
};
