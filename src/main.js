// https://threejs.org/docs/index.html#api/en/materials/RawShaderMaterial

import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade2 } from './shade.js';
import * as ImgProc from './ImgProc.js';

//var imgcv = new cv.Mat(window.innerWidth, window.innerHeight, cv.CV_32F);

var img = new ImgProc.Image(window.innerWidth/4, window.innerHeight/4);

img.forEach((x, y) => img.set(x, y, Math.random()));

var gState = new THREE.DataTexture(img.data, img.width, img.height, THREE.RedFormat, THREE.FloatType);

function cloneTex(inTex) {
	return shade2([inTex], `_out = fetch4();`, { disposeFirstInputTex: false});
}

function extrude(inTex) {
	const iters = 0;
	var state = cloneTex(inTex);
	//var orig = shade2(inTex, `_out = fetch4();`, { disposeFirstInputTex: false});
	for(var i = 0; i < iters; i++)
	{
		var state = ImgProc.blur(state);
		state = shade2([state, inTex],
			`float state = fetch1(tex);
			float binary = fetch1(tex2);
			state *= binary;
			_out.r = state;`
			);
		state = shade2([state, inTex],`
			float state = fetch1(tex);
			float binary = fetch1(tex2);
			state += binary;
			_out.r = state;`
			);
	}
	return state;
}

function animate() {
	//setInterval(animate, 100000);
	requestAnimationFrame( animate );
	gState = ImgProc.blurIterated(gState, 1);
	gState = shade2([gState], `
		_out.r = smoothstep(0.0f, 1.0f, fetch1());
		`);
	var tex2 = shade2([gState], `
		float f = fetch1();
		float fw = fwidth(f);
		f = smoothstep(.5-fw, .5+fw, f);
		_out.r = f;
		`, {
			//scale: new THREE.Vector2(4, 4),
			disposeFirstInputTex: false
		});
	//var tex3 = extrude(tex2); tex2.dispose();
	//var tex3 = tex2;
	shade2([gState], `
		float f = fetch1();
		_out.rgb = vec3(f);
		`, {
			toScreen: true
		});
	tex3.dispose()
}
animate();