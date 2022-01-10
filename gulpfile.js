// https://www.typescriptlang.org/docs/handbook/gulp.html

var gulp = require("gulp");
var ts = require("gulp-typescript");
const concat = require('gulp-concat');
var tsProject = ts.createProject("tsconfig.json");

exports.default = function() {
  return tsProject.src()
  	.pipe(tsProject()).js
	.pipe(concat("concatted.js"))
	.pipe(gulp.dest("built"));
};