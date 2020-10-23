import * as THREE from './lib/node_modules/three/src/Three.js';

export function shade(renderer, texs, fshader) {
	const var fshader_complete = `	varying vec2 vUv;
		` + fshader;

	var camera = new THREE.OrthographicCamera( 0, 1, 0, 1, -1000, 1000 );

	var geometry = new THREE.PlaneBufferGeometry();
	var material = new THREE.ShaderMaterial( {
		uniforms: { time: { value: 0.0 } },
		vertexShader: document.getElementById( 'vertexShader' ).textContent,
		fragmentShader: fshader_complete,
		side: THREE.DoubleSide
		} );
	var mesh = new THREE.Mesh( geometry, material );

	mesh.position.set(.5, .5, 0);

	var scene = new THREE.Scene();
	var renderTarget = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter});

	scene.add( mesh );

	renderer.setRenderTarget(renderTarget);
	renderer.render(scene, camera);

	return renderTarget.texture;
}