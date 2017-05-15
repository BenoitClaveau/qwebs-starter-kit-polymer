const gulp = require("gulp");
const jeditor = require("gulp-json-editor");
const mergeStream = require("merge-stream");
const PolymerProject = require("polymer-build").PolymerProject;
const git = require("gulp-git");

gulp.task("polymer.build", function() {
    process.chdir("public");
    const project = new PolymerProject(require("./public/polymer.json"));
    mergeStream(project.sources(), project.dependencies())
        .pipe(project.bundler)
        .pipe(gulp.dest("../build/"))
        .on("finish", () => {
            process.chdir("./..");
        });
});

gulp.task('conig.dev', function() {
  return gulp.src('config.json')
    .pipe(jeditor({
      'folder': './public'
    }))
    .pipe(gulp.dest('.'));
});

gulp.task('config.prod', ['polymer.build'], function() {
  return gulp.src('config.json')
    .pipe(jeditor({
      'folder': './build'
    }))
    .pipe(gulp.dest('.'));
});

gulp.task("commit.prod", function() {
    const p = require("./package.json")
    const v = p.version.split(".");
    v[2] = parseInt(v[2]) + 1;
    const version = v.join(".");

    gulp.src("package.json")
        .pipe(jeditor({
            "version": version,
        }))
        .pipe(gulp.dest("."))
        .pipe(gulp.src("./*"))
            .pipe(git.add({args: "-f"}))
            .on('finish', function() {
                git.commit("version " + version)
                .on('finish', function() {
                    git.push('origin', 'master');
                });
            });
});

gulp.task("commit.dev", function() {
    gulp.src("./*")
        .pipe(git.add({args: "-f"}))
        .on('finish', function() {
            git.commit("dev")
            .on('finish', function() {
                git.push('origin', 'master');
            });
        });
});

gulp.task("dev", ["config.dev", "commit.dev"], function() {
});

gulp.task("prod", ["polymer.build", "config.prod", "commit.prod"], function() {
});