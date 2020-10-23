import * as THREE from './lib/node_modules/three/src/Three.js';

const intro = `
	varying vec2 vUv;
	vec4 _out;
	vec2 tc;
	//uniform sampler2D tex;
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

export function shade(renderer, texs, fshader) {
	var camera = new THREE.OrthographicCamera( 0, 1, 0, 1, -1000, 1000 );

	var geometry = new THREE.PlaneBufferGeometry();

	var uniforms = {
		time: { value: 0.0 }
	};

	var uniformsString = "";

	var i = 0;
	texs.forEach(tex => {
		const name = "tex" + (i+1);
		uniformsString += "uniform sampler2D " + name + ";";
		uniforms[name] = texs[i];
		i++;
	});

	const fshader_complete = uniformsString + intro + fshader + outro;

	var material = new THREE.ShaderMaterial( {
		uniforms: uniforms,
		vertexShader: document.getElementById( 'vertexShader' ).textContent,
		fragmentShader: fshader_complete,
		side: THREE.DoubleSide
		} );
	var mesh = new THREE.Mesh( geometry, material );

	mesh.position.set(.5, .5, 0);

	var scene = new THREE.Scene();
	var renderTarget = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter});

	scene.add( mesh );

	renderer.setRenderTarget(renderTarget);
	renderer.render(scene, camera);

	return renderTarget.texture;
}