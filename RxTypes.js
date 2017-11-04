var inherits = require('util').inherits;
var Service, Characteristic;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUID = homebridge.hap.uuid;

  var RxTypes = {};

// Custom homekit characteristic for InputSource.
RxTypes.InputSource = function() {
    var serviceUUID = UUID.generate('RxTypes:usagedevice:InputSource');
    Characteristic.call(this, 'Input Source', serviceUUID);
    this.setProps({
      format: Characteristic.Formats.UINT8,
	  maxValue: 36,
	  minValue: 0,
	  minStep:  1,
      perms:    [ Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY ]
    });
    this.value = this.getDefaultValue();
  };
  inherits(RxTypes.InputSource, Characteristic);

// Custom homekit characteristic for InputLabel. 
RxTypes.InputLabel = function() {
    var serviceUUID = UUID.generate('RxTypes:usagedevice:InputLabel');
    Characteristic.call(this, 'Input Label', serviceUUID);
    this.setProps({
      format:   Characteristic.Formats.String,
      perms:    [ Characteristic.Perms.READ, Characteristic.Perms.NOTIFY ]
    });
    this.value = this.getDefaultValue();
  };
  inherits(RxTypes.InputLabel, Characteristic);

  return RxTypes;
};