import { shade2 } from "./shade.js";
import * as util from "./util.js";

export class Image {
	data;
	width;
	height;

	constructor(width, height, arrayType) {
		this.width = width;
		this.height = height;
		this.data = new arrayType(width * height);
	}

	forEach(callback) {
		for(var x = 0; x < this.width; x++) {
			for(var y = 0; y < this.height; y++) {
				callback(x, y);
			}
		}
	}

	get(x, y) { return this.data[x + y * this.width]; }
	set(x, y, val) { this.data[x + y * this.width] = val; }
};

export function blur(tex, width) {
	if(width === undefined) width = .45;
	tex = shade2([tex], `
		float offset[3] = float[](0.0, 1.3846153846, 3.2307692308);
		float weight[3] = float[](0.2270270270, 0.3162162162, 0.0702702703);
		_out = texture(tex1, tc) * weight[0];
		for (int i=1; i<3; i++) {
			_out +=
				texture(tex1, tc + vec2(0.0, offset[i]) * tsize1 * width)
					* weight[i];
			_out +=
				texture(tex1, tc - vec2(0.0, offset[i]) * tsize1 * width)
					* weight[i];
		}
		_out.a = 1.0f;
		`
		, { uniforms: { width: width } }
	);
	tex = shade2([tex], `
		float offset[3] = float[](0.0, 1.3846153846, 3.2307692308);
		float weight[3] = float[](0.2270270270, 0.3162162162, 0.0702702703);
		_out = texture(tex1, tc) * weight[0];
		for (int i=1; i<3; i++) {
			_out +=
				texture(tex1, tc + vec2(offset[i], 0.0) * tsize1 * width)
					* weight[i];
			_out +=
				texture(tex1, tc - vec2(offset[i], 0.0) * tsize1 * width)
					* weight[i];
		}
		_out.a = 1.0f;
	`
	, { uniforms: { width: width } }
	);
	return tex;
}

export function blurIterated(tex, iterations) {
	for(var i = 0; i < iterations; i++) {
		tex = blur(tex);
	}
	return tex;
}

export function extrude(inTex) {
	const iters = 30;
	var state = util.cloneTex(inTex);
	//var orig = shade2(inTex, `_out = fetch4();`, { disposeFirstInputTex: false});
	for(var i = 0; i < iters; i++)
	{
		state = blur(state, 1.0);
		state = shade2([state, inTex], `
			float state = fetch1(tex1);
			float binary = fetch1(tex2);
			state *= binary;
			state += binary;
			_out.r = state;`
			);
		/*state = shade2([state, inTex],`
			float state = fetch1(tex1);
			float binary = fetch1(tex2);
			state += binary;
			_out.r = state*;`
			);*/
	}
	return state;
}
