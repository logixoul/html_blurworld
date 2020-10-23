import * as THREE from './lib/node_modules/three/src/Three.js';

var screenGeometry = new THREE.PlaneBufferGeometry();
var screenMaterial = new THREE.MeshBasicMaterial({
	side: THREE.DoubleSide,
	});
var planeMesh = new THREE.Mesh( screenGeometry, screenMaterial );

planeMesh.position.set(.5, .5, 0);

var camera = new THREE.OrthographicCamera( 0, 1, 0, 1, -1000, 1000 );

export function drawTexToScreen(renderer, scene, tex) {
	screenMaterial.map = tex;
	scene.add( planeMesh );

	renderer.setRenderTarget(null);
	renderer.render( scene, camera );

	scene.remove( planeMesh );
}