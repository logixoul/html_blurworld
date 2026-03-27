import { GpuComputeContext, TextureWrapper } from "./GpuCompute";
import { getMean, ImageProcessor } from "./ImageProcessor";
import * as THREE from "three"


export function weightsForInvLaplacianFromSigmas(sigmas: number[]): number[] {
  const K = sigmas.length;
  if (K < 2) throw new Error("Need at least 2 sigmas.");

  // t_i = 0.5 * sigma^2
  const t = sigmas.map(s => 0.5 * s * s);

  const w = new Array<number>(K);

  for (let i = 0; i < K; i++) {
    let dt: number;
    if (i === 0) dt = 0.5 * (t[1] - t[0]);
    else if (i === K - 1) dt = 0.5 * (t[K - 1] - t[K - 2]);
    else dt = 0.5 * (t[i + 1] - t[i - 1]);

    // Δu = b  => û = -b̂/k^2
    w[i] = -dt;
  }
  return w;
}

export const GAUSS_EPS = 0.05;

function calcSigmas(imageWidth: number, imageHeight: number) {
    const maxRadius = .4*Math.min(imageWidth, imageHeight);
    //const maxDiameter = 2 * maxRadius + 1;

    const sigmaMin = 0.5;
    const sigmaMax = sigmaFromRadius(maxRadius, GAUSS_EPS);
    const gaussiansCount = 11; // "K"
    const totalMultiplier = sigmaMax/sigmaMin;
    // log_mulPerLevel(totalMultiplier) = 20
    // mulPerLevel^20 = totalMultiplier
    const multiplierPerLevel = Math.pow(totalMultiplier, 1.0 / gaussiansCount);
    let sigmas : number[] = [];
    let currentSigma = sigmaMin;
    //sigmas.push(0); // for the base level
    for(let i = 0; i < gaussiansCount; i++) {
        sigmas.push(currentSigma);
        currentSigma *= multiplierPerLevel;
    }
    return sigmas;
}

export function radiusFromSigma(sigma: number, eps = 1e-3): number {
  // eps is the relative kernel value at the edge vs center.
  // eps=1e-3 is common; eps=1e-4 is stricter.
  if (!(sigma >= 0)) throw new Error("sigma must be >= 0");
  if (!(eps > 0 && eps < 1)) throw new Error("eps must be in (0,1)");
  const r = sigma * Math.sqrt(2 * Math.log(1 / eps));
  return Math.floor(r);
}

export function sigmaFromRadius(radius: number, eps = 1e-3): number {
  // eps is the relative kernel value at the edge vs center.
  // eps=1e-3 is common; eps=1e-4 is stricter.
  if (!(radius > 0)) throw new Error("radius must be > 0");
  if (!(eps > 0 && eps < 1)) throw new Error("eps must be in (0,1)");
  const sigma = radius / Math.sqrt(2 * Math.log(1 / eps));
  return sigma;
}

export class PoissonSolverViaGaussians {
    private imageProcessor : ImageProcessor;
    constructor(private compute: GpuComputeContext, private renderer : THREE.WebGLRenderer) {
        this.imageProcessor = new ImageProcessor(this.compute);
    }

    run(inTex : TextureWrapper, releaseFirstInputTex: boolean) {
        /*inTex.get().minFilter = THREE.LinearMipmapLinearFilter;
        let inTexWithMean0 = this.compute.run(inTex, `
            vec2 texSize = vec2(textureSize(tex1, 0));
            int lastLod = int(floor(log2(max(texSize.x, texSize.y)))) - 1;
            _out.r = texture().r - texelFetch(tex1, ivec2(0, 0), lastLod).r;
            `, {
            releaseFirstInputTex: false
        })*/
        //const mean = getMean(downloadGpuData(this.renderer, inTex.getRenderTarget()));
        const inTexWithMean0 = this.compute.run([inTex], `
            _out.r = texture().r-mean;
            `,
            {
                releaseFirstInputTex: false,
                uniforms: {
                    mean: 0//mean
                },
                itype: THREE.HalfFloatType,
            }
        )

        const sigmas = calcSigmas(inTex.width, inTex.height);
        const weights = weightsForInvLaplacianFromSigmas(sigmas);
        //console.log("calced weights ", weights)

        const pyramid = this.imageProcessor.makeGaussianPyramid(inTexWithMean0, true);

        //inTexWithMean0.get().wrapS = inTexWithMean0.get().wrapT = THREE.ClampToEdgeWrapping;
        //let sum = this.compute.run([inTexWithMean0], `_out.r = 0.0;`, { releaseFirstInputTex: false });

        const OPT = true;
            //(document.getElementById("cbOpt") as HTMLInputElement).checked;

        let accumulators = Array<TextureWrapper | null>(pyramid.length).fill(null);
        for(let i = 0; i < sigmas.length; i++) {
            let sigma = sigmas[i];
            const weight = weights[i];
            let level = 0;
            let radius = radiusFromSigma(sigma, GAUSS_EPS);
            if (OPT) {
                const maxRadius = 5;
                while (radius > maxRadius) {
                    const multiplier = pyramid[level + 1].width / pyramid[level].width;
                    radius = radius * multiplier;
                    sigma *= multiplier;
                    level++;
                }
                radius = Math.ceil(radius);
            }
            const blurred = this.imageProcessor.gaussianBlurSeparable(pyramid[level], radius * 2 + 1, sigma, weight, false);
            if(accumulators[level] == null) {
                accumulators[level] = blurred;
                //console.log(`assigning accumulator(${accumulators[level]?.size.toArray()})`);
            } else {
                //console.log(`blitting blurred(${blurred.size.toArray()}) to accumulator(${accumulators[level]?.size.toArray()})`)
                accumulators[level] = this.compute.run([accumulators[level]!, blurred], `
                    _out.r = texture().r + texture(tex2).r;
                    `, { releaseFirstInputTex: true, });
                //this.compute.willNoLongerUse(blurred);
            }
            
            //this.compute.willNoLongerUse(blurred);
        }
        accumulators = accumulators.filter(a => a != null);
        //return accumulators[2];
        for(let i = accumulators.length - 1; i >= 1; i--) {
            //console.log(`upsampling accumulator(${accumulators[i]?.size.toArray()})`);
            accumulators[i-1] = this.compute.run([accumulators[i-1]!, accumulators[i]!], `
                _out.r = texture().r + texture(tex2).r;
                `, { releaseFirstInputTex: true, });
            this.compute.willNoLongerUse(accumulators[i]!);
        }
        if(releaseFirstInputTex) {
            this.compute.willNoLongerUse(inTex);
        }
        for (const lvl of pyramid) {
            this.compute.willNoLongerUse(lvl);
        }
        return accumulators[0]!;
    }
}