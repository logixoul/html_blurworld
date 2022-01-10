import * as THREE from '../lib/node_modules/three/src/Three.js';
import { shade2, lx } from './shade.js';
import * as ImgProc from './ImgProc.js';
import { globals } from './Globals.js';
import './Input.js'; // for side fx
import * as util from './util.js';
import { Image } from "./Image.js";
import { FramerateCounter } from "./FramerateCounter.js"

function initStateTex() {
	var documentW = window.innerWidth * window.devicePixelRatio;
	var documentH = window.innerHeight * window.devicePixelRatio;
	globals.scale = Math.sqrt(200*150) / Math.sqrt(documentW * documentH);
	//globals.scale /= 4;
	
	var img = new Image(
		Math.trunc(documentW*globals.scale), Math.trunc(documentH*globals.scale),
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

const backgroundPicTex = new THREE.TextureLoader().load( 'assets/background.jpg' );

document.defaultView!.addEventListener("resize", initStateTex);

const framerateCounter = new FramerateCounter();

// for debugging
function drawToScreen(inputTex : lx.Texture, releaseFirstInputTex : boolean) {
	shade2([inputTex], `
		_out.rgb = fetch3();
		`, {
			toScreen: true,
			releaseFirstInputTex: releaseFirstInputTex
		});
}

function doSimulationStep() {
	globals.stateTex = ImgProc.zeroOutBorders(globals.stateTex, /*releaseFirstInputTex=*/ true);
	globals.stateTex = ImgProc.blur(globals.stateTex, 0.45, /*releaseFirstInputTex=*/ true);
	globals.stateTex = shade2([globals.stateTex], `
		float f = fetch1();
		float fw = fwidth(f);
		f = smoothstep(.5-fw, .5+fw, f);
		_out.r = f;
		`, {
			releaseFirstInputTex: true
		});
}

let limitFramerateCheckbox = document.getElementById("limitFramerate")! as HTMLInputElement;

function animate(now: DOMHighResTimeStamp) {
	framerateCounter.update(now);
	if(limitFramerateCheckbox.checked)
		setTimeout(animate, 1000);
	else
		requestAnimationFrame( animate );
	
	doSimulationStep();
	
	/*if(globals.keysHeld["1"]) {
		drawToScreen(globals.stateTex, false);
		return;
	}*/

	var tex2 = ImgProc.extrude(globals.stateTex, globals.scale, /*releaseFirstInputTex=*/ false);
	shade2([tex2?.get()!, backgroundPicTex], ` // todo: rm the ! and ? when I've migrated ImgProc to TS.
		float d = fetch1() - fetch1(tex1, tc - vec2(0, tsize1.y));
		d *= 3.0f;
		//_out.rgb = fetch3(tex2);
		_out.rgb = vec3(.9, .9, .9);//vec3(0,.2,.5);
		if(d < -1.0)
			_out.rgb += vec3(max(-d-.3, 0.0f)); // specular
		else if(d>0.0f)_out.rgb /= 1.0+d; // shadows
		_out.rgb /= _out.rgb + 1.0f;
		//_out.rgb = pow(_out.rgb, vec3(1.0/2.2)); // gamma correction
		`, {
			toScreen: true,
			releaseFirstInputTex: true
		});
}
requestAnimationFrame(animate);
