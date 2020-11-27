
// https://stackoverflow.com/questions/16432804/recording-fps-in-webgl
export class FramerateCounter {
	sfpElem = document.querySelector("#framerate");
	//sfpElem.style.display="none";
	then = 0;
	sfpSmoothed = -1;
	constructor() {
		setInterval(() => {
			this.sfpElem!.textContent = this.sfpSmoothed.toFixed(1) + "ms";
		}, 500);
	}
	update(now: DOMHighResTimeStamp) {
		const sfp = now - this.then;
		this.then = now;
		if(this.sfpSmoothed === -1) this.sfpSmoothed = sfp;
		this.sfpSmoothed += (sfp - this.sfpSmoothed) * .1;
	}
}