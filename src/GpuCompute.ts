import * as THREE from 'three';

export type TextureUnion = (THREE.Texture | THREE.WebGLRenderTarget);

export class TextureWrapper {
	private readonly actualTextureObj: THREE.Texture;
	private readonly renderTargetObj?: THREE.WebGLRenderTarget;
	private isRenderTarget(): boolean {
		return this.renderTargetObj !== undefined;
	}
	set magFilter(value: THREE.MagnificationTextureFilter) {
		this.actualTextureObj.magFilter = value;
	}
	get size(): { width: number; height: number } {
		if (this.isRenderTarget()) return { width: this.renderTargetObj!.width, height: this.renderTargetObj!.height };
		const img = this.actualTextureObj.image as { width: number; height: number } | undefined;
		if(!img)
			throw new Error("TextureWrapper.size: texture image is undefined");
		return { width: img.width, height: img.height };
	}
	get width() : number { return this.size.width; }
	get height(): number { return this.size.height; }
	get(): THREE.Texture {
		return this.actualTextureObj;
	}
	getRenderTarget(): THREE.WebGLRenderTarget {
		if(!this.isRenderTarget())
			throw new Error("TextureWrapper.getRenderTarget(): not a render target");
		return this.renderTargetObj!;
	}
	constructor(param : TextureUnion) {
		if(param instanceof THREE.Texture) {
			var asTex = param as THREE.Texture;
			this.actualTextureObj = asTex;
		} else if(param instanceof THREE.WebGLRenderTarget) {
			var asRt = param as THREE.WebGLRenderTarget;
			this.actualTextureObj = asRt.texture;
			this.renderTargetObj = asRt;
		} else {
			throw new Error("TextureWrapper: invalid parameter");
		}
	}
	toString() {
		return this.actualTextureObj.id.toString();
	}
	dispose() {
		if(this.renderTargetObj !== undefined) {
			this.renderTargetObj.dispose();
		} else {
			this.actualTextureObj.dispose();
		}
	}
}

function isThreeJsTexture(value: unknown): value is THREE.Texture {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isTexture' in value &&
    (value as any).isTexture === true
  );
}

function mapType(value: any) {
	if(value instanceof THREE.Vector3)
		return 'vec3';
	if(value instanceof THREE.Vector2)
		return 'vec2';
	else if(typeof value === "number")
		return 'float';
	else if(isThreeJsTexture(value)) {
		return 'sampler2D';
	}
	else throw new Error("Unimplemented uniform type");
}

// GPT generated this functions. todo: is it needed?
function getTextureSize(tex: THREE.Texture): THREE.Vector2 {
	// THREE.Texture.image is typed as unknown in @types/three.
	const image = tex.image as { width: number; height: number };
	return new THREE.Vector2(image.width, image.height);
}

const vertexShader : string = `
varying vec2 vUv;
vec2 tc;

void main() {
	tc = uv; // backward compatibility
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
	%VSHADER_EXTRA%
	vUv = tc;
}
`;

const intro = `
	varying vec2 vUv;
	vec4 _out;
	vec2 tc;
	
	vec4 texture() {
		return texture(tex0, tc);
	}
	vec4 texture(sampler2D tex_) {
		return texture(tex_, tc);
	}
	vec4 texture(vec2 tc_) {
		return texture(tex0, tc_);
	}
`;

const outro = `
	}
	void main() {
		tc = vUv; // backward compatibility
		shade();
		gl_FragColor = _out;
	}
`;

var camera = new THREE.OrthographicCamera( 0, 1, 1, 0, -1000, 1000 );

var geometry = new THREE.PlaneGeometry();

type ProgramCache = { [key: string]: THREE.ShaderMaterial };
type MeshCache = { [key: string]: THREE.Mesh };
var programCache : ProgramCache = { };
var meshCache : MeshCache = { };

class TexturePoolKey {
	width : number = 0;
	height : number = 0;
	itype : THREE.TextureDataType;
	iformat: THREE.PixelFormat = THREE.RedFormat;
	constructor(w : number, h : number, itype : THREE.TextureDataType, iformat: THREE.PixelFormat = THREE.RedFormat) {
		console.assert(Number.isInteger(w));
		console.assert(Number.isInteger(h));
		this.width = w;
		this.height = h;
		this.itype = itype;
		this.iformat = iformat;
	}
	toString() : string {
		return this.width + "," + this.height + "," + this.itype + "," + this.iformat;
		//return JSON.stringify(this);
	}
	toPrettyString() : string {
		return "TexturePoolKey(width=" + this.width + ", height=" + this.height + ", itype=" + this.itype + ", iformat=" + this.iformat + ")";
	}
}

class TextureInfo {
	useCount: number = 0;
	key: TexturePoolKey;

	constructor(key : TexturePoolKey) {
		this.key = key;
	}
}

function console_log(s : string) {
	//console.log(s);
}

class TexturePool {
	private mapOfTextures = new Map<string, Array<TextureWrapper>>(); // key obtained by TexturePoolKey.toString()
	private infos = new Map<string, TextureInfo>(); // key obtained by TextureWrapper.toString()

	private setDefaults(tex : THREE.Texture) {
		tex.minFilter = THREE.LinearFilter;
		tex.magFilter = THREE.LinearFilter;
		tex.wrapS = THREE.ClampToEdgeWrapping;
		tex.wrapT = THREE.ClampToEdgeWrapping;
		//tex.generateMipmaps = false;
	}

	numTexturesDbg = 0;

	_allocTex(key : TexturePoolKey) : TextureWrapper {
		var tex = new THREE.WebGLRenderTarget(key.width, key.height, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, type: key.itype, format: key.iformat });
		var texWrapper = new TextureWrapper(tex);

		var keyString : string = texWrapper.toString();
		let textureInfo = new TextureInfo(key);
		this.infos.set(keyString, textureInfo);
		textureInfo.useCount = 1;

		this.numTexturesDbg++;
		return texWrapper;
	}

	willNoLongerUse(tex : TextureWrapper) {
		var info : TextureInfo | undefined = this.infos.get(tex.toString());
		if(info === undefined) {
			console.assert(tex.get() instanceof THREE.DataTexture);
			// `tex` has not been created by TexturePool and is not managed by it.
			// Since `willNoLongerUse()` has been called, the user tells us that he no longer needs that texture so
			// it's safe to just dispose it.
			tex.dispose();
			return;
		}
		console.assert(info.useCount > 0);
		info.useCount--;
	}

	get(key : TexturePoolKey)
	{
		var keyString : string = key.toString();
		console_log("get(" + key.toPrettyString() + "):");

		console_log("\tnumTexturesDbg = " + this.numTexturesDbg);

		const alreadyExists = this.mapOfTextures.has(keyString);
		console_log("\talreadyExists = " + alreadyExists);
		if (!alreadyExists) {
			console_log("\tcachemap doesn't have anything for this key. allocating texture");
			const tex = this._allocTex(key);
			const vec = [ tex ];
			this.mapOfTextures.set(keyString, vec);
			this.setDefaults(tex.get());
			return tex;
		}
		else {
			const vec = this.mapOfTextures.get(keyString)!;
			
			for(let i = 0; i < vec.length; i++) {
				let tex : TextureWrapper = vec[i];
				var texInfo = this.infos.get(tex.toString())!;
				if(texInfo.useCount == 0) {
					//console_log("\treusing");
					this.setDefaults(tex.get());
					texInfo.useCount++;
					return tex;
				} else if(texInfo.useCount < 0) {
					throw "error";
				}
			}

			console_log("\tvec doesn't contain an unused ");
			var tex = this._allocTex(key);
			vec.push(tex);
			this.setDefaults(tex.get());
			return tex;
		}
	}
}

type UniformUnion = number | THREE.Vector2 | THREE.Vector3 | THREE.Texture;
type UniformMap = { [uniform: string]: UniformUnion };

interface ShadeOpts {
	releaseFirstInputTex: boolean;
	toScreen?: boolean;
	scale?: THREE.Vector2;
	itype?: THREE.TextureDataType;
	iformat?: THREE.PixelFormat;
	mipmaps?: boolean;
	uniforms?: UniformMap,
	vshaderExtra?: string,
	functions?: string,
}

export class GpuComputeContext {
	private threeJsRenderer : THREE.WebGLRenderer;
	private texturePool = new TexturePool();
	readonly #globalUniforms = new Map<string, UniformUnion>();
	private readonly mesh : THREE.Mesh;
	private readonly scene = new THREE.Scene();


	constructor(threeJsRenderer : THREE.WebGLRenderer) {
		this.threeJsRenderer = threeJsRenderer;
		this.mesh = new THREE.Mesh(geometry);
		this.mesh.position.set(.5, .5, 0);	
		this.scene.add(this.mesh);
	}

	setGlobalUniform(name : string, value : UniformUnion) {
		this.#globalUniforms.set(name, value);
	}

	willNoLongerUse(texture : TextureWrapper) {
		this.texturePool.willNoLongerUse(texture);
	}

	drawToScreen(inputTex : any) : void {
		this.runStraightToScreen([inputTex], `
			vec2 texSize = vec2(textureSize(tex0, 0));
			_out.rgb = texelFetch(tex0, ivec2(tc * texSize), 0).rgb;
			`, {
				releaseFirstInputTex: false
			});
	}

	runStraightToScreen(texs : Array<TextureWrapper>, fshader : string, options : ShadeOpts) : void {
		this.compute_base(texs, fshader, { ...options, toScreen: true });
	}

	run(texs : Array<TextureWrapper>, fshader : string, options : ShadeOpts) : TextureWrapper {
		return this.compute_base(texs, fshader, options)!;
	}

	constructFullFragmentShaderSource(processedOptions : Required<ShadeOpts>, baseSource : string) {
		var uniformsString = "";
		Object.keys(processedOptions.uniforms).forEach(key => {
			var value : UniformUnion = processedOptions.uniforms[key];
			uniformsString += "uniform " + mapType(value) + " " + key + ";";
		});
		
		const fullFragmentShader = uniformsString +
			intro +
			processedOptions.functions +
			"	void shade() {" +
			baseSource +
			outro

		const fullVertexShader = uniformsString +
			vertexShader.replace("%VSHADER_EXTRA%", processedOptions.vshaderExtra)

		return [fullFragmentShader, fullVertexShader];
	}

	private compute_base(texs : Array<TextureWrapper>, fshader : string, options : ShadeOpts) : TextureWrapper | null {
		var processedOptions : Required<ShadeOpts> = {
			releaseFirstInputTex: options.releaseFirstInputTex,
			toScreen: options.toScreen !== undefined ? options.toScreen : false,
			scale: options.scale !== undefined ? options.scale : new THREE.Vector2(1, 1),
			itype: options.itype !== undefined ? options.itype : texs[0].get().type,
			iformat: options.iformat !== undefined ? options.iformat : texs[0].get().format as THREE.PixelFormat,
			mipmaps: options.mipmaps !== undefined ? options.mipmaps : false,
			uniforms: options.uniforms || { },
			vshaderExtra: options.vshaderExtra || "",
			functions: options.functions || "",
		};
		
		//processedOptions.uniforms = new Map<string, UniformUnion>(processedOptions.uniforms);
		for(const [key, value] of this.#globalUniforms) {
			processedOptions.uniforms[key] = value;
		}
		var renderTarget;
		if(options.toScreen) {
			renderTarget = null;
		} else {
			var size = new THREE.Vector2(texs[0].width, texs[0].height);
			size = size.multiply(processedOptions.scale);
			size.x = Math.floor(size.x);
			size.y = Math.floor(size.y);
			
			const key = new TexturePoolKey(size.x, size.y, processedOptions.itype, processedOptions.iformat);
			renderTarget = this.texturePool.get(key);
			const rtTex = renderTarget.get();
			if (processedOptions.mipmaps) {
				rtTex.generateMipmaps = true;
				rtTex.minFilter = THREE.LinearMipmapLinearFilter;
			} else {
				rtTex.generateMipmaps = false;
				rtTex.minFilter = THREE.LinearFilter;
			}
		}


		var i = 0;
		texs.forEach(tex => {
			const name = "tex" + i;
			const tsizeName = "texelSize" + i;
			var texture : TextureWrapper = texs[i];
			processedOptions.uniforms[name] = texture.get();
			const texSize = getTextureSize(texture.get());
			processedOptions.uniforms[tsizeName] = new THREE.Vector2(1.0 / texSize.width, 1.0 / texSize.height);
			i++;
		});

		

		
		var cachedMaterial = programCache[fshader];
		if(!cachedMaterial) {
			const [fshader_complete, vshader_complete] = this.constructFullFragmentShaderSource(processedOptions, fshader);
				const uniformMapForThreeJs: { [uniform: string]: THREE.IUniform } = {};
				for (const [key, value] of Object.entries(processedOptions.uniforms)) {
					uniformMapForThreeJs[key] = new THREE.Uniform(value);
				}
				cachedMaterial = new THREE.ShaderMaterial( {
					uniforms: uniformMapForThreeJs,
					vertexShader: vshader_complete,
					fragmentShader: fshader_complete,
					side: THREE.DoubleSide,
					blending: THREE.NoBlending,
				} );

			programCache[fshader] = cachedMaterial;
		}
		this.mesh.material = cachedMaterial;
		
		var material = cachedMaterial;
		for (const [key, value] of Object.entries(processedOptions.uniforms)) {
			material.uniforms[key].value = value;
		}

		this.threeJsRenderer.setRenderTarget(renderTarget?.getRenderTarget() ?? null);
		this.threeJsRenderer.render(this.scene, camera);

		if(processedOptions.releaseFirstInputTex) {
			this.willNoLongerUse(texs[0]);
		}
		if(renderTarget === null)
			return null;
		return renderTarget;
	}
}
