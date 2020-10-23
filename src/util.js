import * as THREE from './lib/node_modules/three/src/Three.js';

var screenGeometry = new THREE.PlaneBufferGeometry();
var screenMaterial = new THREE.MeshBasicMaterial({
	side: THREE.DoubleSide,
	});
var planeMesh = new THREE.Mesh( screenGeometry, screenMaterial );

planeMesh.position.set(.5, .5, 0);

export function drawTexToScreen(scene, tex) {
	screenMaterial.map = tex;
	scene.add( planeMesh );
}