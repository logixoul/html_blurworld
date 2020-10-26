import * as THREE from './lib/node_modules/three/src/Three.js';
import { shade2 } from './shade.js'

export var renderer = new THREE.WebGLRenderer();
document.body.appendChild( renderer.domElement );

export function cloneTex(inTex) {
	return shade2([inTex], `_out = fetch4();`, { disposeFirstInputTex: false});
}

export function unpackTex(t) {
	if(t.isWebGLRenderTarget)
		return t.texture;
	else return t;
}