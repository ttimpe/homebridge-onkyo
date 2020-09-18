export default class OnkyoZone {
	public power: string
	public muting: string
	public volume: string
	public input: string

	constructor(power: string, muting: string, volume: string, input: string) {
		this.power = power
		this.muting = muting
		this.volume = volume
		this.input = input
	}
}