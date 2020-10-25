import * as THREE from './lib/node_modules/three/src/Three.js';
import { renderer } from './util.js';

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

function unpackTexture(t) {
	if(t.isWebGLRenderTarget)
		return t.texture;
	else return t;
}

export function shade2(texs, fshader, options) {
	options = options || {};
	var processedOptions = {
		disposeFirstInputTex: options.disposeFirstInputTex !== undefined ? options.disposeFirstInputTex : true,
		toScreen: options.toScreen !== undefined ? options.toScreen : false,
		scale: options.scale !== undefined ? options.scale : new THREE.Vector2(1, 1),
	};
	if(processedOptions.toScreen) processedOptions.disposeFirstInputTex = false;
	
	var renderTarget;
	if(options.toScreen) {
		renderTarget = null;
	} else {
		var size = new THREE.Vector2(unpackTexture(texs[0]).image.width, unpackTexture(texs[0]).image.height);
		size = size.multiply(processedOptions.scale);
		renderTarget = new THREE.WebGLRenderTarget(size.x, size.y, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
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

	const fshader_complete = uniformsString + intro + fshader + outro;

	var material = new THREE.ShaderMaterial( {
		uniforms: uniforms,
		vertexShader: document.getElementById( 'vertexShader' ).textContent,
		fragmentShader: fshader_complete,
		side: THREE.DoubleSide,
		blending: THREE.NoBlending
		} );
	var mesh = new THREE.Mesh( geometry, material );

	mesh.position.set(.5, .5, 0);

	var scene = new THREE.Scene();

	scene.add( mesh );

	renderer.setRenderTarget(renderTarget);
	renderer.render(scene, camera);

	material.dispose();

	if(processedOptions.disposeFirstInputTex) {
		texs[0].dispose();
	}
	return renderTarget;
}