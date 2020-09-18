import { API } from 'homebridge'
import OnkyoAudioReceiverPlatform from './OnkyoAudioReceiverPlatform'

export = (api: API) => {
  api.registerPlatform("homebridge-onkyo-receivers","OnkyoAudioReceiverPlatform", OnkyoAudioReceiverPlatform);
}
