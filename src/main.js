import * as THREE from './lib/node_modules/three/src/Three.js';

var scene = new THREE.Scene();
var camera = new THREE.OrthographicCamera( 0, 1, 0, 1, -1000, 1000 );

var renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

var geometry = new THREE.PlaneBufferGeometry();
var material = new THREE.ShaderMaterial( {
	uniforms: { time: { value: 0.0 } },
	vertexShader: document.getElementById( 'vertexShader' ).textContent,
	fragmentShader: document.getElementById( 'fragment_shader_pass_1' ).textContent,
	side: THREE.DoubleSide
	} );
var planeMesh = new THREE.Mesh( geometry, material );

planeMesh.position.set(.5, .5, 0);

scene.add( planeMesh );

/*var bufferScene = new THREE.Scene();
var bufferTexture = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter});*/

function animate() {
	requestAnimationFrame( animate );
	renderer.render( scene, camera );
}
animate();