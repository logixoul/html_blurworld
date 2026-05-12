import * as THREE from 'three';
import GUI from 'lil-gui';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { RGBE, RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import * as GpuCompute from './GpuCompute';
import { ImageProcessor } from './ImageProcessor';
import { globals } from './Globals.js';
import { Input } from './Input';
import { Image } from "./Image";
import { FramerateCounter } from "./FramerateCounter";
import { PresentationForIashu } from './presentationForIashu';
import { PoissonSolverViaGaussians } from './PoissonSolver';

class Config {
	pretty = true;
}

export class App {
	private backgroundPicTex!: GpuCompute.TextureWrapper;
	private assetsLoaded: boolean = false;
	private backgroundPicTexOrig: GpuCompute.TextureWrapper;
	private framerateCounter: FramerateCounter;
	private limitFramerateCheckbox: HTMLInputElement;
	private compute : GpuCompute.GpuComputeContext;
	private imageProcessor : ImageProcessor;
	private input : Input;
	#renderer : THREE.WebGLRenderer;
	private windowEquirectangularEnvmap! : THREE.Texture;
	private windowDiffuseEquirectangularEnvmap!: THREE.Texture;
	private framesElapsed : number = 0;
	private config = new Config();

	constructor() {
		const gui = new GUI();
		gui.add(this.config, "pretty ");

		this.#renderer = new THREE.WebGLRenderer();
		document.body.appendChild( this.#renderer.domElement );

		this.input = new Input(this.#renderer);

		this.compute = new GpuCompute.GpuComputeContext(this.#renderer);
		this.setGlobalUniforms();
		this.imageProcessor = new ImageProcessor(this.compute);
		this.backgroundPicTexOrig = new GpuCompute.TextureWrapper(new THREE.TextureLoader().load(
			`${import.meta.env.BASE_URL}assets/background.jpg`,
			() => {
				this.backgroundPicTex = this.compute.run([this.backgroundPicTexOrig], `
				_out.rgb = texture().rgb;
				_out.rgb = exp(_out.rgb*1.12)-vec3(1.0);
				//_out.rgb /= 1.0 - 0.99*_out.rgb;
				_out.rgb = pow(_out.rgb, vec3(2.2));
				`, {
					releaseFirstInputTex: false, // todo: fix memory leak
					itype: THREE.FloatType,
					mipmaps: true
				});
				this.backgroundPicTex.get().wrapS = this.backgroundPicTex.get().wrapT = THREE.RepeatWrapping;

				new RGBELoader().load( `${import.meta.env.BASE_URL}assets/Untitled.hdr`, ( texture ) =>{
					texture.minFilter = texture.magFilter = THREE.LinearFilter;
					texture.generateMipmaps = false;

					this.windowEquirectangularEnvmap = texture;

					new RGBELoader().load(`${import.meta.env.BASE_URL}assets/window-blurred.hdr`, (texture) => {
						texture.minFilter = texture.magFilter = THREE.LinearFilter;
						texture.generateMipmaps = false;

						this.windowDiffuseEquirectangularEnvmap = texture;
						this.assetsLoaded = true;
					});
				});
			}
		));

		this.onResize();

		document.getElementById("loadingScreen")!.style.display = "none";

		if (window.location.hostname !== "localhost") {
			document.getElementById("framerate")!.style.display = "none";
		}
		new PresentationForIashu(this.#renderer, this.compute);

		document.defaultView!.addEventListener("resize", this.onResize);
		this.framerateCounter = new FramerateCounter();
		this.limitFramerateCheckbox = document.getElementById("limitFramerate")! as HTMLInputElement;

		requestAnimationFrame(this.animate);
	}

	private createStateTex() {
		const documentW = window.innerWidth;
		const documentH = window.innerHeight;
		globals.scale = Math.sqrt( (300*300) / (documentW * documentH) );
		//globals.scale = 1.0;
		//globals.scale = 0.12;
		console.log("scale=", globals.scale);
		//globals.scale = 0.5;
		
		const img = new Image<Float32Array>(
			Math.trunc(documentW*globals.scale), Math.trunc(documentH*globals.scale),
			Float32Array);
			//Uint8Array);

		img.forEach((x : number, y : number) => img.set(x, y, Math.random()));

		let stateTex = new GpuCompute.TextureWrapper(new THREE.DataTexture(img.data, img.width, img.height, THREE.RedFormat,
				THREE.FloatType));
				//THREE.UnsignedByteType);
		stateTex.get().generateMipmaps = false;
		stateTex.get().minFilter = THREE.LinearFilter;
		stateTex.get().magFilter = THREE.LinearFilter;
		stateTex.get().needsUpdate = true;

		stateTex = this.compute.run([stateTex],
			`_out.r = texture().r;`, { itype:
				//THREE.UnsignedByteType,
				//THREE.HalfFloatType,
				THREE.FloatType,
			releaseFirstInputTex: true });
		return stateTex;
	}

	private onResize = () => {
		globals.stateTex0 = this.createStateTex();
		//globals.stateTex1 = this.createStateTex();
		this.#renderer.setSize( window.innerWidth, window.innerHeight );
	};

	private doSimulationStep(inTex : GpuCompute.TextureWrapper, releaseFirstInputTex : boolean) {
		let state : GpuCompute.TextureWrapper = this.imageProcessor.zeroOutBorders(inTex, /*releaseFirstInputTex=*/ releaseFirstInputTex);
		//state = this.imageProcessor.fastBlur(state, /*releaseFirstInputTex=*/ true);
		for(let i=0;i<1;i++) {
			state = this.imageProcessor.blur(state, 1.0, 1.0, /*releaseFirstInputTex=*/ true);
		state = this.compute.run([state], `
			float f = texture().r;
			//float fw = fwidth(f)*4.0;
			//f = smoothstep(.5-fw, .5+fw, f);
			f = linearstep(0.1, 0.9, f);
			//f = minus200Derivative(f);
			_out.r = f;
			`, {
				releaseFirstInputTex: true,
				functions: `
				float linearstep(float edge0, float edge1, float x) {
					return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
				}
				// funky effect copied from an old C# implementation
				float minus200Derivative(float f) {
					const float sharpenDerivative = -10.0;
					float k = sharpenDerivative;
					float _2KMinus2 = 2.0*k-2.0;
					float _3KMinus3 = 3.0*k-3.0;
					//if(f>=0.0 && f<=1.0)
						return ((_2KMinus2*f - _3KMinus3)*f + k) * f;
					//else
					//	return f;
				}
				`
			});
		}
		return state;
	}
	private make3d_v2_cyberpunk(heightmap: GpuCompute.TextureWrapper, albedo: THREE.Vector3, options?: any) {
		options = options || {};

		heightmap = this.compute.run([heightmap], `
			float f = texture().r;
			//f = pow(f, 2.0)+f;
			_out.r = f * 40.0;
			`, { releaseFirstInputTex: true });
		let tex3d = this.compute.run([heightmap], `
			const float M_PI = 3.14159265358;
			float here = texture().r;
			vec2 d = vec2(
				here - texture(tc - vec2(texelSize1.x, 0)).r,
				here - texture(tc - vec2(0, texelSize1.y)).r
				);

			float polarAngle = atan(d.y, d.x);
			float polarAngle01 = (polarAngle/M_PI)*.5 + .5;

			//_out.rgb = vec3(.1);
			vec3 normal = normalize(vec3(d.x, d.y, 1.0));
			vec3 viewDir = vec3(0.0, 0.0, 1.0);
			float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);
			float fresnelWeight = mix(0.01, 1.0, fresnel);

			vec3 refl = reflect(-viewDir, normal);
			vec2 envUv = calcEnvmapTexCoords(refl);

			// battle jaggies caused by the normal map being very high frequency
			vec2 tcOffset = d / 5.0;
			float tcOffsetLen = length(tcOffset);
			float tcOffsetLenNew = pow(tcOffsetLen+1.0, 0.9)-1.0;
			tcOffset *= tcOffsetLenNew / tcOffsetLen;

			vec3 refractedRgb = texture(background, tc + d/5.0).rgb;
			_out.rgb = refractedRgb;

			if(here > 0.0) {
				_out.rgb *= exp(-here*0.05);
				float heightStep = mySmoothstep(7.0, here) - mySmoothstep(12.0, here);
				//heightStep = 1.0 - heightStep;
				//float dAbs = length(d)*10.0;
				//float heightStep = mySmoothstep(5.0, dAbs);
				
				//float tPulse = 10.0*exp(-mod(t, 100.0)/100.0);
				float tPulse = 10.0;
				
				//_out.rgb = applyGlow(_out.rgb, vec3(0.0), polarAngle01, 0.1, 0.33, heightStep);
				_out.rgb = applyGlow(_out.rgb, vec3(11.0, 0.2, 0.1)*tPulse, polarAngle01, 0.1, 0.13, heightStep);
				_out.rgb = applyGlow(_out.rgb, vec3(11.0, 0.4, 0.1).bgr*tPulse, polarAngle01, 0.3, 0.33, heightStep);

				//_out.rgb = texture(tex2).rgb;//vec3(0,.2,.5);
				vec2 specular = max(vec2(-d-.1), vec2(0.0f)) + vec2(.9);
				vec2 fwD = fwidth(d);

				vec2 specThresHi = vec2(0.1);
				specular *= vec2(1.0)-smoothstep(specThresHi - fwD/2.0, specThresHi + fwD/2.0, d);
				vec2 specThresLo = vec2(0.001);
				specular *= vec2(1.0)-smoothstep(specThresLo - fwD/2.0, specThresLo + fwD/2.0, d);
				vec3 specularRgb = vec3(specular.y + specular.x);
				_out.rgb += specularRgb * fresnelWeight;
			}
			`, {
			releaseFirstInputTex: options.releaseFirstInputTex ?? false,
			iformat: THREE.RGBAFormat,
			itype: THREE.FloatType,
			uniforms: { background: this.backgroundPicTex.get() },
			functions: `
				float mySmoothstep(float thres, float val) {
					float fw = fwidth(val);
					return smoothstep(thres - fw, thres + fw, val);
				}
				vec3 hsvToRgb(vec3 c) {
					vec3 rgb = clamp(
						abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0,
						0.0,
						1.0
					);

					return c.z * mix(vec3(1.0), rgb, c.y);
				}
				vec3 applyGlow(vec3 oldColor, vec3 glowColor, float polarAngle01, float hueRangeMin, float hueRangeMax, float heightStep) {
					float fw = fwidth(polarAngle01);
					float glowAmount =
						smoothstep(hueRangeMin-fw, hueRangeMin+fw, polarAngle01)
						- smoothstep(hueRangeMax-fw, hueRangeMax+fw, polarAngle01);
					glowAmount *= heightStep;
					//polarAngle01 = (polarAngle01 - hueRangeMin) / (hueRangeMax - hueRangeMin);
					//glowColor = hsvToRgb(vec3(polarAngle01*mouse.x+mouse.y, 1.0, 1.0)) * 10.0;
					return oldColor+glowColor*glowAmount;//mix(oldColor, glowColor, glowAmount);
				}
				const float PI = 3.14159265358979323846;
				vec2 calcEnvmapTexCoords(vec3 v) {
					return vec2(atan(v.z, v.x) / (2.0 * PI) + 0.5, asin(clamp(v.y, -1.0, 1.0)) / PI + 0.5);
				}
				`
		});
		return tex3d;
	}
	
	private normalizeGradients(heightmap: GpuCompute.TextureWrapper) : GpuCompute.TextureWrapper {
		let texturesToRelease: GpuCompute.TextureWrapper[] = [];

		const gradForward = this.imageProcessor.gradientForward(heightmap, false);
		texturesToRelease.push(gradForward);
		const gradCompressed = this.compute.run([gradForward], `
			vec2 gradForward = texture().xy;
			float mag = length(gradForward);

			//float magComp = pow(mag, strength);
			const float magComp = 1.0;
			_out.xy = gradForward * (magComp / (mag+1e-4));
			`, {
				releaseFirstInputTex: false,
				uniforms: {
					strength: this.input.mousePos ? this.input.mousePos.x / window.innerWidth : 0.0,
				}
			}
		);
		texturesToRelease.push(gradCompressed);
		const gradCompressedDivergence = this.imageProcessor.divBackward(gradCompressed,
			false
		);
		texturesToRelease.push(gradCompressedDivergence);
		const poissonSolver = new PoissonSolverViaGaussians(this.compute, this.#renderer);

		const solution = poissonSolver.run(gradCompressedDivergence, false);
		texturesToRelease.push(solution);
		const solution01 = this.imageProcessor.to01(this.#renderer, solution, false);
		//texturesToRelease.push(solution01);

		texturesToRelease.forEach(t => this.compute.willNoLongerUse(t));

		return solution01;
	}

	maskTex(tex1: GpuCompute.TextureWrapper, tex2: GpuCompute.TextureWrapper, releaseFirstInputTex: boolean) : GpuCompute.TextureWrapper {
		return this.compute.run([tex1, tex2], `
				float f = texture(tex1).r;
				f *= texture(tex2).r;
				_out.r = f;
				`, {
			releaseFirstInputTex: releaseFirstInputTex,
		}
		);
	}

	private setGlobalUniforms() {
		let mousePos = this.input.mousePos;
		if(typeof mousePos == "undefined")
			mousePos = new THREE.Vector2(0, 0); // this is normally harmless
		mousePos = mousePos.clone();
		mousePos.divide(new THREE.Vector2(window.innerWidth, window.innerHeight));
		//console.log("mousePos=", mousePos)
		this.compute.setGlobalUniform("mouse", mousePos);
		this.compute.setGlobalUniform("t", this.framesElapsed);
	}

	private animate = (now: DOMHighResTimeStamp) => {
		this.setGlobalUniforms();
		
		this.framerateCounter.update(now);
		if (this.limitFramerateCheckbox.checked)
			setTimeout(this.animate, 1000);
		else
			requestAnimationFrame(this.animate);
		
		if (!this.assetsLoaded)
			return;
		globals.stateTex0 = this.doSimulationStep(globals.stateTex0, /*releaseFirstInputTex=*/ true);
		//globals.stateTex1 = stateTex1Shrunken;


		
		if (this.config.pretty) {
			const toDraw = this.doPrettyPostprocessing(globals.stateTex0);
			this.compute.drawToScreen(toDraw);
			this.compute.willNoLongerUse(toDraw);
		} else {
			const toDraw = this.doBasicPostprocessing();

			this.compute.drawToScreen(toDraw);
			this.compute.willNoLongerUse(toDraw);

		}

		this.framesElapsed++;
	};

	private doBasicPostprocessing() {
		return this.compute.run([globals.stateTex0], `
				float f = 1.0 - texture().r;
				float fw = fwidth(f);
				f = smoothstep(0.5-fw, 0.5+fw, f);
				_out.rgb = vec3(f);
				`, {
			releaseFirstInputTex: false,
			iformat: THREE.RGBAFormat,
			resultSize: new THREE.Vector2(window.innerWidth, window.innerHeight)
		});
	}

	doPrettyPostprocessing(tex: GpuCompute.TextureWrapper) : GpuCompute.TextureWrapper {
		const texturesToRelease: GpuCompute.TextureWrapper[] = [];


		const iters = 14;

		var extruded0 = this.imageProcessor.extrude(globals.stateTex0, iters, globals.scale, /*releaseFirstInputTex=*/ false);
		//texturesToRelease.push(extruded0);
		/*extruded0 = this.normalizeGradients(extruded0);
		texturesToRelease.push(extruded0);
		extruded0 = this.maskTex(extruded0, globals.stateTex0, false);
		//texturesToRelease.push(extruded0);
*/

		//extruded0 = this.imageProcessor.mul(extruded0, this.input.mousePos!.x / window.innerWidth, true);
		let tex3d_0 = this.make3d_v2_cyberpunk(extruded0, new THREE.Vector3(0.9, 0.9, 0.9), { releaseFirstInputTex: true });
		texturesToRelease.push(tex3d_0);
		let tex3d = tex3d_0;
		let tex3dBlurState = this.compute.run([tex3d], `
			_out.rgb = texture().rgb;
			_out.rgb *= step(vec3(9.5), _out.rgb);
			`, {
			releaseFirstInputTex: false
		}
		);
		let tex3dBlurCollected = this.compute.run([tex3dBlurState], `
			_out.rgb = vec3(0.0); // zero it out
			`, {
			releaseFirstInputTex: false
		});
		for (let i = 0; i < 6; i++) {
			//tex3dBlurState = this.imageProcessor.scale(tex3dBlurState, 0.5, true);
			tex3dBlurState = this.imageProcessor.blur(tex3dBlurState, 1.0, 0.5, true);
			tex3dBlurCollected = this.compute.run([tex3dBlurCollected, tex3dBlurState], `
				_out.rgb = texture(tex1).rgb + texture(tex2).rgb * weight;
				`, {
				releaseFirstInputTex: true,
				uniforms: {
					weight: 0.1//1.0 / (i*1.5+.5)
				}
			});
		}
		texturesToRelease.push(tex3dBlurState);
		texturesToRelease.push(tex3dBlurCollected);
		let tex3dBloom = this.compute.run([tex3d, tex3dBlurCollected], `
			vec3 col = texture(tex1).rgb;
			vec3 bloom = texture(tex2).rgb;
			_out.rgb = col + bloom*1.0;
			//_out.rgb *= .5;
			//_out.rgb = Uncharted2Tonemap(_out.rgb);
			_out.rgb = _out.rgb / (_out.rgb + vec3(1.0)); // tone mapping
			//_out.rgb = smoothstep(vec3(0.0), vec3(1.0), _out.rgb); // contrast boost
			_out.rgb = pow(_out.rgb, vec3(1.0/2.2)); // gamma correction
			`, {
			releaseFirstInputTex: false,
			functions: `
					const float whitePoint = 11.2;
					// http://filmicworlds.com/blog/filmic-tonemapping-operators/
					vec3 Uncharted2Tonemap(vec3 color) {
						// Filmic tonemapping curve (from Uncharted 2)
						const float A = 0.15;
						const float B = 0.50;
						const float C = 0.10;
						const float D = 0.20;
						const float E = 0.02;
						const float F = 0.30;
						return (color * (A * color + C * B) + D * E) / (color * (A * color + B) + D * F);
					}
				`
		});
		texturesToRelease.forEach(t => this.compute.willNoLongerUse(t));
		return tex3dBloom;
	}
}

new App();
