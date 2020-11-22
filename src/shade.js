import * as THREE from '../lib/node_modules/three/src/Three.js';
import { renderer } from './util.js';
import * as util from './util.js';

function mapType(value) {
	if(value.isVector2)
		return 'vec2';
	else if(typeof value === 'number')
		return 'float';
	else throw "";
}
	

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



var programCache = { };
var meshCache = { };

var scene = new THREE.Scene();

class TextureCacheKey {
	width = 0;
	height = 0;
	itype = 0;
	constructor(w, h, itype) {
		this.width = w;
		this.height = h;
		this.itype = itype;
	}
	toString() {
		return this.width + "," + this.height + "," + this.itype;
	}
}

class TextureCache {
	cache = { }

	_setDefaults(tex) {
		/*tex->setMinFilter(GL_LINEAR);
		tex->setMagFilter(GL_LINEAR);
		tex->setWrap(GL_CLAMP_TO_EDGE, GL_CLAMP_TO_EDGE);*/
	}

	numTexturesDbg = 0;

	_allocTex(key) {
		console.log("allocating texture" + Date.now());
		var tex = new THREE.WebGLRenderTarget(key.width, key.height, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, type: key.itype });
		tex.lxUseCount = 1; // monkey-patching
		tex.lxKey = key; // monkey-patching
		this.numTexturesDbg++;
		return tex;
	}

	onNoLongerUsingTex(tex) {
		tex.lxUseCount--;
		if(tex.lxUseCount == 0) {
			this.cache[tex.lxKey.toString()] = this.cache[tex.lxKey.toString()].filter(t => t !== tex);
			
			tex.dispose();
			this.numTexturesDbg--;
			console.log("disposing texture" + Date.now());
		}
	}

	get(key)
	{
		/*var tex = this._allocTex(key);
		//vec.push(tex);
		this._setDefaults(tex);
		return tex;*/
		console.log("numTexturesDbg = " + this.numTexturesDbg);

		const keyString = key.toString();
		const alreadyExists = this.cache.hasOwnProperty(keyString);
		if (!alreadyExists) {
			console.log("alreadyExists = " + alreadyExists);
			const tex = this._allocTex(key);
			const vec = [ tex ];
			this.cache[keyString] = vec;
			this._setDefaults(tex);
			return tex;
		}
		else {
			const vec = this.cache[keyString];
			
			vec.forEach(tex => {
				if(tex.lxUseCount == 1) { // todo
					console.log("reusing" + Date.now());
					this._setDefaults(tex);
					tex.lxUseCount++;
					return tex;
				}
			});

			var tex = this._allocTex(key);
			vec.push(tex);
			this._setDefaults(tex);
			return tex;
		}
	}
}

export var textureCache = new TextureCache();

export function shade2(texs, fshader, options) {
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
	if(processedOptions.releaseFirstInputTex === undefined) {
		throw "error";
	}

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

	var uniforms = {
		time: { value: 0.0 }
	};

	var uniformsString = "";

	var i = 0;
	texs.forEach(tex => {
		const name = "tex" + (i+1);
		const tsizeName = "tsize" + (i+1);
		uniformsString += "uniform sampler2D " + name + ";";
		uniformsString += "uniform vec2 " + tsizeName + ";";
		var texture = texs[i];
		if(texture.isWebGLRenderTarget)
			texture = texture.texture;
		uniforms[name] = { value: texture };
		uniforms[tsizeName] = { value: new THREE.Vector2(1.0 / texture.image.width, 1.0 / texture.image.height) };
		i++;
	});

	Object.keys(processedOptions.uniforms).forEach(key => {
		const value=processedOptions.uniforms[key];
		uniformsString += "uniform " + mapType(value) + " " + key + ";";
		uniforms[key] = { value: value };
	});

	const fshader_complete = uniformsString + intro + fshader + outro;
	var cachedMaterial = programCache[fshader_complete];
	var cachedMesh = meshCache[fshader_complete];
	if(!cachedMaterial) {
		cachedMaterial = new THREE.ShaderMaterial( {
			uniforms: uniforms,
			vertexShader: document.getElementById( 'vertexShader' ).textContent,
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
	for (const [key, value] of Object.entries(uniforms)) {
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