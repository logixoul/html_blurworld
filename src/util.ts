import * as THREE from 'three';
import * as GpuCompute from './GpuCompute'


export var renderer = new THREE.WebGLRenderer({antialias: true });
document.body.appendChild( renderer.domElement );

export function cloneTex(inTex : any) {
	return GpuCompute.run([inTex], `_out = fetch4();`, { releaseFirstInputTex: false});
}

export function unpackTex(t : any) {
	if(t.isWebGLRenderTarget)
		return t.texture;
	else return t;
}

export function drawToScreen(inputTex : any, releaseFirstInputTex : boolean) {
	GpuCompute.run([inputTex], `
		vec2 texSize = vec2(textureSize(tex1, 0));
		_out.rgb = texelFetch(tex1, ivec2(tc * texSize), 0).rgb;
		`, {
			toScreen: true,
			releaseFirstInputTex: releaseFirstInputTex
		});
}

export function appendImageToHtml(tex : GpuCompute.TextureWrapper) {
	var oldMagFilter = tex.get().magFilter;
	tex.magFilter = THREE.NearestFilter;
	drawToScreen(tex, false);
	tex.magFilter = oldMagFilter;

	var dataURL = renderer.domElement.toDataURL();
	var img = new Image();
	img.src = dataURL;
	document.body.appendChild(img);
}