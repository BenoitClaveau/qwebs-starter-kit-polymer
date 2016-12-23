var gulp = require('gulp');
var vulcanize = require('gulp-vulcanize');
var crisper = require('gulp-crisper');
var jeditor = require("gulp-json-editor");
var path = require("path");
var minifyInline = require('gulp-minify-inline');
var rename = require("gulp-rename");
var concat = require('gulp-concat');

gulp.task('vulcanize-index', function() {
  gulp.src('public/index.html')
    .pipe(vulcanize({
      excludes: [
            '/bower_components/polymer/polymer.html'
        ],
        stripExcludes: [
            '/bower_components/polymer/polymer.html'
        ],
      abspath: path.resolve('public'),
      inputUrl: '/index.html',
      stripExcludes: false,
      inlineScripts: true,
      inlineCss: true,
      implicitStrip: true,
      stripComments: true
    }))
    .pipe(minifyInline())
    //.pipe(crisper())
    .pipe(gulp.dest('build'));
});

gulp.task('vulcanize-views', function() {
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
    .pipe(minifyInline())
    // .pipe(crisper())
    .pipe(gulp.dest("build/src"));
});

gulp.task('vulcanize-polymer', function() {
    return gulp.src([
        'public/bower_components/polymer/polymer.html',
        'public/bower_components/polymer/polymer-mini.html',
        'public/bower_components/polymer/polymer-micro.html'
    ]) 
      .pipe(concat('polymer.html'))
      .pipe(vulcanize({
          inlineScripts: true,
          inlineCss: true,
          implicitStrip: true,
          stripComments: true
      }))
      .pipe(gulp.dest('build/bower_components/polymer'));
});

gulp.task('vulcanize', ['vulcanize-polymer', 'vulcanize-index', 'vulcanize-views'], function(done) {
  done();
});

gulp.task('includes',function(){
  return gulp.src([
      'public/images/*',
      'public/manifest.json'
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