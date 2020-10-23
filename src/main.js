// https://threejs.org/docs/index.html#api/en/materials/RawShaderMaterial

import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade } from './shade.js';
import { drawTexToScreen } from './util.js';

var scene = new THREE.Scene();
var camera = new THREE.OrthographicCamera( 0, 1, 0, 1, -1000, 1000 );

var renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

var tex = shade(renderer, [], document.getElementById( 'fShader' ).textContent);

drawTexToScreen(scene, tex);

function animate() {
	requestAnimationFrame( animate );
	
	renderer.setRenderTarget(null);
	renderer.render( scene, camera );
}
animate();