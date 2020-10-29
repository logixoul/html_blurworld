// https://threejs.org/docs/index.html#api/en/materials/RawShaderMaterial

import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade2 } from './shade.js';
import * as ImgProc from './ImgProc.js';
import { globals } from './Globals.js';
import * as Input from './Input.js';
import * as util from './util.js';

//var imgcv = new cv.Mat(window.innerWidth, window.innerHeight, cv.CV_32F);

function initStateTex() {
	var img = new ImgProc.Image(
		Math.trunc(window.innerWidth/globals.scale), Math.trunc(window.innerHeight/globals.scale),
		Float32Array)//Uint8Array);

	img.forEach((x, y) => img.set(x, y, Math.random()));

	globals.stateTex = new THREE.DataTexture(img.data, img.width, img.height, THREE.RedFormat, THREE.FloatType);//THREE.UnsignedByteType);

	globals.stateTex.generateMipmaps = false;
	util.renderer.setSize( window.innerWidth, window.innerHeight );
}

initStateTex();

document.defaultView.addEventListener("resize", initStateTex);

// https://stackoverflow.com/questions/16432804/recording-fps-in-webgl
const fpsElem = document.querySelector("#fps");
let then = 0;

function animate(now) {
	now *= 0.001; // convert to seconds
	const deltaTime = now - then;
	then = now;
	const fps = 1 / deltaTime;
	fpsElem.textContent = fps.toFixed(1);


	//setInterval(animate, 100000);
	requestAnimationFrame( animate );
	
	globals.stateTex = ImgProc.zeroOutBorders(globals.stateTex);

	globals.stateTex = ImgProc.blur(globals.stateTex);
	globals.stateTex = shade2([globals.stateTex], `
		_out.r = smoothstep(0.0f, 1.0f, fetch1());
		`, {
			disposeFirstInputTex: false
		});
	var tex2 = shade2([globals.stateTex], `
		float f = fetch1();
		float fw = fwidth(f);
		f = smoothstep(.5-fw, .5+fw, f);
		_out.r = f;
		`, {
		//	scale: new THREE.Vector2(4, 4),
			disposeFirstInputTex: false
		});
	var tex3 = ImgProc.extrude(tex2); tex2.dispose();
	//var tex3 = tex2;
	shade2([tex3], `
		float d = fetch1() - fetch1(tex1, tc - vec2(0, tsize1.y));
		_out.rgb = vec3(0,.2,.5);
		_out.rgb += vec3(max(-d, 0.0f)); // specular
		if(d>0.0f)_out.rgb /= 2.0f+d; // shadows
		_out.rgb /= _out.rgb + 1.0f;
		//_out.rgb = pow(_out.rgb, vec3(1.0/2.2));
		`, {
			toScreen: true
		});
	tex3.dispose()
}
animate();