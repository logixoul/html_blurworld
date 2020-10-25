import { shade2 } from "./shade.js";

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

export function blur(tex) {
	tex = shade2([tex], `
		float offset[3] = float[](0.0, 1.3846153846, 3.2307692308);
		float weight[3] = float[](0.2270270270, 0.3162162162, 0.0702702703);
		_out = texture(tex1, tc) * weight[0];
		for (int i=1; i<3; i++) {
			_out +=
				texture(tex1, tc + vec2(0.0, offset[i]) * tsize1)
					* weight[i];
			_out +=
				texture(tex1, tc - vec2(0.0, offset[i]) * tsize1)
					* weight[i];
		}
		_out.a = 1.0f;
		`
	);
	tex = shade2([tex], `
		float offset[3] = float[](0.0, 1.3846153846, 3.2307692308);
		float weight[3] = float[](0.2270270270, 0.3162162162, 0.0702702703);
		_out = texture(tex1, tc) * weight[0];
		for (int i=1; i<3; i++) {
			_out +=
				texture(tex1, tc + vec2(offset[i], 0.0) * tsize1)
					* weight[i];
			_out +=
				texture(tex1, tc - vec2(offset[i], 0.0) * tsize1)
					* weight[i];
		}
		_out.a = 1.0f;
	`
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
	const iters = 20;
	var state = cloneTex(inTex);
	//var orig = shade2(inTex, `_out = fetch4();`, { disposeFirstInputTex: false});
	for(var i = 0; i < iters; i++)
	{
		var state = ImgProc.blur(state);
		state = shade2([state, inTex],
			`float state = fetch1(tex1);
			float binary = fetch1(tex2);
			state *= binary;
			_out.r = state;`
			, { disposeFirstInputTex: true }
			);
		state = shade2([state, inTex],`
			float state = fetch1(tex1);
			float binary = fetch1(tex2);
			state += binary;
			_out.r = state;`
			, { disposeFirstInputTex: true }
			);
	}
	return state;
}
