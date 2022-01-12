import * as THREE from 'three';
import { shade2, textureCache } from './shade'

export var renderer = new THREE.WebGLRenderer();
document.body.appendChild( renderer.domElement );

export function cloneTex(inTex : any) {
	return shade2([inTex], `_out = fetch4();`, { releaseFirstInputTex: false});
}

export function unpackTex(t : any) {
	if(t.isWebGLRenderTarget)
		return t.texture;
	else return t;
}

export function drawToScreen(inputTex : any, releaseFirstInputTex : boolean) {
	shade2([inputTex], `
		_out.rgb = fetch3();
		`, {
			toScreen: true,
			releaseFirstInputTex: releaseFirstInputTex
		});
}

export function saveImage(tex : any) {
	drawToScreen(tex, false);
	var dataURL = renderer.domElement.toDataURL();
	var img = new Image();
	img.src = dataURL;
	document.body.appendChild(img);
}