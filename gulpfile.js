var gulp = require('gulp');
var vulcanize = require('gulp-vulcanize');
var crisper = require('gulp-crisper');
var jeditor = require("gulp-json-editor");
var path = require("path");

// gulp.task('vulcanize', function() {
//   return gulp.src([
//       'public/index.html',
//     ])
//     .pipe(vulcanize({
//       abspath: path.resolve('public'),
//       inputUrl: '/index.html',
//       stripComments: true,
//       inlineScripts: true,
//       inlineCss: true
//     }))
//     .pipe(crisper())
//     .pipe(gulp.dest('build'));
// });

gulp.task('vulcanize', function() {
  gulp.src('public/index.html')
    .pipe(vulcanize({
      abspath: path.resolve('public'),
      inputUrl: '/index.html',
      stripExcludes: false,
      inlineScripts: true,
      inlineCss: true,
      implicitStrip: true,
      stripComments: true
    }))
    .pipe(crisper())
    .pipe(gulp.dest('build'));

  gulp.src(['public/src/*.html', '!public/src/my-app.html'])
    .pipe(vulcanize({
        excludes: [
            './public/bower_components/polymer/polymer.html'
        ],
        stripExcludes: [
            './public/bower_components/polymer/polymer.html'
        ],
        inlineScripts: true,
        inlineCss: true,
        implicitStrip: true,
        stripComments: true
    }))
    .pipe(crisper())
    .pipe(gulp.dest("build/src"));
});

gulp.task('includes',function(){
  return gulp.src([
      'public/images/*',
      'public/manifest.json',
      'public/bower_components/polymer/polymer.html',
      'public/bower_components/polymer/polymer-mini.html',
      'public/bower_components/polymer/polymer-micro.html'
  ], { base: 'public' }) 
    .pipe(gulp.dest('build'));
});

gulp.task('dev',function(){
  return gulp.src('config.json')
    .pipe(jeditor({
      'folder': './public'
    }))
    .pipe(gulp.dest('.'));
});

gulp.task('prod', ['vulcanize', 'includes'], function(){
  return gulp.src('config.json')
    .pipe(jeditor({
      'folder': './build'
    }))
    .pipe(gulp.dest('.'));
});