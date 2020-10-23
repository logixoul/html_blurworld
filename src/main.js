// https://threejs.org/docs/index.html#api/en/materials/RawShaderMaterial

import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade } from './shade.js';
import { renderer, drawTexToScreen } from './util.js';

var tex1;
var forScreen;

new THREE.TextureLoader().load( 'src/test.jpg',
	t => {
		tex1 = t
		forScreen = shade(renderer, [tex1], `
			vec3 c = fetch3();
			_out.rgb = c*1.0f+vec3( vUv.x, vUv.y, 0 );
		`);
	}
);

function animate() {
	requestAnimationFrame( animate );
	
	if(forScreen)
		drawTexToScreen(forScreen);
}
animate();