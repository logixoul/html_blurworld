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
import GUI from 'lil-gui';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

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
	private gui!: GUI;
	private heightScaleController?: any;
	private readonly legacyNormalStrength = 160.0;
	private perspectiveScene?: THREE.Scene;
	private perspectiveCamera?: THREE.PerspectiveCamera;
	private perspectiveMesh?: THREE.Mesh;
	private perspectiveMaterial?: THREE.ShaderMaterial;
	private perspectiveGeomSize?: THREE.Vector2;
	private orbitControls?: OrbitControls;

	constructor() {
		this.#renderer = new THREE.WebGLRenderer();
		document.body.appendChild( this.#renderer.domElement );

		this.input = new Input(this.#renderer);

		this.compute = new GpuCompute.GpuComputeContext(this.#renderer);
		this.imageProcessor = new ImageProcessor(this.compute);
		this.initGui();
		this.backgroundPicTexOrig = new GpuCompute.TextureWrapper(new THREE.TextureLoader().load(
			'assets/milkyway.png',
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
				new RGBELoader().load( 'assets/Untitled.hdr', ( texture ) =>{
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
		globals.scale = Math.sqrt(200*150) / Math.sqrt(documentW * documentH);
		//globals.scale = 0.5;
		
		const img = new Image<Float32Array>(
			Math.trunc(documentW*globals.scale), Math.trunc(documentH*globals.scale),
			Float32Array);
			//Uint8Array);
			
		this.params.planeWorldSizeX *= documentW / documentH;
		
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
		this.#renderer.setSize( window.innerWidth, window.innerHeight );
	};

	private params = {
		fovYDeg: 60.0,
		planeWorldSizeX: 1.0,
		planeWorldSizeY: 1.0,
		heightScale: 0.3,
		backgroundDistance: 1.0,
		specularMultiplier: 1.0,
		specularRotationX: 0.0,
		specularRotationY: 0.0
	};

	private initGui() {
		this.gui = new GUI({ title: 'Optics' });
		this.gui.add(this.params, 'fovYDeg', 10.0, 120.0, 1.0).name('FOV Y (deg)');
		this.gui.add(this.params, 'planeWorldSizeX', 0.1, 10.0, 0.01).name('Plane size X');
		this.gui.add(this.params, 'planeWorldSizeY', 0.1, 10.0, 0.01).name('Plane size Y');
		this.heightScaleController = this.gui.add(this.params, 'heightScale', 0.0001, 5.0, 0.0001)
			.name('Height scale');
		this.gui.add(this.params, 'backgroundDistance', 0.01, 20.0, 0.01).name('Background distance');
		this.gui.add(this.params, 'specularMultiplier', 0.01, 20.0, 0.01).name('Specular multiplier');
		this.gui.add(this.params, 'specularRotationX', 0, 1.0, 0.01).name('specularRotationX');
		this.gui.add(this.params, 'specularRotationY', 0, 1.0, 0.01).name('specularRotationY');
	}

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
			vec2 texelWorld = vec2(planeWorldSize.x * texelSize0.x, planeWorldSize.y * texelSize0.y);
			float dhdx = (here - texture(tc - vec2(texelSize0.x, 0)).r) * heightScale / max(texelWorld.x, 1e-6);
			float dhdy = (here - texture(tc - vec2(0, texelSize0.y)).r) * heightScale / max(texelWorld.y, 1e-6);
			vec3 normal = normalize(vec3(dhdx, dhdy, 1.0));
			float tanHalfFov = tan(cameraFovY * 0.5);
			vec2 ndc = tc * 2.0 - 1.0;
			vec3 viewDir = normalize(vec3(ndc.x * cameraAspect * tanHalfFov, ndc.y * tanHalfFov, 1.0));
			vec3 refl = reflect(-viewDir, normal);
			vec2 res = vec2(1.0 / texelSize0.x, 1.0 / texelSize0.y);
			vec2 mouseUv = vec2(specularRotationX, specularRotationY);//mouse;
			float yaw = (mouseUv.x - 0.5) * PI * 2.0;
			float pitch = (0.5 - mouseUv.y) * PI;
			refl = rotateY(refl, yaw);
			refl = rotateX(refl, pitch);
			vec2 envUv = vec2(atan(refl.z, refl.x) / (2.0 * PI) + 0.5, asin(clamp(refl.y, -1.0, 1.0)) / PI + 0.5);
			float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);
			float fresnelWeight = mix(0.04, 1.0, fresnel);
			vec3 specularRgb = texture(envmap, envUv).rgb * fresnelWeight;
			
			float eta = 1.0 / 1.5; // air -> water-ish
			vec3 refracted = refract(viewDir, normal, eta);
			float z = max(abs(refracted.z), 1e-3);
			vec2 refractOffset = refracted.xy / z;
			float thickness = here * heightScale / abs(refracted.z);
			float depthRatio = thickness / max(backgroundDistance, 1e-3);
			vec2 refractUv = tc + refractOffset * depthRatio;
			float lod = manualLod(refractUv, backgroundPicTexSize, refractOffset * depthRatio) + lodBias;
			lod = clamp(lod, 0.0, lodMax);
			_out.rgb = textureLod(backgroundPicTex, refractUv, lod).rgb * pow(albedo, vec3(thickness));
			if(here > 0.0)
				_out.rgb += specularRgb * specularMultiplier; // specular
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
					cameraFovY: THREE.MathUtils.degToRad(this.params.fovYDeg),
					cameraAspect: window.innerWidth / window.innerHeight,
					planeWorldSize: new THREE.Vector2(this.params.planeWorldSizeX, this.params.planeWorldSizeY),
					heightScale: this.params.heightScale,
					backgroundDistance: this.params.backgroundDistance,
					lodBias: 0.0,
					lodMax: 3.0,
					refractLodScale: 5.0,
					specularMultiplier: this.params.specularMultiplier,
					specularRotationX: this.params.specularRotationX,
					specularRotationY: this.params.specularRotationY,
				}
		});
		return tex3d;
	}

	private renderInPerspective(heightmap: GpuCompute.TextureWrapper, albedo: THREE.Vector3, options?: any) {
		options = options || {};
		const heightWidth = heightmap.width;
		const heightHeight = heightmap.height;
		const heightTex = heightmap.get();

		if (!this.perspectiveScene || !this.perspectiveCamera || !this.perspectiveMaterial || !this.perspectiveMesh) {
			const vertexShader = `
precision highp float;

/*in vec3 position;
in vec2 uv;*/ //lx

uniform sampler2D heightmap;
uniform vec2 heightmapSize;
uniform vec2 planeWorldSize;
uniform float heightScale;

out vec3 vWorldPos;
out vec4 vClipPos;
flat out ivec2 vTexel;

void main() {
	vec2 texelPos = uv * (heightmapSize - 1.0);
	vTexel = ivec2(texelPos + 0.5);
	float height = texelFetch(heightmap, vTexel, 0).r;
	vec2 base = (uv - 0.5) * planeWorldSize;
	vec3 localPos = vec3(base, height * heightScale);
	vec4 worldPos = modelMatrix * vec4(localPos, 1.0);
	vWorldPos = worldPos.xyz;
	vClipPos = projectionMatrix * viewMatrix * worldPos;
	gl_Position = vClipPos;
}
`;

			const fragmentShader = `
precision highp float;
precision highp sampler2D;

uniform mat4 projectionMatrix;
uniform sampler2D heightmap;
uniform vec2 heightmapSize;
uniform sampler2D envmap;
uniform sampler2D backgroundPicTex;
uniform vec3 albedo;
uniform vec2 planeWorldSize;
uniform float heightScale;
uniform float backgroundDistance;
uniform float specularMultiplier;
uniform float specularRotationX;
uniform float specularRotationY;
uniform vec3 cameraForward;

in vec3 vWorldPos;
in vec4 vClipPos;
flat in ivec2 vTexel;

out vec4 outColor;

const float PI = 3.14159265358979323846;

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

void main() {
	ivec2 texSize = ivec2(heightmapSize);
	ivec2 texel = clamp(vTexel, ivec2(0), texSize - ivec2(1));
	float here = texelFetch(heightmap, texel, 0).r;
	ivec2 texelLeft = clamp(texel - ivec2(1, 0), ivec2(0), texSize - ivec2(1));
	ivec2 texelDown = clamp(texel - ivec2(0, 1), ivec2(0), texSize - ivec2(1));
	float left = texelFetch(heightmap, texelLeft, 0).r;
	float down = texelFetch(heightmap, texelDown, 0).r;

	vec2 texelWorld = vec2(
		planeWorldSize.x / max(heightmapSize.x - 1.0, 1.0),
		planeWorldSize.y / max(heightmapSize.y - 1.0, 1.0)
	);
	float dhdx = (here - left) * heightScale / max(texelWorld.x, 1e-6);
	float dhdy = (here - down) * heightScale / max(texelWorld.y, 1e-6);
	vec3 normal = normalize(vec3(dhdx, dhdy, 1.0));

	vec3 viewDir = normalize(cameraPosition - vWorldPos);
	vec3 refl = reflect(-viewDir, normal);
	float yaw = (specularRotationX - 0.5) * PI * 2.0;
	float pitch = (0.5 - specularRotationY) * PI;
	refl = rotateY(refl, yaw);
	refl = rotateX(refl, pitch);
	vec2 envUv = vec2(
		atan(refl.z, refl.x) / (2.0 * PI) + 0.5,
		asin(clamp(refl.y, -1.0, 1.0)) / PI + 0.5
	);
	float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);
	float fresnelWeight = mix(0.04, 1.0, fresnel);
	vec3 specularRgb = texture(envmap, envUv).rgb * fresnelWeight;

	float eta = 1.0 / 1.5;
	vec3 refracted = refract(-viewDir, normal, eta);
	vec2 screenUv = vClipPos.xy / vClipPos.w * 0.5 + 0.5;
	vec2 refractUv = screenUv;

	float denom = dot(refracted, cameraForward);
	if (abs(denom) > 1e-5) {
		vec3 planePoint = cameraPosition + cameraForward * backgroundDistance;
		float t = dot(planePoint - vWorldPos, cameraForward) / denom;
		vec3 hit = vWorldPos + refracted * t;
		vec4 hitClip = projectionMatrix * viewMatrix * vec4(hit, 1.0);
		refractUv = hitClip.xy / hitClip.w * 0.5 + 0.5;
	}
	refractUv = clamp(refractUv, vec2(0.0), vec2(1.0));

	vec3 baseColor = texture(backgroundPicTex, refractUv).rgb * pow(albedo, vec3(here));
	vec3 color = baseColor;
	if (here > 0.0) {
		color += specularRgb * specularMultiplier;
	}
	outColor = vec4(color, 1.0);
}
`;

			this.perspectiveScene = new THREE.Scene();
			this.perspectiveCamera = new THREE.PerspectiveCamera(this.params.fovYDeg, window.innerWidth / window.innerHeight, 0.01, 1000.0);

			this.orbitControls = new OrbitControls( this.perspectiveCamera, this.#renderer.domElement );
			const initDistance = (this.params.planeWorldSizeY * 0.5) / Math.tan(THREE.MathUtils.degToRad(this.params.fovYDeg) * 0.5);
			this.perspectiveCamera.position.set(0.0, 0.0, initDistance + this.params.heightScale);
			this.orbitControls.target.set(0.0, 0.0, 0.0);
			this.orbitControls.update();

			this.perspectiveMaterial = new THREE.ShaderMaterial({
				uniforms: {
					heightmap: { value: heightTex },
					heightmapSize: { value: new THREE.Vector2(heightWidth, heightHeight) },
					planeWorldSize: { value: new THREE.Vector2(this.params.planeWorldSizeX, this.params.planeWorldSizeY) },
					heightScale: { value: this.params.heightScale },
					albedo: { value: albedo.clone() },
					envmap: { value: this.windowEquirectangularEnvmap },
					backgroundPicTex: { value: this.backgroundPicTex.get() },
					backgroundDistance: { value: this.params.backgroundDistance },
					specularMultiplier: { value: this.params.specularMultiplier },
					specularRotationX: { value: this.params.specularRotationX },
					specularRotationY: { value: this.params.specularRotationY },
					cameraForward: { value: new THREE.Vector3() }
				},
				vertexShader: vertexShader,
				fragmentShader: fragmentShader,
				glslVersion: THREE.GLSL3,
				side: THREE.DoubleSide
			});
			const segmentsX = Math.max(heightWidth - 1, 1);
			const segmentsY = Math.max(heightHeight - 1, 1);
			const geometry = new THREE.PlaneGeometry(1.0, 1.0, segmentsX, segmentsY);
			this.perspectiveGeomSize = new THREE.Vector2(heightWidth, heightHeight);
			this.perspectiveMesh = new THREE.Mesh(geometry, this.perspectiveMaterial);
			this.perspectiveMesh.frustumCulled = false;
			this.perspectiveScene.add(this.perspectiveMesh);
		} else if (this.perspectiveGeomSize && (this.perspectiveGeomSize.x !== heightWidth || this.perspectiveGeomSize.y !== heightHeight)) {
			const segmentsX = Math.max(heightWidth - 1, 1);
			const segmentsY = Math.max(heightHeight - 1, 1);
			this.perspectiveMesh.geometry.dispose();
			this.perspectiveMesh.geometry = new THREE.PlaneGeometry(1.0, 1.0, segmentsX, segmentsY);
			this.perspectiveGeomSize.set(heightWidth, heightHeight);
		}

		const camera = this.perspectiveCamera!;
		const fovRad = THREE.MathUtils.degToRad(this.params.fovYDeg);
		const halfH = this.params.planeWorldSizeY * 0.5;
		const distance = halfH / Math.tan(fovRad * 0.5);
		camera.fov = this.params.fovYDeg;
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.near = 0.01;
		camera.far = Math.max(1000.0, distance + this.params.backgroundDistance * 4.0 + this.params.heightScale * 4.0);

		
		//camera.lookAt(0.0, 0.0, 0.0);
		camera.updateProjectionMatrix();
		this.orbitControls!.update();
		camera.updateProjectionMatrix();

		const uniforms = this.perspectiveMaterial!.uniforms;
		uniforms.heightmap.value = heightTex;
		(uniforms.heightmapSize.value as THREE.Vector2).set(heightWidth, heightHeight);
		(uniforms.planeWorldSize.value as THREE.Vector2).set(this.params.planeWorldSizeX, this.params.planeWorldSizeY);
		uniforms.heightScale.value = this.params.heightScale;
		(uniforms.albedo.value as THREE.Vector3).copy(albedo);
		uniforms.envmap.value = this.windowEquirectangularEnvmap;
		uniforms.backgroundPicTex.value = this.backgroundPicTex.get();
		uniforms.backgroundDistance.value = this.params.backgroundDistance;
		uniforms.specularMultiplier.value = this.params.specularMultiplier;
		uniforms.specularRotationX.value = this.params.specularRotationX;
		uniforms.specularRotationY.value = this.params.specularRotationY;
		camera.getWorldDirection(uniforms.cameraForward.value as THREE.Vector3);

		const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			//internalFormat: 'RGBA32F',
			depthBuffer: true,
			stencilBuffer: false,
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter
		});
		renderTarget.texture.generateMipmaps = false;
		renderTarget.texture.wrapS = THREE.ClampToEdgeWrapping;
		renderTarget.texture.wrapT = THREE.ClampToEdgeWrapping;

		const prevTarget = this.#renderer.getRenderTarget();
		const prevAutoClear = this.#renderer.autoClear;
		this.#renderer.setRenderTarget(renderTarget);
		this.#renderer.autoClear = true;
		this.#renderer.clear();
		this.#renderer.render(this.perspectiveScene!, camera);
		this.#renderer.setRenderTarget(prevTarget);
		this.#renderer.autoClear = prevAutoClear;

		return new GpuCompute.TextureWrapper(renderTarget);
	}

	private animate = (now: DOMHighResTimeStamp) => {
		this.orbitControls?.update();

		let mousePos = this.input.mousePos;
		if(typeof mousePos == "undefined")
			mousePos = new THREE.Vector2(0, 0); // this is normally harmless
		mousePos = mousePos.clone();
		mousePos.divide(new THREE.Vector2(window.innerWidth, window.innerHeight));
		//console.log("mousePos=", mousePos)
		this.compute.setGlobalUniform("mouse", mousePos);
		
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
		extruded0 = this.imageProcessor.mul(extruded0, .5, true);
		//let tex3d_0 = this.make3d(extruded0, new THREE.Vector3(0.09, 0.09, 0.09), { releaseFirstInputTex: false });
		let tex3d_0 = this.renderInPerspective(extruded0, new THREE.Vector3(0.009, 0.009, 0.009), {});
		texturesToRelease.push(extruded0);
		//texturesToRelease.push(tex3d_0);
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
				_out.rgb = texture(tex0).rgb*1.2 + texture(tex1).rgb;
				`, {
					releaseFirstInputTex: true
				});
		}
		texturesToRelease.push(tex3dBlurState);
		texturesToRelease.push(tex3dBlurCollected);
		let tex3dBloom = this.compute.run([tex3d, tex3dBlurCollected], `
			vec3 col = texture(tex0).rgb;
			vec3 bloom = texture(tex1).rgb;
			_out.rgb = col + bloom;
			_out.rgb = _out.rgb / (_out.rgb + vec3(1.0)); // tone mapping
			_out.rgb = pow(_out.rgb, vec3(1.0/2.2)); // gamma correction
			`, {
				releaseFirstInputTex: false
			});
		texturesToRelease.push(tex3dBloom);
		if (this.input.isKeyHeld("keyb")) {
			this.compute.drawToScreen(tex3d_0);
		} else if (this.input.isKeyHeld("digit1")) {
			var toDraw = this.compute.run([extruded0], `
				float state = texture(tex0).r*10.0;
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

		tex3d_0.dispose();
	};
}

new App();
