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


	fastBlur(tex: TextureWrapper, releaseFirstInputTex: boolean, scale: number = 1.0, outputInternalType? : THREE.TextureDataType): TextureWrapper {
		return this.compute.run([tex], `
			float sum = texture().r;
			sum += texture(tex0, tc + vec2(texelSize0.x, 0)).r;
			sum += texture(tex0, tc + vec2(0, texelSize0.y)).r;
			sum += texture(tex0, tc + texelSize0).r;

			_out.r = sum / 4.0f;
			`
			, {
				releaseFirstInputTex: releaseFirstInputTex,
				vshaderExtra: `tc -= texelSize0 / 2.0;`,
				scale: new THREE.Vector2(scale, scale),
				itype: outputInternalType
			}
		);
	}

	// strength is in [0, 1]
	fastBlurWithStrength(tex: TextureWrapper, releaseFirstInputTex: boolean, strength: number): TextureWrapper {
		return this.compute.run([tex], `
			float sum = float(0.0);
			float here = texture(tex0, tc + texelSize0 * vec2(.5, .5)).r;
			sum += here;
			sum += texture().r;
			sum += texture(tex0, tc + texelSize0 * vec2(1, 0)).r;
			sum += texture(tex0, tc + texelSize0 * vec2(0, 1)).r;
			sum += texture(tex0, tc + texelSize0 * vec2(1, 1)).r;

			_out.r = mix(here, sum / 5.0f, strength);
			`
			, {
				releaseFirstInputTex: releaseFirstInputTex,
				vshaderExtra: `tc -= texelSize0 / 2.0;`,
				uniforms: {
					strength: strength
				}
			}
		);
	}
	
		// strength is in [0, 1]
	blur_singlePass(tex: TextureWrapper, releaseFirstInputTex: boolean): TextureWrapper {
		return this.compute.run([tex], `
			const float weights1D[7] = float[](
				0.05000696,
				0.12112802,
				0.20595537,
				0.24581929,
				0.20595537,
				0.12112802,
				0.05000696 );
			float sum = float(0.0);
			for(int x = -3; x <= 3; x++) {
				for(int y = -3; y <= 3; y++) {
					ivec2 xy = ivec2(x, y);
					sum += texture(tex0, tc + texelSize0 * vec2(xy)).r * weights1D[x+3] * weights1D[y+3];
				}
			}
			_out.r = sum;
			`
			, {
				releaseFirstInputTex: releaseFirstInputTex,
				vshaderExtra: `tc -= texelSize0 / 2.0;`
			}
		);
	}

	blur(tex: TextureWrapper, width: number, scaleArg: number, releaseFirstInputTex: boolean): TextureWrapper {
		let tex1 = this.compute.run([tex], `
			float offset[3] = float[](0.0, 1.3846153846, 3.2307692308);
			float weight[3] = float[](0.2270270270, 0.3162162162, 0.0702702703);
			_out = texture() * weight[0];
			for (int i=1; i<3; i++) {
				_out +=
					texture(tc + vec2(0.0, offset[i]) * texelSize0 * width)
						* weight[i];
				_out +=
					texture(tc - vec2(0.0, offset[i]) * texelSize0 * width)
						* weight[i];
			}
			`
			, {
				uniforms: { width: width },
				releaseFirstInputTex: releaseFirstInputTex,
				scale: new THREE.Vector2(1.0, scaleArg)
			}
		);
		tex1 = this.compute.run([tex1], `
			float offset[3] = float[](0.0, 1.3846153846, 3.2307692308);
			float weight[3] = float[](0.2270270270, 0.3162162162, 0.0702702703);
			_out = texture(tex0, tc) * weight[0];
			for (int i=1; i<3; i++) {
				_out +=
					texture(tex0, tc + vec2(offset[i], 0.0) * texelSize0 * width)
						* weight[i];
				_out +=
					texture(tex0, tc - vec2(offset[i], 0.0) * texelSize0 * width)
						* weight[i];
			}
		`
		, {
			uniforms: { width: width },
			releaseFirstInputTex: true,
			scale: new THREE.Vector2(scaleArg, 1.0)
		}
		);
		return tex1;
	}

	extrude_oneIteration(state: TextureWrapper, inTex: TextureWrapper, releaseFirstInputTex: boolean, i : number): TextureWrapper {
		let blurred = this.blur(state, 1.0, 0.5, false);
		//let blurred = this.blur_singlePass(state, false);

		//let blurred = this.fastBlurWithStrength(state, false, 1.0);
		//blurred = this.fastBlurWithStrength(blurred, true, 1.0);
		//let blurred = this.fastBlur(state, false, 1.0, THREE.FloatType);
		const stateLocal = this.compute.run([inTex], `
			float blurred = texture(blurredTex).r;
			float binary = texture(tex0).r;
			//float state = mix(blurred, blurred * binary, 0.5);
			float stateLocal = blurred;
			stateLocal += binary;
			stateLocal *= binary;
			_out.r = stateLocal;`
			, {
				releaseFirstInputTex: false,
				uniforms: {
					blurredTex: blurred.get()
				},
				itype: THREE.FloatType
			}
			);
		this.compute.willNoLongerUse(blurred);
		if(releaseFirstInputTex) {
			this.compute.willNoLongerUse(state);
		}
		return stateLocal;
	}

	scale(inTex: TextureWrapper, scale: number, releaseFirstInputTex: boolean): TextureWrapper {
		// upscale
		const state = this.compute.run([inTex], `
			_out.rgb = texture().rgb;
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
			state = this.extrude_oneIteration(state, inTex, /*releaseFirstInputTex=*/ true, i/iters);
		}
		state = this.mul(state, 1.0/iters, true);
		state.magFilter = THREE.LinearFilter;
		//state = scale(state, 1.0/scaleArg, true);
		
		// blur to fix upscale-artefacts
		// extra blurs to make sure edges are smooth
		state = this.blur(state, 1.0, 1.0/scaleArg, true);
		state = this.blur(state, 1.0, 1.0, true);
		//state = fastBlur(state, true);
		
		// make edges sharp again
		state = this.compute.run([state, inTex], `
			float f = texture(tex1).r;
			float fw = fwidth(f);
			f = smoothstep(.5-fw/2.0, .5+fw/2.0, f);
			f = texture().r * f;
			_out.r = f;
			//_out.r = texture().r;
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
			ivec2 maxCoords = textureSize(tex0, 0) - ivec2(1, 1);
			if(fc.x == 0 || fc.y == 0 || fc.x == maxCoords.x || fc.y == maxCoords.y) f = 0.0f;
			_out.r = f;
			`, {
				releaseFirstInputTex: releaseFirstInputTex
			}
		);
	}
}
