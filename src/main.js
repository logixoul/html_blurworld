// https://threejs.org/docs/index.html#api/en/materials/RawShaderMaterial

import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade2 } from './shade.js';
import * as ImgProc from './ImgProc.js';
import { globals } from './Globals.js';
import * as Input from './Input.js';
import * as util from './util.js';

import { HDRCubeTextureLoader } from './lib/node_modules/three/examples/jsm/loaders/HDRCubeTextureLoader.js';

//var imgcv = new cv.Mat(window.innerWidth, window.innerHeight, cv.CV_32F);

function initStateTex() {
	var img = new ImgProc.Image(
		Math.trunc(window.innerWidth/4), Math.trunc(window.innerHeight/4),
		Float32Array)//Uint8Array);

	img.forEach((x, y) => img.set(x, y, Math.random()));

	globals.stateTex = new THREE.DataTexture(img.data, img.width, img.height, THREE.RedFormat, THREE.FloatType);//THREE.UnsignedByteType);

	globals.stateTex.generateMipmaps = false;
	util.renderer.setSize( window.innerWidth, window.innerHeight );
}

initStateTex();

var cubemap = new HDRCubeTextureLoader()
	.setPath( 'pisaHDR/' )
	.load( [ 'px.hdr', 'nx.hdr', 'py.hdr', 'ny.hdr', 'pz.hdr', 'nz.hdr' ] );

cubemap.setMinFilter(THREE.LinearFilter);
cubemap.setMagFilter(THREE.LinearFilter);

document.defaultView.addEventListener("resize", initStateTex);


function animate() {
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
	tex3 = shade2([tex3], "_out.r = fetch1() * .05;");
	shade2([tex3, cubemap], `
		float t = fetch1(tex1, tc - vec2(0, tsize1.y));
		float b = fetch1(tex1, tc + vec2(0, tsize1.y));
		float l = fetch1(tex1, tc - vec2(tsize1.x, 0));
		float r = fetch1(tex1, tc + vec2(tsize1.y, 0));
		vec3 normal = vec3(2.0f*(r-l), 2.0f*(b-t), -4.0f);
		normal = normalize(normal);
		_out.rgb=textureCube(tex2, normal).rgb*1.0f;
		//float f = dot(_out.rgb, vec3(1.0/3.0));
		//_out.rgb = vec3(f);
		`, {
			toScreen: true
		});
	tex3.dispose()
}
animate();