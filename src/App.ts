import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { RGBE, RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import * as GpuCompute from './GpuCompute';
import { ImageProcessor } from './ImageProcessor';
import { globals } from './Globals.js';
import { Input } from './Input';
import { Image } from "./Image";
import { FramerateCounter } from "./FramerateCounter";
import { PresentationForIashu } from './presentationForIashu';

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

	constructor() {
		this.#renderer = new THREE.WebGLRenderer();
		document.body.appendChild( this.#renderer.domElement );

		this.input = new Input(this.#renderer);

		this.compute = new GpuCompute.GpuComputeContext(this.#renderer);
		this.setGlobalUniforms();
		this.imageProcessor = new ImageProcessor(this.compute);
		this.backgroundPicTexOrig = new GpuCompute.TextureWrapper(new THREE.TextureLoader().load(
			`${import.meta.env.BASE_URL}assets/milkyway.png`,
			() => {
				this.backgroundPicTex = this.compute.run([this.backgroundPicTexOrig], `
				_out.rgb = texture().rgb;
				_out.rgb /= 1.0 - 0.99*_out.rgb;
				//_out.rgb = pow(_out.rgb, vec3(2.2));
				`, {
					releaseFirstInputTex: false, // todo: fix memory leak
					itype: THREE.FloatType,
					mipmaps: true
				});
				new RGBELoader().load( `${import.meta.env.BASE_URL}assets/Untitled.hdr`, ( texture ) =>{
					texture.minFilter = texture.magFilter = THREE.NearestFilter;
					texture.generateMipmaps = false;
					//texture.magFilter = THREE.LinearFilter;
					//texture.minFilter = THREE.LinearMipmapLinearFilter;
					//texture.needsUpdate = true;
					//texture.mapping = THREE.EquirectangularReflectionMapping;

					this.windowEquirectangularEnvmap = texture;
					this.assetsLoaded = true;
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
		globals.scale = 0.12;
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
			state = this.imageProcessor.blur(state, .15, 1.0, /*releaseFirstInputTex=*/ true);
		state = this.compute.run([state], `
			float f = texture().r;
			//float fw = fwidth(f)*4.0;
			//f = smoothstep(.5-fw, .5+fw, f);
			f = linearstep(0.1, 0.9, f);

			_out.r = f;
			`, {
				releaseFirstInputTex: true,
				functions: `
				float linearstep(float edge0, float edge1, float x) {
					return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
				}
				`
			});
		}
		return state;
	}

	private make3d(heightmap: GpuCompute.TextureWrapper, albedo: THREE.Vector3, options?: any) {
		options = options || {};
		let tex3d = this.compute.run([heightmap], `
			float here = texture().r;
			vec2 d = vec2(
				here - texture(tc - vec2(tsize1.x, 0)).r,
				here - texture(tc - vec2(0, tsize1.y)).r
				) * 400.0;
			vec3 normal = normalize(vec3(d.x, d.y, 1.0));
			vec3 viewDir = vec3(0.0, 0.0, 1.0);
			vec3 refl = reflect(-viewDir, normal);
			vec2 res = vec2(1.0 / tsize1.x, 1.0 / tsize1.y);
			vec2 mouseUv = vec2(.8, .6);//mouse;
			float yaw = (mouseUv.x - 0.5) * PI * 2.0;
			float pitch = (0.5 - mouseUv.y) * PI;
			refl = rotateY(refl, yaw);
			refl = rotateX(refl, pitch);
			vec2 envUv = vec2(atan(refl.z, refl.x) / (2.0 * PI) + 0.5, asin(clamp(refl.y, -1.0, 1.0)) / PI + 0.5);
			float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);
			float fresnelWeight = mix(0.01, 1.0, fresnel);
			vec3 specularRgb = texture(envmap, envUv).rgb * fresnelWeight;
			
			float eta = 1.0 / 1.33; // air -> water-ish
			vec3 refracted = refract(viewDir, normal, eta);
			float z = max(abs(refracted.z), 1e-3);
			vec2 refractOffset = refracted.xy / z;
			vec2 refractUv = tc + refractOffset * .1;
			float lod = manualLod(refractUv, backgroundPicTexSize, refractOffset) + lodBias;
			lod = clamp(lod, 0.0, lodMax);
			_out.rgb = textureLod(backgroundPicTex, refractUv, lod).rgb * pow(albedo, vec3(here));
			if(here > 0.0)
				_out.rgb += specularRgb; // specular
			`, {
				releaseFirstInputTex: options.releaseFirstInputTex ?? false,
				iformat: THREE.RGBAFormat,
				itype: THREE.FloatType,
				functions: `
				const float PI = 3.14159265358979323846;
				float manualLod(vec2 uv, vec2 texSize, vec2 refractOffset) {
					vec2 uvPixels = uv * texSize;
					vec2 dx = dFdx(uvPixels);
					vec2 dy = dFdy(uvPixels);
					float rho = max(dot(dx, dx), dot(dy, dy));
					rho = max(rho, 1e-8);
					float lod = 0.5 * log2(rho);
					float refractMetric = length(dFdx(refractOffset)) + length(dFdy(refractOffset));
					lod += log2(1.0 + refractMetric * refractLodScale);
					float maxLod = floor(log2(max(texSize.x, texSize.y)));
					return clamp(lod, 0.0, maxLod);
				}
				vec3 rotateY(vec3 v, float a) {
					float s = sin(a);
					float c = cos(a);
					return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
				}
				vec3 rotateX(vec3 v, float a) {
					float s = sin(a);
					float c = cos(a);
					return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z);
				}
				`,
				uniforms: {
					albedo: albedo,
					envmap: this.windowEquirectangularEnvmap,
					backgroundPicTex: this.backgroundPicTex.get(),
					backgroundPicTexSize: new THREE.Vector2(this.backgroundPicTex.width, this.backgroundPicTex.height),
					lodBias: 0.0,
					lodMax: 3.0,
					refractLodScale: 5.0
				}
			});
		return tex3d;
	}

	private setGlobalUniforms() {
		let mousePos = this.input.mousePos;
		if(typeof mousePos == "undefined")
			mousePos = new THREE.Vector2(0, 0); // this is normally harmless
		mousePos = mousePos.clone();
		mousePos.divide(new THREE.Vector2(window.innerWidth, window.innerHeight));
		//console.log("mousePos=", mousePos)
		this.compute.setGlobalUniform("mouse", mousePos);
	}

	private animate = (now: DOMHighResTimeStamp) => {
		this.setGlobalUniforms();
		
		let texturesToRelease : GpuCompute.TextureWrapper[] = [];

		this.framerateCounter.update(now);
		if (this.limitFramerateCheckbox.checked)
			setTimeout(this.animate, 1000);
		else
			requestAnimationFrame(this.animate);
		
		if (!this.assetsLoaded)
			return;
		globals.stateTex0 = this.doSimulationStep(globals.stateTex0, /*releaseFirstInputTex=*/ true);
		//globals.stateTex1 = stateTex1Shrunken;

		let iters = 30;
		if(this.input.mousePos !== undefined) {
			//iters *= this.input.mousePos!.x / window.innerWidth;;
		}

		var extruded0 = this.imageProcessor.extrude(globals.stateTex0, iters, globals.scale, /*releaseFirstInputTex=*/ false);
		//extruded0 = this.imageProcessor.mul(extruded0, this.input.mousePos!.x / window.innerWidth, true);
		extruded0 = this.imageProcessor.mul(extruded0, .25, true);
		let tex3d_0 = this.make3d(extruded0, new THREE.Vector3(0.09, 0.09, 0.09), { releaseFirstInputTex: true });
		texturesToRelease.push(tex3d_0);
		let tex3d = tex3d_0;
		let tex3dBlurState = this.compute.run([tex3d], `
			_out.rgb = texture().rgb;
			_out.rgb *= step(vec3(20.5), _out.rgb);
			`, {
				releaseFirstInputTex: false
			}

		);
		let tex3dBlurCollected = this.compute.run([tex3dBlurState], `
			_out.rgb = vec3(0.0); // zero it out
			`, {
				releaseFirstInputTex: false
			});
		for(let i = 0; i < 5; i++) {
			//tex3dBlurState = this.imageProcessor.scale(tex3dBlurState, 0.5, true);
			tex3dBlurState = this.imageProcessor.blur(tex3dBlurState, 1.0, 0.5, true);
			tex3dBlurCollected = this.compute.run([tex3dBlurCollected, tex3dBlurState], `
				_out.rgb = texture(tex1).rgb*1.2 + texture(tex2).rgb;
				`, {
					releaseFirstInputTex: true
				});
		}
		texturesToRelease.push(tex3dBlurState);
		texturesToRelease.push(tex3dBlurCollected);
		let tex3dBloom = this.compute.run([tex3d, tex3dBlurCollected], `
			vec3 col = texture(tex1).rgb;
			vec3 bloom = texture(tex2).rgb;
			_out.rgb = col + bloom;
			_out.rgb = _out.rgb / (_out.rgb + vec3(1.0)); // tone mapping
			_out.rgb = pow(_out.rgb, vec3(1.0/2.2)); // gamma correction
			`, {
				releaseFirstInputTex: false
			});
		texturesToRelease.push(tex3dBloom);
		if (this.input.isKeyHeld("keyb")) {
			this.compute.drawToScreen(tex3dBlurCollected);
		} else if (this.input.isKeyHeld("digit1")) {
			var toDraw = this.compute.run([extruded0], `
				float state = texture(tex1).r;
				_out.r = state;`
				, {
					releaseFirstInputTex: false
				}
			);
			this.compute.drawToScreen(toDraw);
		} else {
			this.compute.drawToScreen(tex3dBloom);
		}
		texturesToRelease.forEach(t => this.compute.willNoLongerUse(t));
	};
}

new App();
