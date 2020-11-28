// https://www.typescriptlang.org/docs/handbook/gulp.html

var gulp = require("gulp");
var ts = require("gulp-typescript");
const concat = require('gulp-concat');
var tsProject = ts.createProject("tsconfig.json");

exports.buildLibs = function() {
	return gulp.src(['lib/**/*.js'])
		.pipe(concat("concattedLibs.js"))
		.pipe(gulp.dest('built'));
}

exports.buildApp = function() {
  /*return tsProject.src()
  	.pipe(tsProject()).js
	.pipe(concat("concatted.js"))
	.pipe(gulp.dest("built"));*/

	// https://www.npmjs.com/package/gulp-typescript
	return gulp.src(['src/**/*.ts', 'build/concattedLibs.js'])
        .pipe(ts({
            noImplicitAny: true,
			outFile: 'output.js',
			"allowJs": true,
			"target": "es2017",
			"noEmitOnError": true,
			"strict": true,
			"moduleResolution": "node",
        }))
        .pipe(gulp.dest('built'));
};

//exports.default = series(exports.buildLibs, exports.buildApp);