import * as THREE from 'three';
import { renderer } from './util';
import * as util from './util';
import { SafeMap } from './SafeMap';
import * as System from './System';

export type TextureUnion = (THREE.Texture | THREE.WebGLRenderTarget | lx.Texture);

export namespace lx {
	export class Texture {
		private actualTextureObj: THREE.Texture;
		private renderTargetObj?: THREE.WebGLRenderTarget;
		get(): THREE.Texture {
			return this.actualTextureObj;
		}
		getRenderTarget(): THREE.WebGLRenderTarget {
			if(this.renderTargetObj === undefined)
				throw "error";
			return this.renderTargetObj;
		}
		constructor(param : TextureUnion) {
			var asTex = param as THREE.Texture;
			var asRt = param as THREE.WebGLRenderTarget;
			if(param instanceof THREE.Texture) {
				this.actualTextureObj = asTex;
			} else if(param instanceof THREE.WebGLRenderTarget) {
				this.actualTextureObj = asRt.texture;
				this.renderTargetObj = asRt;
			} else if(param instanceof lx.Texture) {
				var asLxTex = param as lx.Texture;
				this.actualTextureObj = asLxTex.actualTextureObj;
				this.renderTargetObj = asLxTex.renderTargetObj;
			} else {
				throw "error";
			}
		}
		toString() {
			return this.actualTextureObj.id.toString();
		}
		willNoLongerUse() {
			textureCache.onNoLongerUsingTex(this);
		}
		dispose() {
			if(this.renderTargetObj !== undefined) {
				this.renderTargetObj.dispose();
			} else {
				this.actualTextureObj.dispose();
			}
		}
	}
}

function mapType(value: any) {
	if(value instanceof THREE.Vector3)
		return 'vec3';
	if(value instanceof THREE.Vector2)
		return 'vec2';
	else if(typeof value === "number")
		return 'float';
	else if(value.isTexture) {
		return 'sampler2D';
	}
	else throw "error";
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
	vec4 fetch4(sampler2D tex_, vec2 tc_) {
		return texture2D(tex_, tc_).rgba;
	}
	vec3 fetch3(sampler2D tex_, vec2 tc_) {
		return texture2D(tex_, tc_).rgb;
	}
	vec2 fetch2(sampler2D tex_, vec2 tc_) {
		return texture2D(tex_, tc_).rg;
	}
	float fetch1(sampler2D tex_, vec2 tc_) {
		return texture2D(tex_, tc_).r;
	}
	vec4 fetch4(sampler2D tex_) {
		return texture2D(tex_, tc).rgba;
	}
	vec3 fetch3(sampler2D tex_) {
		return texture2D(tex_, tc).rgb;
	}
	vec2 fetch2(sampler2D tex_) {
		return texture2D(tex_, tc).rg;
	}
	float fetch1(sampler2D tex_) {
		return texture2D(tex_, tc).r;
	}
	vec4 fetch4() {
		return texture2D(tex1, tc).rgba;
	}
	vec3 fetch3() {
		return texture2D(tex1, tc).rgb;
	}
	vec2 fetch2() {
		return texture2D(tex1, tc).rg;
	}
	float fetch1() {
		return texture2D(tex1, tc).r;
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

var scene = new THREE.Scene();

class TextureCacheKey {
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
		return "TextureCacheKey(width=" + this.width + ", height=" + this.height + ", itype=" + this.itype + ", iformat=" + this.iformat + ")";
	}
}

class TextureInfo {
	useCount: number = 0;
	key: TextureCacheKey;

	constructor(key : TextureCacheKey) {
		this.key = key;
	}
}

function console_log(s : string) {
	//console.log(s);
}

class TextureCache {
	cache = new SafeMap<string, Array<lx.Texture>>(); // key obtained by TextureCacheKey.toString()
	infos = new SafeMap<string, TextureInfo>(); // key obtained by lx.Texture.toString()

	_setDefaults(tex : THREE.Texture) {
		/*tex->setMinFilter(GL_LINEAR);
		tex->setMagFilter(GL_LINEAR);
		tex->setWrap(GL_CLAMP_TO_EDGE, GL_CLAMP_TO_EDGE);*/
	}

	numTexturesDbg = 0;

	_allocTex(key : TextureCacheKey) : lx.Texture {
		var tex = new THREE.WebGLRenderTarget(key.width, key.height, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, type: key.itype, format: key.iformat });
		var texWrapper = new lx.Texture(tex);

		var keyString : string = texWrapper.toString();
		let textureInfo = new TextureInfo(key);
		this.infos.set(keyString, textureInfo);
		textureInfo.useCount = 1;

		this.numTexturesDbg++;
		return texWrapper;
	}

	onNoLongerUsingTex(tex : lx.Texture) {
		var info : TextureInfo | undefined = this.infos.get(tex.toString());
		if(info === undefined) {
			console.assert(tex.get() instanceof THREE.DataTexture);
			// `tex` has not been created by TextureCache and is not managed by it.
			// Since `onNoLongerUsingTex()` has been called, the user tells us that he no longer needs that texture so
			// it's safe to just dispose it.
			tex.dispose();
			return;
		}
		console.assert(info.useCount > 0);
		info.useCount--;
	}

	get(key : TextureCacheKey)
	{
		/*var tex = this._allocTex(key);
		//vec.push(tex);
		this._setDefaults(tex);
		return tex;*/
		var keyString : string = key.toString();
		console_log("get(" + key.toPrettyString() + "):");

		console_log("\tnumTexturesDbg = " + this.numTexturesDbg);

		const alreadyExists = this.cache.has(keyString);
		console_log("\talreadyExists = " + alreadyExists);
		if (!alreadyExists) {
			console_log("\tcachemap doesn't have anything for this key. allocating texture");
			const tex = this._allocTex(key);
			const vec = [ tex ];
			this.cache.set(keyString, vec);
			this._setDefaults(tex.get());
			return tex;
		}
		else {
			const vec = this.cache.checkedGet(keyString);
			
			for(let i = 0; i < vec.length; i++) {
				let tex : lx.Texture = vec[i];
				var texInfo = this.infos.checkedGet(tex.toString());
				if(texInfo.useCount == 0) {
					//console_log("\treusing");
					this._setDefaults(tex.get());
					texInfo.useCount++;
					return tex;
				} else if(texInfo.useCount < 0) {
					throw "error";
				}
			}

			console_log("\tvec doesn't contain an unused ");
			var tex = this._allocTex(key);
			vec.push(tex);
			this._setDefaults(tex.get());
			return tex;
		}
	}
}

export var textureCache = new TextureCache();

type UniformMap = { [uniform: string]: THREE.IUniform };

interface ShadeOpts {
	releaseFirstInputTex: boolean;
	toScreen?: boolean;
	scale?: THREE.Vector2;
	itype?: THREE.TextureDataType;
	iformat?: THREE.PixelFormat;
	uniforms?: UniformMap,
	vshaderExtra?: string,
	lib?: string,
	dispose?: Array<TextureUnion>,
}

export function shade2(texs : Array<TextureUnion>, fshader : string, options : ShadeOpts) : lx.Texture | null {
	const wrappedTexs = texs.map(t => new lx.Texture(t));


	var processedOptions = {
		releaseFirstInputTex: options.releaseFirstInputTex,
		toScreen: options.toScreen !== undefined ? options.toScreen : false,
		scale: options.scale !== undefined ? options.scale : new THREE.Vector2(1, 1),
		itype: options.itype !== undefined ? options.itype : wrappedTexs[0].get().type,
		iformat: options.iformat !== undefined ? options.iformat : wrappedTexs[0].get().format as THREE.PixelFormat,
		uniforms: options.uniforms || { },
		vshaderExtra: options.vshaderExtra || "",
		lib: options.lib || "",
		dispose: options.dispose || []
	};
	const wrappedTexsToDispose : Array<lx.Texture> = [];
	if(options.dispose !== undefined) {
		for(const t of options.dispose) {
			wrappedTexsToDispose.push(new lx.Texture(t));
		}
	}
	
	var renderTarget;
	if(options.toScreen) {
		renderTarget = null;
	} else {
		const baseSize = getTextureSize(wrappedTexs[0].get());
		var size = new THREE.Vector2(baseSize.width, baseSize.height);
		size = size.multiply(processedOptions.scale);
		size.x = Math.floor(size.x);
		size.y = Math.floor(size.y);
		
		const key = new TextureCacheKey(size.x, size.y, processedOptions.itype, processedOptions.iformat);
		renderTarget = textureCache.get(key);
		//renderTarget.texture.generateMipmaps = util.unpackTex(texs[0]).generateMipmaps;
	}


	let mousePos = System.getMousePos();
	//mousePos.divide(new THREE.Vector2(window.innerWidth, window.innerHeight));
	var params : THREE.ShaderMaterialParameters = {
		uniforms: {
			time: { value: 0.0 },
			mouse: { value: mousePos },
		}
	};
	
	//console.log("params.uniforms before adding texs and user uniforms: ", params.uniforms?.mouse.value);

	var uniformsString = "";

	var i = 0;
	texs.forEach(tex => {
		const name = "tex" + (i+1);
		const tsizeName = "tsize" + (i+1);
		//uniformsString += "uniform sampler2D " + name + ";";
		//uniformsString += "uniform vec2 " + tsizeName + ";";
		var texture : THREE.Texture = wrappedTexs[i].get();
		params.uniforms![name] = { value: texture };
		const texSize = getTextureSize(texture);
		params.uniforms![tsizeName] = { value: new THREE.Vector2(1.0 / texSize.width, 1.0 / texSize.height) };
		i++;
	});

	Object.keys(processedOptions.uniforms).forEach(key => {
		var value=processedOptions.uniforms[key];
		params.uniforms![key] = { value: value };
	});
	Object.keys(params.uniforms!).forEach(key => { // todo: do i need the '!'?
		var value=params.uniforms![key].value;
		// for things like `uniforms: { mul: new THREE.Uniform(amount) }`
		if(value instanceof THREE.Uniform) { // todo: improve this ugliness
			value = value.value;
			params.uniforms![key].value = value;
		}
		uniformsString += "uniform " + mapType(value) + " " + key + ";";
	});

	const fshader_complete = uniformsString + intro + processedOptions.lib + "	void shade() {" + fshader + outro;
	var cachedMaterial = programCache[fshader_complete];
	var cachedMesh = meshCache[fshader_complete];
	if(!cachedMaterial) {
		cachedMaterial = new THREE.ShaderMaterial( {
			uniforms: params.uniforms,
			vertexShader: uniformsString + vertexShader.replace("%VSHADER_EXTRA%", processedOptions.vshaderExtra),
			fragmentShader: fshader_complete,
			side: THREE.DoubleSide,
			blending: THREE.NoBlending
			} );
		cachedMesh = new THREE.Mesh( geometry, cachedMaterial );

		programCache[fshader_complete] = cachedMaterial;
		meshCache[fshader_complete] = cachedMesh;
	}
	var material = cachedMaterial;
	var mesh = cachedMesh;
	for (const [key, value] of Object.entries(params.uniforms!)) { // todo: is the "!" necessary?
		material.uniforms[key] = value;
	}

	mesh.position.set(.5, .5, 0);	

	scene.add( mesh );

	renderer.setRenderTarget(renderTarget?.getRenderTarget() ?? null);
	renderer.render(scene, camera);

	scene.remove( mesh );

	if(processedOptions.releaseFirstInputTex) {
		textureCache.onNoLongerUsingTex(wrappedTexs[0]);
	}
	for(const t of wrappedTexsToDispose) {
		textureCache.onNoLongerUsingTex(t);
	}
	if(renderTarget === null)
		return null;
	return new lx.Texture(renderTarget);
}
