// https://threejs.org/docs/index.html#api/en/materials/RawShaderMaterial

import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade2 } from './shade.js';
import { renderer, drawTexToScreen } from './util.js';

var tex1;
var forScreen;

var data = new Float32Array( 100*100 );

for(var i = 0; i < data.length; i++) {
	data[i] = Math.random();
}

tex1 = new THREE.DataTexture(data, 100, 100, THREE.RedFormat, THREE.FloatType);
var forScreen = tex1;
/*new THREE.TextureLoader().load( 'src/test.jpg',
	t => {
		tex1 = t
		forScreen = shade(renderer, [tex1], `
			vec3 c = fetch3();
			_out.rgb = c*1.0f+vec3( vUv.x, vUv.y, 0 );
		`);
	}
);*/

function animate() {
	requestAnimationFrame( animate );
	forScreen = shade2(renderer, [forScreen],
		`
		_out.r = smoothstep(0.0f, 1.0f, fetch1());
		`)
	if(forScreen)
		drawTexToScreen(forScreen);
}
animate();