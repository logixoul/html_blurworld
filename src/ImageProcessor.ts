import * as THREE from 'three';
import { GpuComputeContext, TextureWrapper } from "./GpuCompute";

export class ImageProcessor {
	private compute: GpuComputeContext;

	constructor(compute: GpuComputeContext) {
		this.compute = compute;
	}

	cloneTex(inTex: TextureWrapper): TextureWrapper {
		return this.compute.run([inTex], `_out = texture();`, { releaseFirstInputTex: false });
	}
	
	mul(inTex : TextureWrapper, amount : number, releaseFirstInputTex: boolean) {
		return this.compute.run([inTex],`
			_out.rgb = texture().rgb * mul;
		`,
		{
			releaseFirstInputTex: releaseFirstInputTex,
			uniforms: { mul: amount }
		}
		)!;
	}


	fastBlur(tex: TextureWrapper, releaseFirstInputTex: boolean): TextureWrapper {
		return this.compute.run([tex], `
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

	blur(tex: TextureWrapper, width: number = 0.45, scaleArg: number, releaseFirstInputTex: boolean): TextureWrapper {
		let tex2 = this.compute.run([tex], `
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
		tex2 = this.compute.run([tex2], `
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

	extrude_oneIteration(state: TextureWrapper, inTex: TextureWrapper, releaseFirstInputTex: boolean): TextureWrapper {
		let stateLocal = this.cloneTex(state);
		if(releaseFirstInputTex) {
			this.compute.willNoLongerUse(state);
		}
		let blurred = this.blur(stateLocal, 1.0, 1.0, false);
		
		stateLocal = this.compute.run([stateLocal, blurred], `
			float state = texture(tex1).r;
			float blurred = texture(tex2).r;
			state = mix(blurred, state, 0.0);
			_out.r = state;`
			, {
				releaseFirstInputTex: true,
			}
			);
		this.compute.willNoLongerUse(blurred);
		//state = fastBlur(state, releaseFirstInputTex);
		stateLocal = this.compute.run([stateLocal, inTex], `
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

	scale(inTex: TextureWrapper, scale: number, releaseFirstInputTex: boolean): TextureWrapper {
		// upscale
		const state = this.compute.run([inTex], `
			_out.r = texture().r;
			`, {
				scale: new THREE.Vector2(scale, scale),
				releaseFirstInputTex: releaseFirstInputTex
			});
		return state;
	}

	extrude(inTex: TextureWrapper, iters: number, scaleArg: number, releaseFirstInputTex: boolean): TextureWrapper {
		let state = this.cloneTex(inTex);

		for(let i = 0; i < iters; i++)
		{
			state = this.extrude_oneIteration(state, inTex, /*releaseFirstInputTex=*/ true);
		}
		state.magFilter = THREE.LinearFilter;
		//state = scale(state, 1.0/scaleArg, true);
		
		// blur to fix upscale-artefacts
		const blurSize = (window as { blurSize?: number }).blurSize || 1.0;
		// extra blurs to make sure edges are smooth
		state = this.blur(state, blurSize, 1.0/scaleArg, true);
		state = this.blur(state, blurSize, 1.0, true);
		//state = fastBlur(state, true);
		
		// make edges sharp again
		state = this.compute.run([state, inTex], `
			float f = texture(tex2).r;
			float fw = fwidth(f);
			f = smoothstep(.5-fw, .5+fw, f);
			f = texture().r * f;
			_out.r = pow(f,3.0);
			`, {
				releaseFirstInputTex: true
			});
		if(releaseFirstInputTex) {
			this.compute.willNoLongerUse(inTex);
		}
		return state;
	}

	zeroOutBorders(tex: TextureWrapper, releaseFirstInputTex: boolean): TextureWrapper {
		return this.compute.run([tex], `
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
}
