import * as THREE from './lib/node_modules/three/src/Three.js';

export var renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );
