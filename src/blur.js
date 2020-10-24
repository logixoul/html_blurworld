import { shade2 } from "./shade.js";

export function blur(tex, options) {
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
		`, options
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
	`, options
	);
	return tex;
}
