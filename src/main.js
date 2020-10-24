// https://threejs.org/docs/index.html#api/en/materials/RawShaderMaterial

import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade2 } from './shade.js';
import { oldBlur, blur } from './blur.js';

var data = new Float32Array( window.innerWidth * window.innerHeight );

for(var i = 0; i < data.length; i++) {
	data[i] = Math.random();
}

var tex = new THREE.DataTexture(data, window.innerWidth, window.innerHeight, THREE.RedFormat, THREE.FloatType);

function animate() {
	//setInterval(animate, 1000);
	requestAnimationFrame( animate );
	tex = blur(tex, {disposeFirstInputTex: true});
	tex = shade2([tex], `
		_out.r = smoothstep(0.0f, 1.0f, fetch1());
		`,
		{disposeFirstInputTex: true});
	tex.texture.format = THREE.LuminanceFormat;
	shade2([tex], `
		_out.rgb = vec3(fetch1());
		`,
		{toScreen: true});
}
animate();