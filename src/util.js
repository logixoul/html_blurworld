import * as THREE from './lib/node_modules/three/src/Three.js';

export var renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

var scene = new THREE.Scene();

var screenGeometry = new THREE.PlaneBufferGeometry();
var screenMaterial = new THREE.MeshBasicMaterial({
	side: THREE.DoubleSide,
	});
var planeMesh = new THREE.Mesh( screenGeometry, screenMaterial );

planeMesh.position.set(.5, .5, 0);

scene.add( planeMesh );

var camera = new THREE.OrthographicCamera( 0, 1, 0, 1, -1000, 1000 );

export function drawTexToScreen(tex) {
	screenMaterial.map = tex;

	renderer.setRenderTarget(null);
	renderer.render( scene, camera );
}