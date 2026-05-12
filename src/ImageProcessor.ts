import * as THREE from 'three';
import { GpuComputeContext, TextureWrapper } from "./GpuCompute";

export function downloadGpuData(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
	const width = target.width;
	const height = target.height;
	if (width === 0 || height === 0) {
		return [0, 0];
	}

	const format = target.texture.format;
	let components = 4;
	switch (format) {
		case THREE.RedFormat:
		case THREE.RedIntegerFormat:
			components = 1;
			break;
		case THREE.RGFormat:
		case THREE.RGIntegerFormat:
			components = 2;
			break;
		case THREE.RGBFormat:
		case THREE.RGBIntegerFormat:
			components = 3;
			break;
		case THREE.RGBAFormat:
		case THREE.RGBAIntegerFormat:
		default:
			components = 4;
			break;
	}

	const size = width * height * components;
	const type = target.texture.type;
	const data = (type === THREE.FloatType)
		? new Float32Array(size)
		: new Uint8Array(size);

	renderer.readRenderTargetPixels(target, 0, 0, width, height, data);
	return data;
}

export function getRange(data: number[] | Float32Array | Uint8Array): [number, number] {
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (let i = 0; i < data.length; i++) {
		const v = data[i];
		if (v < min) min = v;
		if (v > max) max = v;
	}

	return [min, max];
};

export function getMean(data: number[] | Float32Array | Uint8Array): number {
	let sum = 0.0;
	for (let i = 0; i < data.length; i++) {
		sum += data[i];
	}

	return sum / data.length;
}; 

export function vectorScaledCeiled(v: THREE.Vector2, scale: number): THREE.Vector2 {
	var size = v.clone();
	size = size.multiplyScalar(scale);
	size.x = Math.ceil(size.x);
	size.y = Math.ceil(size.y);
	return size;
}

export class ImageProcessor {
	private compute: GpuComputeContext;

	constructor(compute: GpuComputeContext) {
		this.compute = compute;
	}

	to01(renderer: THREE.WebGLRenderer, tex: TextureWrapper, releaseFirstInputTex: boolean) {
		if(tex.get().type != THREE.FloatType) {
			tex = this.compute.run([tex], `_out.rgb = texture().rgb;`, {
				itype: THREE.FloatType,
				releaseFirstInputTex: releaseFirstInputTex
			})!;
		}
		const [min, max] = getRange(downloadGpuData(renderer, tex.getRenderTarget()));
		console.log("to01 min=", min, "max=", max);
		return this.compute.run([tex], `
			_out.rgb = (texture().rgb-vec3(min_))/vec3(max_-min_);`, {
			releaseFirstInputTex: true,
			uniforms: {
				min_: min,
				max_: max
			}
		})
	}

	gradientForward(tex: TextureWrapper, releaseFirstInputTex: boolean): TextureWrapper {
		return this.compute.run([tex], `
			float here = texture().r;
			float dx = texture(tex1, tc + vec2(texelSize1.x, 0)).r - here;
			float dy = texture(tex1, tc + vec2(0, texelSize1.y)).r - here;

			_out.rg = vec2(dx, dy);
			`
			, {
				releaseFirstInputTex: releaseFirstInputTex,
				iformat: THREE.RGBAFormat
			}
		);
	}

	gradientCentral(tex: TextureWrapper, releaseFirstInputTex: boolean): TextureWrapper {
		return this.compute.run([tex], `
			float here = texture().r;
			float left = texture(tex1, tc + vec2(texelSize1.x, 0)).r;
			float right = texture(tex1, tc - vec2(texelSize1.x, 0)).r;
			float top = texture(tex1, tc + vec2(0, texelSize1.y)).r;
			float bottom = texture(tex1, tc - vec2(0, texelSize1.y)).r;
			float dx = (left - right) * 0.5;
			float dy = (top - bottom) * 0.5;

			_out.rg = vec2(dx, dy);
			`
			, {
				releaseFirstInputTex: releaseFirstInputTex,
				iformat: THREE.RGBAFormat
			}
		);
	}

	to01_cut(renderer: THREE.WebGLRenderer, tex: TextureWrapper, bottomPercentile: number, topPercentile: number, releaseFirstInputTex: boolean) {
		/*const texDownsampledMonochrome = this.compute.run(tex, `
			_out.r = dot(texture().rgb, vec3(0.2126, 0.7152, 0.0722));
			`,
			{
				releaseFirstInputTex: false,
				resultSize: vectorScaledCeiled(tex.size, .5),
				iformat: THREE.RedFormat
			});
		let data = downloadGpuData(renderer, texDownsampledMonochrome.getRenderTarget());
		this.compute.willNoLongerUse(texDownsampledMonochrome);*/
		//const texDownsampled = this.scale(tex, .025, false);
		const texDownsampledFloat32 = this.compute.run([tex], `_out.rgb=texture().rgb;`,
			{
				itype: THREE.FloatType, resultSize: vectorScaledCeiled(tex.size, 0.025)
				, releaseFirstInputTex: false
			}
		);

		const numPixels = texDownsampledFloat32.width * texDownsampledFloat32.height;
		const numChannels = tex.get().format == THREE.RGBAFormat ? 3 : 1;
		let data = downloadGpuData(renderer, texDownsampledFloat32.getRenderTarget());
		this.compute.willNoLongerUse(texDownsampledFloat32)

		if (tex.get().format == THREE.RGBAFormat) {
			const dataWithoutAlpha = new Float32Array(numPixels * numChannels);
			for (let pixelIndex = 0; pixelIndex < data.length / 4; pixelIndex++) {
				for (let compIndex = 0; compIndex < 3; compIndex++) {
					dataWithoutAlpha[pixelIndex * 3 + compIndex] = data[pixelIndex * 4 + compIndex];
				}
			}
			data = dataWithoutAlpha;
		}

		const histogram: number[] = new Array<number>(2048).fill(0);
		const [min, max] = getRange(data);

		for (const pixel of data) {
			let pixelNormalized = (pixel - min) / (max - min);
			pixelNormalized = Math.max(0, Math.min(1, pixelNormalized)); // guard against slight numerical error
			const indexInHistogram = Math.floor(pixelNormalized * (histogram.length - 1));
			histogram[indexInHistogram]++;
		}
		const total = histogram.reduce((a, b) => a + b, 0);
		const percentileFromHistogram = (p: number) => {
			// target count in [0, total]
			const target = (p / 100) * total;

			let cum = 0;
			for (let i = 0; i < histogram.length; i++) {
				const c = histogram[i];
				if (c === 0) continue;

				const next = cum + c;
				if (target <= next) {
					const inBin = target - cum;     // 0..c
					const frac = inBin / c;         // 0..1
					const binPos = (i + frac) / (histogram.length - 1); // 0..1 across histogram
					return min + binPos * (max - min);
				}
				cum = next;
			}
			return max;
		};
		const minCut = percentileFromHistogram(bottomPercentile);
		const maxCut = percentileFromHistogram(topPercentile);
		/*const sortedData = data.sort()
		const min = sortedData[Math.floor(sortedData.length/100)];
		const max = sortedData[Math.floor(sortedData.length*99/100)];*/

		//console.log("min=", min, "max=", max);
		return this.compute.run([tex], `
			_out.rgb = (texture().rgb-vec3(min_))/vec3(max_-min_);
			_out.rgb = max(vec3(0.0), min(vec3(1.0), _out.rgb));
			`, {
			releaseFirstInputTex: releaseFirstInputTex,
			uniforms: {
				min_: minCut,
				max_: maxCut
			}
		})
	}

	divBackward(tex: TextureWrapper, releaseFirstInputTex: boolean): TextureWrapper {
		return this.compute.run([tex], `
			vec2 here = texture().xy;
			float dx = here.x - texture(tex1, tc - vec2(texelSize1.x, 0)).x;
			float dy = here.y - texture(tex1, tc - vec2(0, texelSize1.y)).y;
			if(gl_FragCoord.x < 1.0)
				dx=here.x;
			if(gl_FragCoord.y < 1.0)
				dy=here.y;
			

			_out.r = dx + dy;
			`
			, {
				releaseFirstInputTex: releaseFirstInputTex,
				iformat: THREE.RedFormat
			}
		);
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
			sum += texture(tex1, tc + vec2(texelSize1.x, 0)).r;
			sum += texture(tex1, tc + vec2(0, texelSize1.y)).r;
			sum += texture(tex1, tc + texelSize1).r;

			_out.r = sum / 4.0f;
			`
			, {
				releaseFirstInputTex: releaseFirstInputTex,
				vshaderExtra: `tc -= texelSize1 / 2.0;`,
				resultSize: vectorScaledCeiled(tex.size, scale),
				itype: outputInternalType
			}
		);
	}

	// strength is in [0, 1]
	fastBlurWithStrength(tex: TextureWrapper, releaseFirstInputTex: boolean, strength: number): TextureWrapper {
		return this.compute.run([tex], `
			float sum = float(0.0);
			float here = texture(tex1, tc + texelSize1 * vec2(.5, .5)).r;
			sum += here;
			sum += texture().r;
			sum += texture(tex1, tc + texelSize1 * vec2(1, 0)).r;
			sum += texture(tex1, tc + texelSize1 * vec2(0, 1)).r;
			sum += texture(tex1, tc + texelSize1 * vec2(1, 1)).r;

			_out.r = mix(here, sum / 5.0f, strength);
			`
			, {
				releaseFirstInputTex: releaseFirstInputTex,
				vshaderExtra: `tc -= texelSize1 / 2.0;`,
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
					sum += texture(tex1, tc + texelSize1 * vec2(xy)).r * weights1D[x+3] * weights1D[y+3];
				}
			}
			_out.r = sum;
			`
			, {
				releaseFirstInputTex: releaseFirstInputTex,
				vshaderExtra: `tc -= texelSize1 / 2.0;`
			}
		);
	}

	blur(tex: TextureWrapper, width: number, scaleArg: number, releaseFirstInputTex: boolean): TextureWrapper {
		let tex2 = this.compute.run([tex], `
			float offset[3] = float[](0.0, 1.3846153846, 3.2307692308);
			float weight[3] = float[](0.2270270270, 0.3162162162, 0.0702702703);
			_out = texture() * weight[0];
			for (int i=1; i<3; i++) {
				_out +=
					texture(tc + vec2(0.0, offset[i]) * texelSize1 * width)
						* weight[i];
				_out +=
					texture(tc - vec2(0.0, offset[i]) * texelSize1 * width)
						* weight[i];
			}
			`
			, {
				uniforms: { width: width },
				releaseFirstInputTex: releaseFirstInputTex,
				resultSize: new THREE.Vector2(tex.width, Math.ceil(scaleArg * tex.height))
			}
		);
		tex2 = this.compute.run([tex2], `
			float offset[3] = float[](0.0, 1.3846153846, 3.2307692308);
			float weight[3] = float[](0.2270270270, 0.3162162162, 0.0702702703);
			_out = texture(tex1, tc) * weight[0];
			for (int i=1; i<3; i++) {
				_out +=
					texture(tex1, tc + vec2(offset[i], 0.0) * texelSize1 * width)
						* weight[i];
				_out +=
					texture(tex1, tc - vec2(offset[i], 0.0) * texelSize1 * width)
						* weight[i];
			}
		`
		, {
			uniforms: { width: width },
			releaseFirstInputTex: true,
			resultSize: new THREE.Vector2(Math.ceil(scaleArg * tex.width), tex2.height)
		}
		);
		return tex2;
	}

	extrude_oneIteration(state: TextureWrapper, inTex: TextureWrapper, releaseFirstInputTex: boolean, i : number): TextureWrapper {
		let blurred = this.blur(state, 2.0, 0.5, false);
		//let blurred = this.blur_singlePass(state, false);

		//let blurred = this.fastBlurWithStrength(state, false, 1.0);
		//blurred = this.fastBlurWithStrength(blurred, true, 1.0);
		//let blurred = this.fastBlur(state, false, 1.0, THREE.FloatType);
		const stateLocal = this.compute.run([inTex], `
			float blurred = texture(blurredTex).r;
			float binary = texture(tex1).r;
			float state = mix(blurred, blurred * binary, 1.0);
			//blurred *= binary;
			//float state = binary+blurred;
			_out.r = state;`
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
				resultSize: vectorScaledCeiled(inTex.size, scale),
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
		//state = this.mul(state, 1.0/iters, true);
		state.magFilter = THREE.LinearFilter;
		//state = scale(state, 1.0/scaleArg, true);
		
		// blur to fix upscale-artefacts
		// extra blurs to make sure edges are smooth
		state = this.blur(state, 1.0, 1.0/scaleArg, true);
		state = this.blur(state, 1.0, 1.0, true);
		//state = fastBlur(state, true);
		
		// make edges sharp again
		state = this.compute.run([state, inTex], `
			float f = texture(tex2).r;
			float fw = fwidth(f);
			f = smoothstep(.5-fw, .5+fw, f);
			f = texture().r * f;
			_out.r = pow(f,1.0);
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

	makeGaussianPyramid(inTex: TextureWrapper, releaseFirstInputTex: boolean) {
		let levels: TextureWrapper[] = [];
		let inTexLocal = this.cloneTex(inTex);
		levels.push(inTexLocal);
		while (Math.min(inTexLocal.width, inTexLocal.height) >= 2) {
			inTexLocal = this.gaussianBlur3x3(inTexLocal, vectorScaledCeiled(inTexLocal.size, .5), false);

			levels.push(inTexLocal);
		}
		//const idx = Math.floor(debugging.mousePosNormalized.x*(levels.length-1));
		//debugging.publish(this.mul(levels[idx], 10000.0, false), false);
		//console.log("publishing level ", idx);
		if (releaseFirstInputTex) {
			this.compute.willNoLongerUse(inTex);
		}
		return levels;
	}

	gaussianBlurSeparable(inTex: TextureWrapper, kernelDiameter: number, sigma: number, multiplier: number, releaseFirstInputTex: boolean): TextureWrapper {
		let radius = Math.max(0, Math.floor(kernelDiameter / 2));

		const weightsArrayX = this.getGaussianWeightsArrayString(sigma, radius, multiplier);
		const weightsArrayY = this.getGaussianWeightsArrayString(sigma, radius, 1.0);

		const passH = this.compute.run([inTex], `
			${weightsArrayX}
			ivec2 fc = ivec2(gl_FragCoord.xy);
			int start = max(fc.x - ${radius}, 0);
			int end = min(fc.x + ${radius}, textureSize(tex1, 0).x - 1);
			_out.r = 0.0;
			int wI = start - fc.x + ${radius};
			for (int i = start; i <= end; i++) {
				ivec2 fcNb = ivec2(i, fc.y);

				float s = texelFetch(tex1, fcNb, 0).r;
				_out.r += s * weights[wI];
				wI++;
			}
		`, {
			releaseFirstInputTex: false
		});

		const passV = this.compute.run([passH], `
			${weightsArrayY}
			ivec2 fc = ivec2(gl_FragCoord.xy);
			int start = max(fc.y - ${radius}, 0);
			int end = min(fc.y + ${radius}, textureSize(tex1, 0).y - 1);
			_out.r = 0.0;
			int wI = start - fc.y + ${radius};
			for (int i = start; i <= end; i++) {
				ivec2 fcNb = ivec2(fc.x, i);

				float s = texelFetch(tex1, fcNb, 0).r;
				_out.r += s * weights[wI];
				wI++;
			}
		`, {
			releaseFirstInputTex: true
		});
		if (releaseFirstInputTex) {
			this.compute.willNoLongerUse(inTex);
		}
		return passV;
	}

	private getGaussianWeightsArray(sigma: number, radius: number, multiplier: number) {
		const weights: number[] = [];
		let sum = 0.0;
		const sigma2 = sigma * sigma;
		if (sigma == 0.0) {
			weights.push(1.0);
			sum += 1.0;
		} else {
			for (let i = -radius; i <= radius; i++) {
				const w = Math.exp(-(i * i) / (2.0 * sigma2));
				weights.push(w);
				sum += w;
			}
		}
		for (let i = 0; i < weights.length; i++) {
			weights[i] /= sum;
			weights[i] *= multiplier;
		}
		return weights;
	}

	private getGaussianWeightsArrayString(sigma: number, radius: number, multiplier: number) {
		const ensureHasDecimalPoint = (v: number) => {
			if (Number.isInteger(v)) {
				return v.toFixed(1);
			}
			return v.toString();
		};

		const weights: number[] = this.getGaussianWeightsArray(sigma, radius, multiplier);
		const weightsLiteral = weights.map((w) => ensureHasDecimalPoint(w)).join(", ");
		const weightsArray = `const float weights[${weights.length}] = float[${weights.length}](${weightsLiteral});`;
		return weightsArray;
	}

	gaussianBlur3x3(inTex: TextureWrapper, resultSize: THREE.Vector2, releaseFirstInputTex: boolean): TextureWrapper {
		return this.compute.run([inTex], `
			vec2 t = texelSize1;
			float sum = texture(tex1, tc).r * 4.0;
			sum += texture(tex1, tc + vec2(-t.x, -t.y)).r;
			sum += texture(tex1, tc + vec2(0.0, -t.y)).r * 2.0;
			sum += texture(tex1, tc + vec2(t.x, -t.y)).r;
			sum += texture(tex1, tc + vec2(-t.x, 0.0)).r * 2.0;
			sum += texture(tex1, tc + vec2(t.x, 0.0)).r * 2.0;
			sum += texture(tex1, tc + vec2(-t.x, t.y)).r;
			sum += texture(tex1, tc + vec2(0.0, t.y)).r * 2.0;
			sum += texture(tex1, tc + vec2(t.x, t.y)).r;
			_out.r = sum * (1.0 / 16.0);
		`, {
			releaseFirstInputTex: releaseFirstInputTex,
			resultSize: resultSize
		});
	}
}
