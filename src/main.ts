import * as THREE from 'three';
import { shade2, lx, TextureUnion } from './shade';
import * as ImgProc from './ImgProc.js';
import { globals } from './Globals.js';
import './Input.js'; // for side fx
import * as util from './util';
import { Image } from "./Image";
import { FramerateCounter } from "./FramerateCounter";
import * as KeysHeld from './KeysHeld';
import * as PresentationForIashu from './presentationForIashu';
import * as System from './System';

let backgroundPicTex : lx.Texture;
let assetsLoaded : boolean = false;
let backgroundPicTexOrig : lx.Texture = new lx.Texture(new THREE.TextureLoader().load( 'assets/milkyway.png', (tex) => {
	backgroundPicTex = shade2([backgroundPicTexOrig], `
	_out.rgb = fetch3();
	_out.rgb /= 1.0 - 0.99*_out.rgb;
	//_out.rgb = pow(_out.rgb, vec3(2.2));
	`, {
		releaseFirstInputTex: false, // todo: fix memory leak
		itype: THREE.FloatType
	})!
	assetsLoaded = true;
}));

function createStateTex() {
	var documentW = window.innerWidth;
	var documentH = window.innerHeight;
	globals.scale = Math.sqrt(200*150) / Math.sqrt(documentW * documentH);
	//globals.scale = 1;
	
	
	var img = new Image<Float32Array>(
		Math.trunc(documentW*globals.scale), Math.trunc(documentH*globals.scale),
		Float32Array);
		//Uint8Array);

	img.forEach((x : number, y : number) => img.set(x, y, Math.random()));

	let stateTex : TextureUnion = new THREE.DataTexture(img.data, img.width, img.height, THREE.RedFormat,
			THREE.FloatType);
			//THREE.UnsignedByteType);
	stateTex.generateMipmaps = false;
	stateTex.minFilter = THREE.LinearFilter;
	stateTex.magFilter = THREE.LinearFilter;
	stateTex.needsUpdate = true;

	stateTex = shade2([stateTex],
		`_out.r = fetch1();`, { itype:
			//THREE.UnsignedByteType,
			//THREE.HalfFloatType,
			THREE.FloatType,
		releaseFirstInputTex: true })!;
	return stateTex;
}

function onResize() {
	globals.stateTex0 = createStateTex();
	globals.stateTex1 = createStateTex();
	util.renderer.setSize( window.innerWidth, window.innerHeight );
}

onResize();

document.getElementById("loadingScreen")!.style.display = "none";

if(window.location.hostname !== "localhost") {
	document.getElementById("framerate")!.style.display = "none";
}
PresentationForIashu.init();

document.defaultView!.addEventListener("resize", () => {
	onResize();
});
const framerateCounter = new FramerateCounter();

function doSimulationStep(inTex : lx.Texture, releaseFirstInputTex : boolean) {
	let state : lx.Texture = ImgProc.zeroOutBorders(inTex, /*releaseFirstInputTex=*/ releaseFirstInputTex)!;
	state = ImgProc.blur(state, 0.45, 1.0, /*releaseFirstInputTex=*/ true)!;
	state = shade2([state?.get()], `
		float f = fetch1();
		float fw = fwidth(f);
		f = smoothstep(.5-fw, .5+fw, f);
		_out.r = f;
		`, {
			releaseFirstInputTex: true
		})!;
	return state;
}

let limitFramerateCheckbox = document.getElementById("limitFramerate")! as HTMLInputElement;

function make3d(heightmap: lx.Texture, albedo: THREE.Vector3, options?: any) {
	options = options || {};
	let tex3d = shade2([heightmap?.get()!], ` // todo: rm the ! and ? when I've migrated ImgProc to TS.
		float here = fetch1();
		vec2 d = vec2(
			here - fetch1(tex1, tc - vec2(tsize1.x, 0)),
			here - fetch1(tex1, tc - vec2(0, tsize1.y))
			);
		d *= 102.0f;
		d.x *= -1.0f * .10;
		
		//_out.rgb = fetch3(tex2);//vec3(0,.2,.5);
		const vec2 specThres = vec2(-0.02);
		vec2 specular = max(vec2(-d-.1), vec2(0.0f)) + vec2(.5);
		vec2 fw = fwidth(d);
		
		specular *= vec2(1.0)-smoothstep(specThres - fw/2.0, specThres + fw/2.0, d);
		vec3 specularRgb = vec3(specular.y);
		
		if(here > 0.0)
			_out.rgb = albedo.rgb*4.0;
		else
			_out.rgb = vec3(-1.0); // sentinel value for "no data"
		
		_out.rgb += specularRgb; // specular
		if(d.y>0.0f)_out.rgb /= 1.0+d.y*10.0; // shadows

		//_out.rgb /= _out.rgb + 1.0f;
		//
		`, {
			releaseFirstInputTex: options.releaseFirstInputTex !== undefined ? options.releaseFirstInputTex : false,
			iformat: THREE.RGBAFormat,
			itype: THREE.FloatType,
			uniforms: {
				albedo: new THREE.Uniform(albedo)
			}
		});
	return tex3d;
}

function animate(now: DOMHighResTimeStamp) {
	framerateCounter.update(now);
	if(limitFramerateCheckbox.checked)
		setTimeout(animate, 1000);
	else
		requestAnimationFrame( animate );
	
	if(!assetsLoaded)
		return;

	globals.stateTex0 = doSimulationStep(globals.stateTex0, /*releaseFirstInputTex=*/ true);
	globals.stateTex1 = doSimulationStep(globals.stateTex1, /*releaseFirstInputTex=*/ true);
	const stateTex0Shrunken = shade2([globals.stateTex0, globals.stateTex1], `
		_out.r = max(0.0, fetch1(tex1) - fetch1(tex2));
		`,
		{
			releaseFirstInputTex: false
		})!;
	/*const stateTex1Shrunken = shade2([globals.stateTex1, globals.stateTex0], `
		_out.r = max(0.0, fetch1(tex1) - fetch1(tex2));
		`)!;*/
	/*const stateTexIntersection = shade2([globals.stateTex1, globals.stateTex0], `
		_out.r = fetch1(tex1) * fetch1(tex2);
		`)!;*/
	globals.stateTex0.willNoLongerUse();
	//globals.stateTex1.willNoLongerUse();
	globals.stateTex0 = stateTex0Shrunken;
	//globals.stateTex1 = stateTex1Shrunken;

	const iters = 30;// * System.getMousePos().x / window.innerWidth;

	var extruded0 = ImgProc.extrude(globals.stateTex0, iters, globals.scale, /*releaseFirstInputTex=*/ false);
	var extruded1 = ImgProc.extrude(globals.stateTex1, iters,globals.scale, /*releaseFirstInputTex=*/ false);
	//var extruded2 = ImgProc.extrude(stateTexIntersection, globals.scale, /*releaseFirstInputTex=*/ false);
	/*if(KeysHeld.global_keysHeld["digit1"]) {
		var toDraw = shade2([tex2!], `
		float state = fetch1(tex1);
		//state = .5 * state;
		_out.r = state;`
		, {
			releaseFirstInputTex: true
		}
		);
		util.drawToScreen(toDraw, false);
		return;
	}*/

	let tex3d_0 = make3d(extruded0!, new THREE.Vector3(1.5, 0.2, 0.0), { releaseFirstInputTex: true });
	let tex3d_1 = make3d(extruded1!, new THREE.Vector3(0.0, 0.2, 1.5), { releaseFirstInputTex: true });
	//let tex3d_2 = make3d(extruded2!, new THREE.Vector3(1.5, 0.2, 1.5), { releaseFirstInputTex: true });
	let tex3d = shade2([tex3d_0?.get()!, tex3d_1?.get()!, backgroundPicTex?.get()!], `
		vec3 col0 = fetch3(tex1);
		vec3 col1 = fetch3(tex2);
		if(col0.r < 0.0 && col1.r < 0.0) {
			_out.rgb = vec3(-1.0); // use sentinel value for "no data"
			return;
		}
		col0 = max(col0, vec3(0.0));
		col1 = max(col1, vec3(0.0));
		_out.rgb = col0 + col1;
		`, {
			releaseFirstInputTex: false
		});
	/*let tex3dThresholded = shade2([tex3d?.get()!], `
		vec3 col = fetch3();
		//col *= step(1.0, dot(col, vec3(1.0/3.0)));
		_out.rgb = col;
		`);*/
	let tex3dToBlur = shade2([globals.stateTex0?.get()!, globals.stateTex1?.get()!], `
		vec3 col0 = fetch3(tex1);
		vec3 col1 = fetch3(tex2);
		if(col0 == vec3(0.0) && col1 == vec3(0.0)) {
			_out.rgb = vec3(0.0); // use black where no data
		} else {
			_out.rgb = vec3(1.0);
		}
		`, {
			releaseFirstInputTex: false
		});
	tex3d_0?.willNoLongerUse();
	tex3d_1?.willNoLongerUse();
	let tex3dBlur = util.cloneTex(tex3dToBlur);
	let tex3dBlurCollected = util.cloneTex(tex3dToBlur);
	tex3dBlurCollected = shade2([tex3dBlurCollected?.get()!], `
		_out.rgb = vec3(0.0); // zero it out
		`, {
			releaseFirstInputTex: true
		});
	for(let i = 0; i < 3; i++) {
		tex3dBlur = ImgProc.scale(tex3dBlur, 0.5, true);
		tex3dBlur = ImgProc.blur(tex3dBlur, 1.0, 1.0, true);
		tex3dBlurCollected = shade2([tex3dBlurCollected?.get()!, tex3dBlur?.get()!], `
			_out.rgb = fetch3(tex1) + fetch3(tex2);
			`, {
				releaseFirstInputTex: true
			});
	}
	/*let tex3dBloom = shade2([tex3d?.get()!, tex3dBlurCollected?.get()!], `
		_out.rgb = fetch3(tex1) * 1.0 + fetch3(tex2) * 1.0;
		_out.rgb = _out.rgb / (_out.rgb + vec3(1.0)); // tone mapping
		_out.rgb = pow(_out.rgb, vec3(1.0/2.2)); // gamma correction
		`, {
			releaseFirstInputTex: false
		});*/
	let tex3dShadowed = shade2([tex3d?.get()!, tex3dBlurCollected?.get()!, backgroundPicTex?.get()!], `
		vec3 col = fetch3(tex1);
		float shadow = fetch1(tex2);
		vec3 background = fetch3(tex3);
		if(col.r < 0.0) {
			col = background; // use background where no data
			//col /= 1.0 + pow(shadow, 4.0);
		} else {
			//col += background * 0.02;
		}
		_out.rgb = col;
		_out.rgb = _out.rgb / (_out.rgb + vec3(1.0)); // tone mapping
		_out.rgb = pow(_out.rgb, vec3(1.0/2.2)); // gamma correction
		`, {
			releaseFirstInputTex: false
		});
	if(KeysHeld.global_keysHeld["keyb"]) {
		util.drawToScreen(tex3dBlurCollected, true);
	}
	//util.drawToScreen(tex3dBlurCollected, false);
	else
	util.drawToScreen(tex3dShadowed, false);

	tex3d?.willNoLongerUse();
	tex3dBlur?.willNoLongerUse();
	tex3dToBlur?.willNoLongerUse();
	tex3dBlurCollected?.willNoLongerUse();
	tex3dShadowed?.willNoLongerUse();
}
requestAnimationFrame(animate);
