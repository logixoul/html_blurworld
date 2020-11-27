import * as THREE from '../lib/node_modules/three/src/Three.js';
import { shade2 } from './shade.js';
import * as ImgProc from './ImgProc.js';
import { globals } from './Globals.js';
import './Input.js'; // for side fx
import * as util from './util.js';
import { Image } from "./Image.js";
import { FramerateCounter } from "./FramerateCounter.js"

function initStateTex() {
	globals.scale = Math.sqrt(200*150) / Math.sqrt(window.innerWidth * window.innerHeight)
	globals.scale *= 2;
	
	var img = new Image(
		Math.trunc(window.innerWidth*globals.scale), Math.trunc(window.innerHeight*globals.scale),
		Float32Array);
		//Uint8Array);

	img.forEach((x : number, y : number) => img.set(x, y, Math.random()));

	globals.stateTex = new THREE.DataTexture(img.data, img.width, img.height, THREE.RedFormat,
		THREE.FloatType);
		//THREE.UnsignedByteType);

	globals.stateTex.generateMipmaps = false;

	/*globals.stateTex = shade2([globals.stateTex],
		`_out.r = fetch1();`, { itype: THREE.UnsignedByteType });*/

	util.renderer.setSize( window.innerWidth, window.innerHeight );
	
	document.getElementById("loadingScreen")!.style.display = "none";

	if(window.location.hostname !== "localhost") {
		document.getElementById("framerate")!.style.display = "none";
	}
}

initStateTex();

document.defaultView!.addEventListener("resize", initStateTex);

const framerateCounter = new FramerateCounter();

function animate(now: DOMHighResTimeStamp) {
	framerateCounter.update(now);
	//setInterval(animate, 1000);
	requestAnimationFrame( animate );
	
	globals.stateTex = ImgProc.zeroOutBorders(globals.stateTex, /*releaseFirstInputTex=*/ true);

	/*shade2([globals.stateTex], `
	_out.rgb = fetch3();
	`, {
		toScreen: true,
		releaseFirstInputTex: false
	});

	return;*/

	globals.stateTex = ImgProc.blur(globals.stateTex, 0.45, /*releaseFirstInputTex=*/ true);
	globals.stateTex = shade2([globals.stateTex], `
		_out.r = smoothstep(0.0f, 1.0f, fetch1());
		`, {
			releaseFirstInputTex: true
		});
	var tex2 = shade2([globals.stateTex], `
		float f = fetch1();
		float fw = fwidth(f);
		f = smoothstep(.5-fw, .5+fw, f);
		_out.r = f;
		`, {
		//	scale: new THREE.Vector2(1.0/globals.scale, 1.0/globals.scale),
			releaseFirstInputTex: false
		});
	tex2 = ImgProc.extrude(tex2, globals.scale, /*releaseFirstInputTex=*/ true);
	shade2([tex2?.get()!], ` // todo: rm the ! and ? when I've migrated ImgProc to TS.
		float d = fetch1() - fetch1(tex1, tc - vec2(0, tsize1.y));
		d *= 3.0f;
		_out.rgb = vec3(0,.2,.5);
		_out.rgb += vec3(max(-d, 0.0f)); // specular
		if(d>0.0f)_out.rgb /= 2.0f+d; // shadows
		_out.rgb /= _out.rgb + 1.0f;
		//_out.rgb = pow(_out.rgb, vec3(1.0/2.2));
		`, {
			toScreen: true,
			releaseFirstInputTex: true
		});
	console.log("w="+globals.stateTex.get().image.width);
}
requestAnimationFrame(animate);
