// https://threejs.org/docs/index.html#api/en/materials/RawShaderMaterial

import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade2 } from './shade.js';
import { renderer, drawTexToScreen } from './util.js';

var data = new Float32Array( window.innerWidth * window.innerHeight );

for(var i = 0; i < data.length; i++) {
	data[i] = Math.random();
}

var tex = new THREE.DataTexture(data, window.innerWidth, window.innerHeight, THREE.RedFormat, THREE.FloatType);

function animate() {
	//setInterval(animate, 1000);
	requestAnimationFrame( animate );
	tex = shade2([tex], `
		vec3 sum = vec3(0.0);
		vec2 tsize = vec2(1.0) / vec2(textureSize(tex1, 0));
		sum += fetch3(tex1, tc + tsize * vec2(-1.0, -1.0)) / 16.0;
		sum += fetch3(tex1, tc + tsize * vec2(-1.0, 0.0)) / 8.0;
		sum += fetch3(tex1, tc + tsize * vec2(-1.0, +1.0)) / 16.0;

		sum += fetch3(tex1, tc + tsize * vec2(0.0, -1.0)) / 8.0;
		sum += fetch3(tex1, tc + tsize * vec2(0.0, 0.0)) / 4.0;
		sum += fetch3(tex1, tc + tsize * vec2(0.0, +1.0)) / 8.0;

		sum += fetch3(tex1, tc + tsize * vec2(+1.0, -1.0)) / 16.0;
		sum += fetch3(tex1, tc + tsize * vec2(+1.0, 0.0)) / 8.0;
		sum += fetch3(tex1, tc + tsize * vec2(+1.0, +1.0)) / 16.0;
		_out.rgb = sum;
		`,
		{disposeFirstInputTex: true});
	tex = shade2([tex], `
		_out.r = smoothstep(0.0f, 1.0f, fetch1());
		`,
		{disposeFirstInputTex: true});
	drawTexToScreen(tex);
}
animate();