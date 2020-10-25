// https://threejs.org/docs/index.html#api/en/materials/RawShaderMaterial

import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade2 } from './shade.js';
import * as ImgProc from './ImgProc.js';

//var imgcv = new cv.Mat(window.innerWidth, window.innerHeight, cv.CV_32F);

var img = new ImgProc.Image(window.innerWidth/4, window.innerHeight/4);

img.forEach((x, y) => img.set(x, y, Math.random()));

var tex = new THREE.DataTexture(img.data, img.width, img.height, THREE.RedFormat, THREE.FloatType);

function extrude(inTex) {
	const iters = 0;
	var state = inTex;
	var orig = shade2(inTex, `_out = fetch4();`, { disposeFirstInputTex: false});
	for(var i = 0; i < iters; i++)
	{
		var state = ImgProc.blur(state);
		state = shade2(state, orig,
			`float state = fetch1(tex);
			float binary = fetch1(tex2);
			state *= binary;
			_out.r = state;`
			);
		state = shade2(state, orig,`
			float state = fetch1(tex);
			float binary = fetch1(tex2);
			state += binary;
			_out.r = state;`
			);
	}
	return state;
}

function animate() {
	//setInterval(animate, 1000);
	requestAnimationFrame( animate );
	tex = ImgProc.blurIterated(tex, 1);
	tex = shade2([tex], `
		_out.r = smoothstep(0.0f, 1.0f, fetch1());
		`);
	var tex2 = shade2([tex], `
		float f = fetch1();
		float fw = fwidth(f);
		f = smoothstep(.5-fw, .5+fw, f);
		_out.rgb = vec3(f);
		`, {
			scale: new THREE.Vector2(4, 4),
			disposeFirstInputTex: false
		});
	shade2([tex2], `
		float f = fetch1();
		float fw = fwidth(f);
		f = smoothstep(.5-fw, .5+fw, f);
		_out.rgb = vec3(f);
		`, {
			toScreen: true
		});
	tex2.dispose()
}
animate();