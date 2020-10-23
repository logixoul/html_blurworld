// https://threejs.org/docs/index.html#api/en/materials/RawShaderMaterial

import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade } from './shade.js';
import { drawTexToScreen } from './util.js';

var scene = new THREE.Scene();

var renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

var tex = shade(renderer, [], document.getElementById( 'fShader' ).textContent);

function animate() {
	requestAnimationFrame( animate );
	
	drawTexToScreen(renderer, scene, tex);
}
animate();