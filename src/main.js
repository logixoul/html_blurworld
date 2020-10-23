// https://threejs.org/docs/index.html#api/en/materials/RawShaderMaterial

import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade } from './shade.js';

var scene = new THREE.Scene();
var camera = new THREE.OrthographicCamera( 0, 1, 0, 1, -1000, 1000 );

var renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

var tex = shade(renderer, [], document.getElementById( 'fShader' ).textContent);

var screenGeometry = new THREE.PlaneBufferGeometry();
var screenMaterial = new THREE.MeshBasicMaterial({
	side: THREE.DoubleSide,
	map: tex
	});
var planeMesh = new THREE.Mesh( screenGeometry, screenMaterial );

planeMesh.position.set(.5, .5, 0);

scene.add( planeMesh );

function animate() {
	requestAnimationFrame( animate );
	
	renderer.setRenderTarget(null);
	renderer.render( scene, camera );
}
animate();