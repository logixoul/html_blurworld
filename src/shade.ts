import * as THREE from '../lib/node_modules/three/src/Three.js';
import { renderer } from './util.js';
import * as util from './util.js';
import { SafeMap } from './SafeMap.js';

export namespace lx {
	export class Texture {
		private actualTextureObj: THREE.Texture;
		private renderTargetObj?: THREE.WebGLRenderTarget;
		get(): THREE.Texture {
			return this.actualTextureObj;
		}
		constructor(param : (THREE.Texture | THREE.WebGLRenderTarget)) {
			var asTex = param as THREE.Texture;
			var asRt = param as THREE.WebGLRenderTarget;
			if(param instanceof THREE.Texture) {
				this.actualTextureObj = asTex;
			} else if(param instanceof THREE.WebGLRenderTarget) {
				this.actualTextureObj = asRt.texture;
				this.renderTargetObj = asRt;
			} else {
				throw "error";
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
}

function mapType(value: THREE.Vector2 | number) {
	if(value as THREE.Vector2)
		return 'vec2';
	else if(value as number)
		return 'float';
	else throw "";
}

const vertexShader : string = `
varying vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
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
	void shade() {
`;

const outro = `
	}
	void main() {
		tc = vUv; // backward compatibility
		_out.a = 1.0f;
		shade();
		gl_FragColor = _out;
	}
`;

var camera = new THREE.OrthographicCamera( 0, 1, 1, 0, -1000, 1000 );

var geometry = new THREE.PlaneBufferGeometry();



type ProgramCache = { [key: string]: THREE.ShaderMaterial };
type MeshCache = { [key: string]: THREE.Mesh };
var programCache : ProgramCache = { };
var meshCache : MeshCache = { };

var scene = new THREE.Scene();

class TextureCacheKey {
	width : number = 0;
	height : number = 0;
	itype : THREE.TextureDataType = 0;
	constructor(w : number, h : number, itype : THREE.TextureDataType) {
		this.width = w;
		this.height = h;
		this.itype = itype;
	}
	toString() : string {
		return this.width + "," + this.height + "," + this.itype;
		//return JSON.stringify(this);
	}
}

class TextureInfo {
	useCount: number = 0;
	key: TextureCacheKey;

	constructor(key : TextureCacheKey) {
		this.key = key;
	}
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
		console.log("allocating texture" + Date.now());
		var tex = new THREE.WebGLRenderTarget(key.width, key.height, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, type: key.itype });
		var texWrapper = new lx.Texture(tex);

		var keyString : string = texWrapper.toString();
		this.infos.set(keyString, new TextureInfo(key));
		this.infos.safeGet(keyString).useCount = 1;

		this.numTexturesDbg++;
		return texWrapper;
	}

	onNoLongerUsingTex(tex : lx.Texture) {
		var info : TextureInfo = this.infos.safeGet(tex.toString());
		info.useCount--;
		if(info.useCount == 0) {
			this.cache.set(info.key.toString(),
				this.cache.safeGet(info.key.toString()).filter((t : lx.Texture) => t !== tex)
			);
			
			tex.dispose();
			this.numTexturesDbg--;
			console.log("disposing texture" + Date.now());
		}
	}

	get(key : TextureCacheKey)
	{
		/*var tex = this._allocTex(key);
		//vec.push(tex);
		this._setDefaults(tex);
		return tex;*/
		console.log("numTexturesDbg = " + this.numTexturesDbg);

		var keyString : string = key.toString();
		const alreadyExists = this.cache.has(keyString);
		if (!alreadyExists) {
			console.log("alreadyExists = " + alreadyExists);
			const tex = this._allocTex(key);
			const vec = [ tex ];
			this.cache.set(keyString, vec);
			this._setDefaults(tex.get());
			return tex;
		}
		else {
			const vec = this.cache.safeGet(keyString);
			
			vec.forEach((tex : lx.Texture) => {
				var texInfo = this.infos.safeGet(tex.toString());
				if(texInfo.useCount == 1) {
					console.log("reusing" + Date.now());
					this._setDefaults(tex.get());
					texInfo.useCount++;
					return tex;
				}
			});

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
	uniforms?: UniformMap,
}

export function shade2(texs : Array<lx.Texture>, fshader : string, options : ShadeOpts) {
	options = options || {};
	//if(options.releaseFirstInputTex === undefined)
	//	throw "For now, you have to specify this manually, always";
	var processedOptions = {
		releaseFirstInputTex: options.releaseFirstInputTex,
		toScreen: options.toScreen !== undefined ? options.toScreen : false,
		scale: options.scale !== undefined ? options.scale : new THREE.Vector2(1, 1),
		itype: options.itype !== undefined ? options.itype : util.unpackTex(texs[0]).type,
		uniforms: options.uniforms || { },
	};
	/*if(processedOptions.releaseFirstInputTex === undefined) {
		throw "error";
	}*/

	var renderTarget;
	if(options.toScreen) {
		renderTarget = null;
	} else {
		var size = new THREE.Vector2(util.unpackTex(texs[0]).image.width, util.unpackTex(texs[0]).image.height);
		size = size.multiply(processedOptions.scale);
		
		const key = new TextureCacheKey(size.x, size.y, processedOptions.itype);
		renderTarget = textureCache.get(key);
		//renderTarget.texture.generateMipmaps = util.unpackTex(texs[0]).generateMipmaps;
	}

	var params : THREE.ShaderMaterialParameters = {
		uniforms: {
			time: { value: 0.0 }
		}
	};

	var uniformsString = "";

	var i = 0;
	texs.forEach(tex => {
		const name = "tex" + (i+1);
		const tsizeName = "tsize" + (i+1);
		uniformsString += "uniform sampler2D " + name + ";";
		uniformsString += "uniform vec2 " + tsizeName + ";";
		var texture : THREE.Texture = texs[i].get();
		params.uniforms![name] = { value: texture };
		params.uniforms![tsizeName] = { value: new THREE.Vector2(1.0 / texture.image.width, 1.0 / texture.image.height) };
		i++;
	});

	Object.keys(processedOptions.uniforms).forEach(key => {
		const value=processedOptions.uniforms[key];
		uniformsString += "uniform " + mapType(value.value) + " " + key + ";";
		params.uniforms![key] = { value: value };
	});

	const fshader_complete = uniformsString + intro + fshader + outro;
	var cachedMaterial = programCache[fshader_complete];
	var cachedMesh = meshCache[fshader_complete];
	if(!cachedMaterial) {
		cachedMaterial = new THREE.ShaderMaterial( {
			uniforms: params.uniforms,
			vertexShader: vertexShader,
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
	//material.uniforms = { ...material.uniforms, ...uniforms };
	//uniforms.forEach(u => material.uniforms[u.
	for (const [key, value] of Object.entries(params.uniforms!)) { // todo: is the "!" necessary?
		material.uniforms[key] = value;
	}

	mesh.position.set(.5, .5, 0);

	

	scene.add( mesh );

	renderer.setRenderTarget(renderTarget);
	renderer.render(scene, camera);

	scene.remove( mesh );

	//material.dispose();

	if(processedOptions.releaseFirstInputTex) {
		textureCache.onNoLongerUsingTex(texs[0]);
		//texs[0].dispose();
	}
	return renderTarget;
}