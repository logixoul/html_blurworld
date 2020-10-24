import { shade2 } from "./shade";

function blur(tex, options) {
	return shade2([tex], `
		float offset[3] = float[](0.0, 1.3846153846, 3.2307692308);
		float weight[3] = float[](0.2270270270, 0.3162162162, 0.0702702703);
		_out.rgb = vec3(0,0,0);
		_out.rgb = texture2D(tex1, vec2(gl_FragCoord) / 1024.0) * weight[0];
		for (int i=1; i<3; i++) {
			_out.rgb +=
				texture2D(tex1, (vec2(gl_FragCoord) + vec2(0.0, offset[i])) / 1024.0)
					* weight[i];
			_out.rgb +=
				texture2D(tex1, (vec2(gl_FragCoord) - vec2(0.0, offset[i])) / 1024.0)
					* weight[i];
		}
		`, options
	);
}