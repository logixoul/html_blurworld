// https://threejs.org/docs/index.html#api/en/materials/RawShaderMaterial

import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade2 } from './shade.js';
import * as ImgProc from './ImgProc.js';
import { globals } from './Globals.js';
import * as Input from './Input.js';
import * as util from './util.js';

//var imgcv = new cv.Mat(window.innerWidth, window.innerHeight, cv.CV_32F);

function initStateTex() {
	var img = new ImgProc.Image(window.innerWidth/4, window.innerHeight/4, Uint8Array);

	img.forEach((x, y) => img.set(x, y, Math.random()*255));

	globals.stateTex = new THREE.DataTexture(img.data, img.width, img.height, THREE.RedFormat, THREE.UnsignedByteType);

	globals.stateTex.generateMipmaps = false;
	util.renderer.setSize( window.innerWidth, window.innerHeight );
}

initStateTex();

document.defaultView.addEventListener("resize", initStateTex);

function animate() {
	//setInterval(animate, 100000);
	requestAnimationFrame( animate );
	
	globals.stateTex = shade2([globals.stateTex], `
		float f = fetch1();
		ivec2 fc=  ivec2(gl_FragCoord.xy);
		ivec2 maxCoords = textureSize(tex1, 0) - ivec2(1, 1);
		if(fc.x == 0 || fc.y == 0 || fc.x == maxCoords.x || fc.y == maxCoords.y) f = 0.0f;
		_out.r = f;
		`, {
			disposeFirstInputTex: false
		}
	);

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
			scale: new THREE.Vector2(4, 4),
			disposeFirstInputTex: false
		});
	//var tex3 = extrude(tex2); tex2.dispose();
	var tex3 = tex2;
	shade2([tex3], `
		float f = fetch1();// * 0.5;
		_out.rgb = vec3(f);
		`, {
			toScreen: true
		});
	tex3.dispose()
}
animate();