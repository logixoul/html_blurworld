import * as THREE from 'three';
import * as GpuCompute from './GpuCompute';
import { ImageProcessor } from './ImageProcessor';
import { globals } from './Globals.js';
import { Input } from './Input';
import * as util from './util';
import { Image } from "./Image";
import { FramerateCounter } from "./FramerateCounter";
import * as KeysHeld from './KeysHeld';
import { PresentationForIashu } from './presentationForIashu';
import * as System from './System';

export class App {
	private backgroundPicTex!: GpuCompute.TextureWrapper;
	private assetsLoaded: boolean = false;
	private backgroundPicTexOrig: GpuCompute.TextureWrapper;
	private framerateCounter: FramerateCounter;
	private limitFramerateCheckbox: HTMLInputElement;
	private compute : GpuCompute.GpuComputeContext;
	private imageProcessor : ImageProcessor;

	constructor() {
		this.compute = new GpuCompute.GpuComputeContext(util.renderer);
		this.imageProcessor = new ImageProcessor(this.compute);
		this.backgroundPicTexOrig = new GpuCompute.TextureWrapper(new THREE.TextureLoader().load(
			'assets/milkyway.png',
			() => {
				this.backgroundPicTex = this.compute.run([this.backgroundPicTexOrig], `
				_out.rgb = texture().rgb;
				_out.rgb /= 1.0 - 0.99*_out.rgb;
				//_out.rgb = pow(_out.rgb, vec3(2.2));
				`, {
					releaseFirstInputTex: false, // todo: fix memory leak
					itype: THREE.FloatType
				});
				this.assetsLoaded = true;
			}
		));

		this.onResize();
		globals.input = new Input();

		document.getElementById("loadingScreen")!.style.display = "none";

		if (window.location.hostname !== "localhost") {
			document.getElementById("framerate")!.style.display = "none";
		}
		new PresentationForIashu(this.compute);

		document.defaultView!.addEventListener("resize", this.onResize);
		this.framerateCounter = new FramerateCounter();
		this.limitFramerateCheckbox = document.getElementById("limitFramerate")! as HTMLInputElement;

		requestAnimationFrame(this.animate);
	}

	private createStateTex() {
		const documentW = window.innerWidth;
		const documentH = window.innerHeight;
		globals.scale = Math.sqrt(200*150) / Math.sqrt(documentW * documentH);
		//globals.scale = 1;
		
		const img = new Image<Float32Array>(
			Math.trunc(documentW*globals.scale), Math.trunc(documentH*globals.scale),
			Float32Array);
			//Uint8Array);

		img.forEach((x : number, y : number) => img.set(x, y, Math.random()));

		let stateTex : GpuCompute.TextureUnion = new THREE.DataTexture(img.data, img.width, img.height, THREE.RedFormat,
				THREE.FloatType);
				//THREE.UnsignedByteType);
		stateTex.generateMipmaps = false;
		stateTex.minFilter = THREE.LinearFilter;
		stateTex.magFilter = THREE.LinearFilter;
		stateTex.needsUpdate = true;

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
		globals.stateTex1 = this.createStateTex();
		util.renderer.setSize( window.innerWidth, window.innerHeight );
	};

	private doSimulationStep(inTex : GpuCompute.TextureWrapper, releaseFirstInputTex : boolean) {
		let state : GpuCompute.TextureWrapper = this.imageProcessor.zeroOutBorders(inTex, /*releaseFirstInputTex=*/ releaseFirstInputTex);
		//state = this.imageProcessor.fastBlur(state, /*releaseFirstInputTex=*/ true);
		state = this.imageProcessor.blur(state, 0.15, 1.0, /*releaseFirstInputTex=*/ true);
		state = this.compute.run([state?.get()], `
			float f = texture().r;
			//float fw = fwidth(f)*4.0;
			//f = smoothstep(.5-fw, .5+fw, f);
			f = linearstep(0.1, 0.9, f);

			_out.r = f;
			`, {
				releaseFirstInputTex: true,
				lib: `
				float linearstep(float edge0, float edge1, float x) {
					return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
				}
				`
			});
		return state;
	}

	private make3d(heightmap: GpuCompute.TextureWrapper, albedo: THREE.Vector3, options?: any) {
		options = options || {};
		let tex3d = this.compute.run([heightmap], `
			float here = texture().r;
			vec2 d = vec2(
				here - texture(tc - vec2(tsize1.x, 0)).r,
				here - texture(tc - vec2(0, tsize1.y)).r
				);
			d *= 102.0f;
			d.x *= -1.0f * .10;
			
			//_out.rgb = texture(tex2).rgb;//vec3(0,.2,.5);
			const vec2 specThres = vec2(-0.02);
			vec2 specular = max(vec2(-d-.1), vec2(0.0f)) + vec2(.5);
			vec2 fw = fwidth(d);
			
			specular *= vec2(1.0)-smoothstep(specThres - fw/2.0, specThres + fw/2.0, d);
			vec3 specularRgb = vec3(specular.y);
			
			if(here > 0.0)
				_out.rgb = albedo.rgb*4.0;
			else
				_out.rgb = vec3(-1.0); // sentinel value for "no data"
			
			_out.rgb += specularRgb; // specular
			if(d.y>0.0f)_out.rgb /= 1.0+d.y*10.0; // shadows

			//_out.rgb /= _out.rgb + 1.0f;
			//
			`, {
				releaseFirstInputTex: options.releaseFirstInputTex !== undefined ? options.releaseFirstInputTex : false,
				iformat: THREE.RGBAFormat,
				itype: THREE.FloatType,
				uniforms: {
					albedo: albedo
				}
			});
		return tex3d;
	}

	private animate = (now: DOMHighResTimeStamp) => {
		let texturesToRelease : GpuCompute.TextureWrapper[] = [];

		this.framerateCounter.update(now);
		if (this.limitFramerateCheckbox.checked)
			setTimeout(this.animate, 1000);
		else
			requestAnimationFrame(this.animate);
		
		if (!this.assetsLoaded)
			return;
		if(!KeysHeld.global_keysHeld["digit1"]) {
			globals.stateTex0 = this.doSimulationStep(globals.stateTex0, /*releaseFirstInputTex=*/ true);
			globals.stateTex1 = this.doSimulationStep(globals.stateTex1, /*releaseFirstInputTex=*/ true);
			const stateTex0Shrunken = this.compute.run([globals.stateTex0, globals.stateTex1], `
				_out.r = max(0.0, texture(tex1).r - texture(tex2).r);
				`,
				{
					releaseFirstInputTex: false
				});
			this.compute.willNoLongerUse(globals.stateTex0);
			globals.stateTex0 = stateTex0Shrunken;
		}
		//globals.stateTex1 = stateTex1Shrunken;

		const iters = 30;// * System.getMousePos().x / window.innerWidth;

		var extruded0 = this.imageProcessor.extrude(globals.stateTex0, iters, globals.scale, /*releaseFirstInputTex=*/ false);
		var extruded1 = this.imageProcessor.extrude(globals.stateTex1, iters,globals.scale, /*releaseFirstInputTex=*/ false);
		if(KeysHeld.global_keysHeld["digit1"]) {
			var toDraw = this.compute.run([globals.stateTex0], `
			float state = texture(tex1).r;
			//state = .5 * state;
			_out.r = state;`
			, {
				releaseFirstInputTex: false
			}
			);
			this.compute.drawToScreen(toDraw);
			return;
		}

		let tex3d_0 = this.make3d(extruded0, new THREE.Vector3(1.5, 0.2, 0.0), { releaseFirstInputTex: true });
		texturesToRelease.push(tex3d_0);
		let tex3d_1 = this.make3d(extruded1, new THREE.Vector3(0.0, 0.2, 1.5), { releaseFirstInputTex: true });
		texturesToRelease.push(tex3d_1);
		let tex3d = this.compute.run([tex3d_0, tex3d_1, this.backgroundPicTex], `
			vec3 col0 = texture(tex1).rgb;
			vec3 col1 = texture(tex2).rgb;
			if(col0.r < 0.0 && col1.r < 0.0) {
				_out.rgb = vec3(-1.0); // use sentinel value for "no data"
				return;
			}
			col0 = max(col0, vec3(0.0));
			col1 = max(col1, vec3(0.0));
			_out.rgb = col0 + col1;
			`, {
				releaseFirstInputTex: false
			});
		texturesToRelease.push(tex3d);
		/*let tex3dThresholded = this.compute.run([tex3d], `
			vec3 col = texture().rgb;
			//col *= step(1.0, dot(col, vec3(1.0/3.0)));
			_out.rgb = col;
			`);*/
		let tex3dBlurState = this.compute.run([globals.stateTex0, globals.stateTex1], `
			vec3 col0 = texture(tex1).rgb;
			vec3 col1 = texture(tex2).rgb;
			if(col0 == vec3(0.0) && col1 == vec3(0.0)) {
				_out.rgb = vec3(0.0); // use black where no data
			} else {
				_out.rgb = vec3(1.0);
			}
			`, {
				releaseFirstInputTex: false
			});
		let tex3dBlurCollected = this.imageProcessor.cloneTex(tex3dBlurState);
		tex3dBlurCollected = this.compute.run([tex3dBlurCollected], `
			_out.rgb = vec3(0.0); // zero it out
			`, {
				releaseFirstInputTex: true
			});
		for(let i = 0; i < 3; i++) {
			tex3dBlurState = this.imageProcessor.scale(tex3dBlurState, 0.5, true);
			tex3dBlurState = this.imageProcessor.blur(tex3dBlurState, 1.0, 1.0, true);
			tex3dBlurCollected = this.compute.run([tex3dBlurCollected, tex3dBlurState], `
				_out.rgb = texture(tex1).rgb + texture(tex2).rgb;
				`, {
					releaseFirstInputTex: true
				});
		}
		texturesToRelease.push(tex3dBlurState);
		texturesToRelease.push(tex3dBlurCollected);
		let tex3dShadowed = this.compute.run([tex3d, tex3dBlurCollected, this.backgroundPicTex], `
			vec3 col = texture(tex1).rgb;
			float shadow = texture(tex2).r;
			vec3 background = texture(tex3).rgb;
			if(col.r < 0.0) {
				col = background; // use background where no data
				//col /= 1.0 + pow(shadow, 4.0);
			} else {
				//col += background * 0.02;
			}
			_out.rgb = col;
			_out.rgb = _out.rgb / (_out.rgb + vec3(1.0)); // tone mapping
			_out.rgb = pow(_out.rgb, vec3(1.0/2.2)); // gamma correction
			`, {
				releaseFirstInputTex: false
			});
		texturesToRelease.push(tex3dShadowed);
		if (KeysHeld.global_keysHeld["keyb"]) {
			this.compute.drawToScreen(tex3dBlurCollected);
		}
		//this.compute.drawToScreen(tex3dBlurCollected);
		else {
			this.compute.drawToScreen(tex3dShadowed);
		}
		texturesToRelease.forEach(t => this.compute.willNoLongerUse(t));
	};
}

new App();
