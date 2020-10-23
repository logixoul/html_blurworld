// https://threejs.org/docs/index.html#api/en/materials/RawShaderMaterial

import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade } from './shade.js';
import { renderer, drawTexToScreen } from './util.js';

var tex = shade(renderer, [], `
	//vec3 c = fetch3();
	_out.rgb = vec3( vUv.x, vUv.y, 0 );
`);

function animate() {
	requestAnimationFrame( animate );
	
	drawTexToScreen(tex);
}
animate();