// https://threejs.org/docs/index.html#api/en/materials/RawShaderMaterial

import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade } from './shade.js';
import { renderer, drawTexToScreen } from './util.js';

var tex = shade(renderer, [], document.getElementById( 'fShader' ).textContent);

function animate() {
	requestAnimationFrame( animate );
	
	drawTexToScreen(tex);
}
animate();