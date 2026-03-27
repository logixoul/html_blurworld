import { TextureWrapper, GpuComputeContext } from './GpuCompute'
import * as THREE from 'three'
import { ImageProcessor } from './ImageProcessor';
import { PoissonSolverViaGaussians } from './PoissonSolver';

export type TonemappingOptions = {
    strength: number;
    brightness: number;
    globalContrast: number;
};

export class Tonemapper {
    private readonly imageProcessor : ImageProcessor;

    constructor(private readonly compute : GpuComputeContext, private readonly renderer : THREE.WebGLRenderer) {
        this.imageProcessor = new ImageProcessor(compute);
    }

    tonemap(hdrInput: TextureWrapper, options: TonemappingOptions): TextureWrapper {
        const beginning = Date.now();
        /*if(this.solutionExpColored != null)
            this.compute.willNoLongerUse(this.solutionExpColored);
        
    */
        let texturesToRelease: TextureWrapper[] = [];
        //if(this.texToDisplay != null)
        //this.compute.willNoLongerUse(this.texToDisplay);
        const L = this.compute.run([hdrInput],
            `_out.r = dot(texture().rgb, vec3(0.2126, 0.7152, 0.0722));`
            , {
                releaseFirstInputTex: false,
                iformat: THREE.RedFormat
            }
        );
        texturesToRelease.push(L);
        const Llog = this.compute.run([L], `_out.r = log(texture().r+1e-5);`, {
            releaseFirstInputTex: false
        });
        texturesToRelease.push(Llog);

        const Llog_gradForward = this.imageProcessor.gradientForward(Llog, false);
        texturesToRelease.push(Llog_gradForward);

        // I should be using gradientCentral here but it creates weird artifacts
        //const Llog_gradCentral = this.imageProcessor.gradientCentral(Llog, false);
        //texturesToRelease.push(Llog_gradCentral);

        const Llog_gradCompressed = this.compute.run([Llog_gradForward], `
                vec2 gradForward = texture().xy;
                float mag = length(gradForward);

                float magComp = pow(mag, strength);
                _out.xy = gradForward * (magComp / (mag+1e-4));
                `, {
            releaseFirstInputTex: false,
            uniforms: {
                strength: options.strength,
                //gradCentralTex: Llog_gradCentral.get(),
            }
        }
        );
        texturesToRelease.push(Llog_gradCompressed)

        const Llog_gradCompressedDivergence = this.imageProcessor.divBackward(Llog_gradCompressed,
            false
        );
        texturesToRelease.push(Llog_gradCompressedDivergence);
        //const Llog_gradCompressedDivergence01 = this.imageProcessor.to01_cut(this.renderer, Llog_gradCompressedDivergence, 0, 100, false);
        //texturesToRelease.push(Llog_gradCompressedDivergence01);

        const poissonSolver = new PoissonSolverViaGaussians(this.compute, this.renderer);

        const solution = poissonSolver.run(Llog_gradCompressedDivergence, false);
        texturesToRelease.push(solution);
        const solution01 = this.imageProcessor.to01_cut(this.renderer, solution, 0.0, 100.0, false);
        const solution01Exp = this.compute.run([solution01], `
                _out.r = exp(texture().r);
                const float min_ = exp(0.0);
                const float max_ = exp(1.0);
                _out.r = (_out.r - min_) / (max_ - min_);
                `,
            {
                releaseFirstInputTex: false
            });
        texturesToRelease.push(solution01Exp);

        //if (Math.floor(Date.now() / 800) % 2 == 1) {
        const solutionExpColored = this.compute.run([solution01Exp, hdrInput, L], `
                float solutionExp = texture(tex1).r;
                vec3 origColor = texture(tex2).rgb;
                float origL = texture(tex3).r;
                float solutionExpCorrected = pow(solutionExp, 1.0/brightness);
                //vec3 origColorL1 = origColor / origL
                _out.rgb = origColor * (solutionExpCorrected / (origL+1e-3));
                _out.r = mulContrastize(_out.r, globalContrast);
                _out.g = mulContrastize(_out.g, globalContrast);
                _out.b = mulContrastize(_out.b, globalContrast);
                _out.rgb = sqrt(_out.rgb);
                `,
            {
                releaseFirstInputTex: false,
                iformat: THREE.RGBAFormat,
                itype: THREE.UnsignedByteType,
                resultSize: new THREE.Vector2(window.innerWidth, window.innerHeight),
                uniforms: {
                    brightness: options.brightness,
                    globalContrast: options.globalContrast,
                },
                functions: `
                            float mulContrastize(float i, float power) {
                                i = clamp(i, 0.0, 1.0);
                                if (i < .5) return pow(i * 2.0, power) / 2.0;
                                i = 1.0 - i;
                                return 1.0 - pow(i * 2.0, power) / 2.0;
                            }
                        `
            });
        const texToDisplay = this.imageProcessor.to01_cut(this.renderer, solutionExpColored, 0.0, 100.0, true);

        console.log("Tonemapping took ", Date.now() - beginning);
        texturesToRelease.forEach(t => this.compute.willNoLongerUse(t));

        return texToDisplay;
    }
}