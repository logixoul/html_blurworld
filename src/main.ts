import * as THREE from 'three';
import { shade2, lx } from './shade';
import * as ImgProc from './ImgProc.js';
import { globals } from './Globals.js';
import './Input.js'; // for side fx
import * as util from './util';
import { Image } from "./Image.js";
import { FramerateCounter } from "./FramerateCounter";
import * as KeysHeld from './KeysHeld';
import * as PresentationForIashu from './presentationForIashu';

function initStateTex() {
	var documentW = window.innerWidth;
	var documentH = window.innerHeight;
	globals.scale = Math.sqrt(200*150) / Math.sqrt(documentW * documentH);
	//globals.scale = 1;
	
	
	var img = new Image(
		Math.trunc(documentW*globals.scale), Math.trunc(documentH*globals.scale),
		Float32Array);
		//Uint8Array);

	img.forEach((x : number, y : number) => img.set(x, y, Math.random()));

	globals.stateTex = new THREE.DataTexture(img.data, img.width, img.height, THREE.RedFormat,
			THREE.FloatType);
			//THREE.UnsignedByteType);
	globals.stateTex.needsUpdate = true;
	globals.stateTex.generateMipmaps = false;

	globals.stateTex = shade2([globals.stateTex],
		`_out.r = fetch1();`, { itype:
			//THREE.UnsignedByteType,
			//THREE.HalfFloatType,
			THREE.FloatType,
		releaseFirstInputTex: true });

	util.renderer.setSize( window.innerWidth, window.innerHeight );
	
	document.getElementById("loadingScreen")!.style.display = "none";

	if(window.location.hostname !== "localhost") {
		document.getElementById("framerate")!.style.display = "none";
	}

	for(let i =0; i < 100; i++)
		doSimulationStep(); // tmp for iashu demo
}

initStateTex();
PresentationForIashu.init();

//const backgroundPicTex = new THREE.TextureLoader().load( 'assets/background.jpg' );

document.defaultView!.addEventListener("resize", initStateTex);

const framerateCounter = new FramerateCounter();

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
	
	var tex2 = ImgProc.extrude(globals.stateTex, globals.scale, /*releaseFirstInputTex=*/ false);
	if(KeysHeld.global_keysHeld["digit1"]) {
		var toDraw = shade2([tex2!], `
		float state = fetch1(tex1);
		state = .5 * state;
		_out.r = state;`
		, {
			releaseFirstInputTex: true
		}
		);
		util.drawToScreen(toDraw, false);
		return;
	}

	shade2([tex2?.get()!], ` // todo: rm the ! and ? when I've migrated ImgProc to TS.
		float d = fetch1() - fetch1(tex1, tc - vec2(0, tsize1.y));
		d *= 102.0f;
		//_out.rgb = fetch3(tex2);
		_out.rgb = vec3(.9, .9, .9);//vec3(0,.2,.5);
		const float specThres = -0.02;
		float specular = max(-d-.1, 0.0f) + .5;
		float fw = fwidth(d);
		specular *= 1.0-smoothstep(specThres - fw/2.0, specThres + fw/2.0, d);
		//if(d < -0.09)
			_out.rgb += specular * vec3(1); // specular
		if(d>0.0f)_out.rgb /= 1.0+d; // shadows
		_out.rgb /= _out.rgb + 1.0f;
		//_out.rgb = pow(_out.rgb, vec3(1.0/2.2)); // gamma correction
		`, {
			toScreen: true,
			releaseFirstInputTex: true
		});
}
requestAnimationFrame(animate);
