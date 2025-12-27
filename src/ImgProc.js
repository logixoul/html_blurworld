import * as GpuCompute from "./GpuCompute";
import * as util from "./util";
import * as THREE from 'three';
import * as System from "./System";

export function fastBlur(tex, releaseFirstInputTex) {
	return GpuCompute.run([tex], `
		float sum = float(0.0);
		sum += texture().r;
		sum += texture(tex1, tc + tsize1 * vec2(1, 0)).r;
		sum += texture(tex1, tc + tsize1 * vec2(0, 1)).r;
		sum += texture(tex1, tc + tsize1 * vec2(1, 1)).r;

		_out.r = sum / 4.0f;
		`
		, {
			releaseFirstInputTex: releaseFirstInputTex,
			vshaderExtra: `tc -= tsize1 / 2.0;`
		}
	);
}

export function blur(tex, width, scaleArg, releaseFirstInputTex) {
	if(width === undefined) width = .45;
	var tex2 = GpuCompute.run([tex], `
		float offset[3] = float[](0.0, 1.3846153846, 3.2307692308);
		float weight[3] = float[](0.2270270270, 0.3162162162, 0.0702702703);
		_out = texture() * weight[0];
		for (int i=1; i<3; i++) {
			_out +=
				texture(tc + vec2(0.0, offset[i]) * tsize1 * width)
					* weight[i];
			_out +=
				texture(tc - vec2(0.0, offset[i]) * tsize1 * width)
					* weight[i];
		}
		_out.a = 1.0f;
		`
		, {
			uniforms: { width: width },
			releaseFirstInputTex: releaseFirstInputTex,
			scale: new THREE.Vector2(1.0, scaleArg)
		}
	);
	tex2 = GpuCompute.run([tex2], `
		float offset[3] = float[](0.0, 1.3846153846, 3.2307692308);
		float weight[3] = float[](0.2270270270, 0.3162162162, 0.0702702703);
		_out = texture(tex1, tc) * weight[0];
		for (int i=1; i<3; i++) {
			_out +=
				texture(tex1, tc + vec2(offset[i], 0.0) * tsize1 * width)
					* weight[i];
			_out +=
				texture(tex1, tc - vec2(offset[i], 0.0) * tsize1 * width)
					* weight[i];
		}
		_out.a = 1.0f;
	`
	, {
		uniforms: { width: width },
		releaseFirstInputTex: true,
		scale: new THREE.Vector2(scaleArg, 1.0)
	}
	);
	return tex2;
}

export function extrude_oneIteration(state, inTex, releaseFirstInputTex) {
	let stateLocal = util.cloneTex(state);
	if(releaseFirstInputTex) {
		GpuCompute.texturePool.onNoLongerUsingTex(state);
	}
	let blurred = blur(stateLocal, 1.0, 1.0, false);
	
	stateLocal = GpuCompute.run([stateLocal, blurred], `
		float state = texture(tex1).r;
		float blurred = texture(tex2).r;
		state = mix(blurred, state, 0.0);
		_out.r = state;`
		, {
			releaseFirstInputTex: true,
		}
		);
	blurred.willNoLongerUse();
	//state = fastBlur(state, releaseFirstInputTex);
	stateLocal = GpuCompute.run([stateLocal, inTex], `
		float state = texture(tex1).r;
		float binary = texture(tex2).r;
		state = mix(state, state * binary, 0.5);
		//state *= binary;
		//state = .5 * (binary+state);
		_out.r = state;`
		, {
			releaseFirstInputTex: true
		}
		);
	return stateLocal;
}

export function scale(inTex, scale, releaseFirstInputTex) {
	// upscale
	var state = GpuCompute.run([inTex], `
		_out.r = texture().r;
		`, {
			scale: new THREE.Vector2(scale, scale),
			releaseFirstInputTex: releaseFirstInputTex
		});
	return state;
}

export function extrude(inTex, iters, scaleArg, releaseFirstInputTex) {
	var state = util.cloneTex(inTex);


	for(let i = 0; i < iters; i++)
	{
		state = extrude_oneIteration(state, inTex, /*releaseFirstInputTex=*/ true);
	}
	state.magFilter = THREE.LinearFilter;
	//state = scale(state, 1.0/scaleArg, true);
	
	// blur to fix upscale-artefacts
	const blurSize = window.blurSize || 1.0;
	// extra blurs to make sure edges are smooth
	state = blur(state, blurSize, 1.0/scaleArg, true);
	//state = fastBlur(state, true);
	
	// make edges sharp again
	state = GpuCompute.run([state, inTex], `
		float f = texture(tex2).r;
		float fw = fwidth(f);
		f = smoothstep(.5-fw, .5+fw, f);
		f = texture().r * f;
		_out.r = f;
		`, {
			releaseFirstInputTex: true
		});
	if(releaseFirstInputTex) {
		inTex.willNoLongerUse();
	}
	return state;
}

export function zeroOutBorders(tex, releaseFirstInputTex) {
	return GpuCompute.run([tex], `
		float f = texture().r;
		ivec2 fc=  ivec2(gl_FragCoord.xy);
		ivec2 maxCoords = textureSize(tex1, 0) - ivec2(1, 1);
		if(fc.x == 0 || fc.y == 0 || fc.x == maxCoords.x || fc.y == maxCoords.y) f = 0.0f;
		_out.r = f;
		`, {
			releaseFirstInputTex: releaseFirstInputTex
		}
	);
}
