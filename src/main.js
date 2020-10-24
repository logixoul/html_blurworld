// https://threejs.org/docs/index.html#api/en/materials/RawShaderMaterial

import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade2 } from './shade.js';
import * as ImgProc from './ImgProc.js';

//var imgcv = new cv.Mat(window.innerWidth, window.innerHeight, cv.CV_32F);

var img = new ImgProc.Image(window.innerWidth/4, window.innerHeight/4);

img.forEach((x, y) => img.set(x, y, Math.random()));

var tex = new THREE.DataTexture(img.data, img.width, img.height, THREE.RedFormat, THREE.FloatType);

function animate() {
	//setInterval(animate, 1000);
	requestAnimationFrame( animate );
	tex = ImgProc.blurIterated(tex, 1);
	tex = shade2([tex], `
		_out.r = smoothstep(0.0f, 1.0f, fetch1());
		`);
	shade2([tex], `
		_out.rgb = vec3(fetch1());
		`, {
			toScreen: true,
			scale: new THREE.Vector2(4, 4)
		});
}
animate();