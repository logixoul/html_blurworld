// https://threejs.org/docs/index.html#api/en/materials/RawShaderMaterial

import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade } from './shade.js';
import { renderer, drawTexToScreen } from './util.js';

var tex = shade(renderer, [], `
	void main() {
		float r = vUv.x;
		float g = vUv.y;

		gl_FragColor = vec4( r, g, 0, 1.0 );
	}
`);

function animate() {
	requestAnimationFrame( animate );
	
	drawTexToScreen(tex);
}
animate();